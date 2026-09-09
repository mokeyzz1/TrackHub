-- Guarded, reversible timing-platform repair proposal.
--
-- This is intentionally kept under docs/database-audit until the owner approves the exact
-- 1,342-row scope. It reuses ingest.fact_cleanup_archive and creates no persistent table.
-- Do not run against production without explicit approval.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

DO $$
DECLARE
  operation CONSTANT text := '20260902_timing_platform_known_provider_repair';
  expected_rows CONSTANT integer := 1342;
  expected_fingerprint CONSTANT text := '5f860770aa852c58deb0da12addd63f7';
  archive_rows integer;
  candidate_rows integer;
  updated_rows integer;
  candidate_fingerprint text;
BEGIN
  LOCK TABLE ingest.fact_cleanup_archive, public.meets IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*)::integer INTO archive_rows
    FROM ingest.fact_cleanup_archive
   WHERE operation_key = operation;

  IF archive_rows = expected_rows THEN
    -- A complete archive means the operation was already applied. Verify the archived set and
    -- current values before treating this as a replay-safe no-op.
    CREATE TEMP TABLE _timing_platform_repair_replay ON COMMIT DROP AS
    SELECT
      (a.row_data->>'meet_id')::integer AS meet_id,
      CASE
        WHEN a.row_data->>'meet_url' LIKE '%athletic.net%'
          OR a.row_data->>'meet_url' LIKE '%jdlfasttrack%'
          OR a.row_data->>'meet_url' LIKE '%blacksquirrel%' THEN 'athletic_net'
        WHEN a.row_data->>'meet_url' LIKE '%milesplit%' THEN 'milesplit'
        WHEN a.row_data->>'meet_url' LIKE '%pttiming%' THEN 'pt_timing'
        WHEN a.row_data->>'meet_url' LIKE '%finishtiming%'
          OR a.row_data->>'meet_url' LIKE '%finishlynx%' THEN 'finish_timing'
        WHEN a.row_data->>'meet_url' LIKE '%tfrrs%' THEN 'tfrrs'
        WHEN a.row_data->>'meet_url' LIKE '%flashresults%' THEN 'flashresults'
        WHEN a.row_data->>'meet_url' LIKE '%rosterathletics%' THEN 'rosterathletics'
        WHEN a.row_data->>'meet_url' LIKE '%xpresstiming%' THEN 'xpresstiming'
        WHEN a.row_data->>'meet_url' LIKE '%halfmiletiming%' THEN 'halfmiletiming'
        WHEN a.row_data->>'meet_url' LIKE '%windsortiming%' THEN 'windsortiming'
        WHEN a.row_data->>'meet_url' LIKE '%leonetiming%' THEN 'leonetiming'
        WHEN a.row_data->>'meet_url' LIKE '%wayzatatiming%' THEN 'wayzatatiming'
        WHEN a.row_data->>'meet_url' LIKE '%deltatiming%' THEN 'deltatiming'
        WHEN a.row_data->>'meet_url' LIKE '%lexicontiming%' THEN 'lexicontiming'
        WHEN a.row_data->>'meet_url' LIKE '%herostiming%' THEN 'herostiming'
        WHEN a.row_data->>'meet_url' LIKE '%omegatiming%' THEN 'omegatiming'
        WHEN a.row_data->>'meet_url' LIKE '%domtel-sport%' THEN 'domtel'
        WHEN a.row_data->>'meet_url' LIKE '%liveres.%' THEN 'live_results'
        WHEN a.row_data->>'meet_url' LIKE '%timing%' THEN 'other_timing'
        ELSE 'other'
      END AS projected_timing_platform
    FROM ingest.fact_cleanup_archive a
    WHERE a.operation_key = operation
      AND a.source_table = 'public.meets';

    SELECT count(*)::integer,
           md5(string_agg(meet_id::text || ':' || projected_timing_platform, ',' ORDER BY meet_id))
      INTO candidate_rows, candidate_fingerprint
      FROM _timing_platform_repair_replay;
    IF candidate_rows <> expected_rows OR candidate_fingerprint <> expected_fingerprint THEN
      RAISE EXCEPTION 'timing repair archive fingerprint mismatch';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM _timing_platform_repair_replay r
        LEFT JOIN public.meets m ON m.meet_id = r.meet_id
       WHERE m.meet_id IS NULL
          OR m.timing_platform IS DISTINCT FROM r.projected_timing_platform
    ) THEN
      RAISE EXCEPTION 'timing repair archive exists but applied postcondition is not satisfied';
    END IF;
    RAISE NOTICE 'timing repair already applied; verified % rows', expected_rows;
    RETURN;
  ELSIF archive_rows <> 0 THEN
    RAISE EXCEPTION 'timing repair archive is partial: expected 0 or %, found %',
      expected_rows, archive_rows;
  END IF;

  CREATE TEMP TABLE _timing_platform_repair_candidates ON COMMIT DROP AS
  SELECT x.*
  FROM (
    SELECT
      m.meet_id,
      m.meet_url,
      m.timing_platform AS stored_timing_platform,
      CASE
        WHEN m.meet_url LIKE '%athletic.net%'
          OR m.meet_url LIKE '%jdlfasttrack%'
          OR m.meet_url LIKE '%blacksquirrel%' THEN 'athletic_net'
        WHEN m.meet_url LIKE '%milesplit%' THEN 'milesplit'
        WHEN m.meet_url LIKE '%pttiming%' THEN 'pt_timing'
        WHEN m.meet_url LIKE '%finishtiming%'
          OR m.meet_url LIKE '%finishlynx%' THEN 'finish_timing'
        WHEN m.meet_url LIKE '%tfrrs%' THEN 'tfrrs'
        WHEN m.meet_url LIKE '%flashresults%' THEN 'flashresults'
        WHEN m.meet_url LIKE '%rosterathletics%' THEN 'rosterathletics'
        WHEN m.meet_url LIKE '%xpresstiming%' THEN 'xpresstiming'
        WHEN m.meet_url LIKE '%halfmiletiming%' THEN 'halfmiletiming'
        WHEN m.meet_url LIKE '%windsortiming%' THEN 'windsortiming'
        WHEN m.meet_url LIKE '%leonetiming%' THEN 'leonetiming'
        WHEN m.meet_url LIKE '%wayzatatiming%' THEN 'wayzatatiming'
        WHEN m.meet_url LIKE '%deltatiming%' THEN 'deltatiming'
        WHEN m.meet_url LIKE '%lexicontiming%' THEN 'lexicontiming'
        WHEN m.meet_url LIKE '%herostiming%' THEN 'herostiming'
        WHEN m.meet_url LIKE '%omegatiming%' THEN 'omegatiming'
        WHEN m.meet_url LIKE '%domtel-sport%' THEN 'domtel'
        WHEN m.meet_url LIKE '%liveres.%' THEN 'live_results'
        WHEN m.meet_url LIKE '%timing%' THEN 'other_timing'
        ELSE 'other'
      END AS projected_timing_platform
    FROM public.meets m
    WHERE m.meet_url IS NOT NULL
      AND (m.timing_platform IS NULL OR m.timing_platform IN ('other', 'other_timing'))
  ) x
  WHERE x.projected_timing_platform NOT IN ('other', 'other_timing');

  SELECT count(*)::integer,
         md5(string_agg(meet_id::text || ':' || projected_timing_platform, ',' ORDER BY meet_id))
    INTO candidate_rows, candidate_fingerprint
    FROM _timing_platform_repair_candidates;
  IF candidate_rows <> expected_rows OR candidate_fingerprint <> expected_fingerprint THEN
    RAISE EXCEPTION 'timing repair candidate set changed: rows %, fingerprint %',
      candidate_rows, candidate_fingerprint;
  END IF;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.meets', m.meet_id::text, to_jsonb(m)
    FROM public.meets m
    JOIN _timing_platform_repair_candidates c USING (meet_id);

  IF (SELECT count(*) FROM ingest.fact_cleanup_archive WHERE operation_key = operation) <> expected_rows
     OR (SELECT count(DISTINCT source_pk) FROM ingest.fact_cleanup_archive WHERE operation_key = operation)
        <> expected_rows THEN
    RAISE EXCEPTION 'timing repair archive is incomplete or duplicated';
  END IF;

  UPDATE public.meets m
     SET timing_platform = c.projected_timing_platform
    FROM _timing_platform_repair_candidates c
   WHERE m.meet_id = c.meet_id
     AND m.timing_platform IS NOT DISTINCT FROM c.stored_timing_platform;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  IF updated_rows <> expected_rows THEN
    RAISE EXCEPTION 'timing repair updated %, expected %', updated_rows, expected_rows;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM _timing_platform_repair_candidates c
      JOIN public.meets m USING (meet_id)
     WHERE m.timing_platform IS DISTINCT FROM c.projected_timing_platform
  ) THEN
    RAISE EXCEPTION 'timing repair postcondition failed';
  END IF;
  RAISE NOTICE 'timing repair applied to % known-provider rows', expected_rows;
END $$;

COMMIT;
