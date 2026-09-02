-- Read-only review query for broken local 4x100 relay rows that may have a source lineup match.
-- It never updates queue, public, or ingest tables.

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
         COALESCE(
           jsonb_agg(lower(trim(ra.athlete_name)) ORDER BY ra.leg_order)
             FILTER (WHERE ra.relay_athlete_id IS NOT NULL),
           '[]'::jsonb
         ) AS lineup_names
    FROM broken b
    JOIN public.relay_results rr ON rr.relay_result_id = b.relay_result_id
    LEFT JOIN public.relay_athletes ra ON ra.relay_result_id = rr.relay_result_id
   GROUP BY b.meet_id, b.relay_result_id, rr.mark_raw, rr.mark_seconds, rr.place, rr.round
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
matches AS (
  SELECT l.meet_id,
         l.relay_result_id,
         l.mark_raw AS local_mark,
         l.round AS local_round,
         l.place AS local_place,
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
)
SELECT m.meet_id,
       meets.name AS meet_name,
       m.relay_result_id,
       m.local_mark,
       m.local_round,
       m.local_place,
       m.source_team,
       m.source_team_id,
       m.source_mark,
       m.source_round,
       m.mark_check,
       m.round_check
  FROM matches m
  JOIN public.meets meets ON meets.meet_id = m.meet_id
 ORDER BY m.meet_id, m.relay_result_id, m.source_mark;
