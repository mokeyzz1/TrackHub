-- Dry-run only. Produces reversible team-link proposals for broken local 4x100 relays.
-- It does not INSERT into ingest.fact_cleanup_archive and does not UPDATE public.relay_results.

WITH broken AS (
  SELECT q.meet_id,
         (a->>'local_relay_result_id')::bigint AS relay_result_id
    FROM ingest.event_recovery_queue q
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(q.source_candidates->'reconciliation'->'actions', '[]'::jsonb)
    ) a
   WHERE q.scope_key = 'outdoor-2026-4x100-source-reconciliation-v1'
     AND a->>'reason' = 'local_result_has_broken_team_identity'
     AND a->>'local_relay_result_id' IS NOT NULL
),
local_rows AS (
  SELECT b.meet_id,
         b.relay_result_id,
         rr.mark_raw,
         rr.mark_seconds,
         rr.place,
         rr.round,
         to_jsonb(rr) AS original_row,
         COALESCE(
           jsonb_agg(lower(trim(ra.athlete_name)) ORDER BY ra.leg_order)
             FILTER (WHERE ra.relay_athlete_id IS NOT NULL),
           '[]'::jsonb
         ) AS lineup_names
    FROM broken b
    JOIN public.relay_results rr ON rr.relay_result_id = b.relay_result_id
    LEFT JOIN public.relay_athletes ra ON ra.relay_result_id = rr.relay_result_id
   WHERE rr.team_id IS NULL
   GROUP BY b.meet_id, b.relay_result_id, rr.mark_raw, rr.mark_seconds,
            rr.place, rr.round, rr
),
source_rows AS (
  SELECT q.meet_id,
         x AS source_row,
         COALESCE(
           (
             SELECT jsonb_agg(lower(trim(leg->>'athlete_name')) ORDER BY (leg->>'leg_order')::int)
               FROM jsonb_array_elements(x->'relay_athletes') leg
           ),
           '[]'::jsonb
         ) AS lineup_names
    FROM ingest.event_recovery_queue q
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(q.source_candidates->'reconciliation'->'diff'->'missing', '[]'::jsonb)
    ) x
   WHERE q.scope_key = 'outdoor-2026-4x100-source-reconciliation-v1'
),
candidate_rows AS (
  SELECT l.meet_id,
         l.relay_result_id,
         l.mark_raw AS local_mark,
         l.round AS local_round,
         l.place AS local_place,
         l.original_row,
         s.source_row->>'team_name' AS source_team,
         (s.source_row->>'team_id')::bigint AS source_team_id,
         s.source_row->>'mark_raw' AS source_mark,
         s.source_row->>'round' AS source_round,
         CASE
           WHEN l.mark_seconds IS NOT NULL
            AND (s.source_row->>'mark_seconds')::numeric = l.mark_seconds
             THEN 'mark_equal'
           WHEN regexp_replace(l.mark_raw, '[^0-9:.]', '', 'g')
              = regexp_replace(s.source_row->>'mark_raw', '[^0-9:.]', '', 'g')
             THEN 'mark_text_equal_after_suffix'
           ELSE 'mark_diff'
         END AS mark_check,
         CASE
           WHEN NULLIF(l.round, '') IS NULL THEN 'local_round_missing'
           WHEN lower(l.round) = lower(s.source_row->>'round') THEN 'round_equal'
           ELSE 'round_diff'
         END AS round_check
    FROM local_rows l
    JOIN source_rows s
      ON s.meet_id = l.meet_id
     AND s.lineup_names = l.lineup_names
   WHERE jsonb_array_length(l.lineup_names) > 0
),
ranked AS (
  SELECT c.*,
         row_number() OVER (
           PARTITION BY c.meet_id, c.relay_result_id
           ORDER BY
             CASE WHEN c.mark_check IN ('mark_equal', 'mark_text_equal_after_suffix') THEN 4 ELSE 0 END
             + CASE WHEN c.round_check = 'round_equal' THEN 2 ELSE 0 END
             + CASE WHEN c.source_team_id IS NOT NULL THEN 1 ELSE 0 END DESC,
             c.source_team_id
         ) AS candidate_rank,
         count(*) OVER (PARTITION BY c.meet_id, c.relay_result_id) AS candidate_count
    FROM candidate_rows c
),
verified AS (
  SELECT r.*,
         t.team_id IS NOT NULL AND t.is_active IS DISTINCT FROM false AS canonical_team_active
    FROM ranked r
    LEFT JOIN public.teams t ON t.team_id = r.source_team_id
   WHERE r.candidate_rank = 1
)
SELECT v.meet_id,
       meets.name AS meet_name,
       v.relay_result_id,
       v.local_mark,
       v.local_round,
       v.local_place,
       v.source_team,
       v.source_team_id AS proposed_team_id,
       v.source_mark,
       v.source_round,
       v.mark_check,
       v.round_check,
       v.candidate_count,
       CASE
         WHEN NOT v.canonical_team_active THEN 'hold_team_not_canonical'
         WHEN v.mark_check NOT IN ('mark_equal', 'mark_text_equal_after_suffix') THEN 'hold_mark_mismatch'
         WHEN v.round_check = 'round_equal' THEN 'review_ready_exact_round'
         WHEN v.round_check = 'local_round_missing' THEN 'hold_round_confirmation'
         ELSE 'hold_round_mismatch'
       END AS plan_status,
       '20260902_review_4x100_team_links' AS archive_operation_key,
       'public.relay_results' AS archive_source_table,
       v.relay_result_id::text AS archive_source_pk,
       v.original_row AS archive_row_data,
       format(
         'UPDATE public.relay_results SET team_id = %s WHERE relay_result_id = %s AND team_id IS NULL;',
         v.source_team_id,
         v.relay_result_id
       ) AS guarded_update_sql
  FROM verified v
  JOIN public.meets meets ON meets.meet_id = v.meet_id
 ORDER BY v.meet_id, v.relay_result_id;
