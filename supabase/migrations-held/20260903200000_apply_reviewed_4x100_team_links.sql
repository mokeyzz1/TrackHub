-- Apply only the 24 rows in the reviewed Outdoor 2026 4x100 exact-round approval packet.
-- This migration creates no table. It archives each original relay row, updates only rows whose
-- team_id is still NULL, and is replay-safe after a completed run.

DO $$
DECLARE
  operation constant text := '20260903_reviewed_4x100_team_links';
  target_count integer;
  archive_count integer;
  updated_count integer;
BEGIN
  DROP TABLE IF EXISTS _reviewed_4x100_team_links;
  CREATE TEMP TABLE _reviewed_4x100_team_links (
    meet_id integer NOT NULL,
    relay_result_id bigint PRIMARY KEY,
    proposed_team_id integer NOT NULL,
    original_row jsonb NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _reviewed_4x100_team_links (meet_id, relay_result_id, proposed_team_id, original_row)
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
     GROUP BY b.meet_id, b.relay_result_id, rr.mark_raw, rr.mark_seconds, rr.place, rr.round, rr
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
           l.mark_seconds,
           l.round AS local_round,
           l.original_row,
           (s.source_row->>'team_id')::integer AS source_team_id,
           s.source_row->>'mark_raw' AS source_mark,
           s.source_row->>'mark_seconds' AS source_mark_seconds,
           s.source_row->>'round' AS source_round
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
               CASE
                 WHEN c.mark_seconds IS NOT NULL
                  AND (c.source_mark_seconds)::numeric = c.mark_seconds THEN 4
                 WHEN regexp_replace(c.local_mark, '[^0-9:.]', '', 'g')
                    = regexp_replace(c.source_mark, '[^0-9:.]', '', 'g') THEN 4
                 ELSE 0
               END
               + CASE WHEN lower(c.local_round) = lower(c.source_round) THEN 2 ELSE 0 END
               + CASE WHEN c.source_team_id IS NOT NULL THEN 1 ELSE 0 END DESC,
               c.source_team_id
           ) AS candidate_rank
      FROM candidate_rows c
  ),
  verified AS (
    SELECT r.*
      FROM ranked r
      JOIN public.teams t ON t.team_id = r.source_team_id
     WHERE r.candidate_rank = 1
       AND t.is_active IS DISTINCT FROM false
       AND r.source_team_id IS NOT NULL
       AND (
         (r.mark_seconds IS NOT NULL AND (r.source_mark_seconds)::numeric = r.mark_seconds)
         OR regexp_replace(r.local_mark, '[^0-9:.]', '', 'g')
            = regexp_replace(r.source_mark, '[^0-9:.]', '', 'g')
       )
       AND lower(r.local_round) = lower(r.source_round)
  )
  SELECT meet_id, relay_result_id, source_team_id, original_row
    FROM verified;

  SELECT count(*) INTO target_count FROM _reviewed_4x100_team_links;
  SELECT count(*) INTO archive_count
    FROM ingest.fact_cleanup_archive
   WHERE operation_key = operation;

  -- A completed migration is a safe replay no-op.
  IF target_count = 0 THEN
    IF archive_count = 24
       AND (SELECT count(*)
              FROM public.relay_results rr
              JOIN ingest.fact_cleanup_archive a
                ON a.operation_key = operation
               AND a.source_table = 'public.relay_results'
               AND a.source_pk = rr.relay_result_id::text
             WHERE rr.team_id IS NOT NULL) = 24 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'reviewed 4x100 links are absent but completed state is invalid';
  END IF;

  IF target_count <> 24 THEN
    RAISE EXCEPTION 'expected 24 exact-round reviewed links, found %', target_count;
  END IF;
  IF archive_count <> 0 THEN
    RAISE EXCEPTION 'operation archive is partially populated (%)', archive_count;
  END IF;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.relay_results', relay_result_id::text, original_row
    FROM _reviewed_4x100_team_links;

  UPDATE public.relay_results rr
     SET team_id = links.proposed_team_id
    FROM _reviewed_4x100_team_links links
   WHERE rr.relay_result_id = links.relay_result_id
     AND rr.meet_id = links.meet_id
     AND rr.team_id IS NULL;
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count <> 24 THEN
    RAISE EXCEPTION 'expected 24 guarded team updates, applied %', updated_count;
  END IF;
  IF (SELECT count(*)
        FROM public.relay_results rr
        JOIN _reviewed_4x100_team_links links ON links.relay_result_id = rr.relay_result_id
       WHERE rr.team_id IS DISTINCT FROM links.proposed_team_id) <> 0 THEN
    RAISE EXCEPTION 'reviewed 4x100 team links did not reach the expected state';
  END IF;
END
$$;
