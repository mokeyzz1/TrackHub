-- Guarded, reversible repair proposal for completed AthleticLIVE (.anet.live) meets.
-- This creates no table and is not a production migration. Run only after explicit approval.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

DO $$
DECLARE
  operation CONSTANT text := '20260902_timing_platform_anet_live_completed_repair';
  expected_rows CONSTANT integer := 16;
  expected_fingerprint CONSTANT text := 'cb2a8186d5d6392b96b9cbccd49703eb';
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
    CREATE TEMP TABLE _anet_live_repair_replay ON COMMIT DROP AS
    SELECT
      (a.row_data->>'meet_id')::integer AS meet_id,
      a.row_data->>'timing_platform' AS original_timing_platform
    FROM ingest.fact_cleanup_archive a
    WHERE a.operation_key = operation
      AND a.source_table = 'public.meets';

    SELECT count(*)::integer,
           md5(string_agg(meet_id::text || ':athletic_net', ',' ORDER BY meet_id))
      INTO candidate_rows, candidate_fingerprint
      FROM _anet_live_repair_replay;
    IF candidate_rows <> expected_rows OR candidate_fingerprint <> expected_fingerprint THEN
      RAISE EXCEPTION 'anet.live repair archive fingerprint mismatch';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM _anet_live_repair_replay r
        LEFT JOIN public.meets m USING (meet_id)
       WHERE m.meet_id IS NULL OR m.timing_platform IS DISTINCT FROM 'athletic_net'
    ) THEN
      RAISE EXCEPTION 'anet.live repair archive exists but applied postcondition is not satisfied';
    END IF;
    RAISE NOTICE 'anet.live repair already applied; verified % rows', expected_rows;
    RETURN;
  ELSIF archive_rows <> 0 THEN
    RAISE EXCEPTION 'anet.live repair archive is partial: expected 0 or %, found %',
      expected_rows, archive_rows;
  END IF;

  CREATE TEMP TABLE _anet_live_repair_candidates ON COMMIT DROP AS
  SELECT m.meet_id, m.meet_url, m.timing_platform AS stored_timing_platform
    FROM public.meets m
   WHERE m.status = 'completed'
     AND m.meet_url IS NOT NULL
     AND lower(split_part(regexp_replace(m.meet_url, '^https?://', ''), '/', 1)) LIKE '%.anet.live'
     AND (m.timing_platform IS NULL OR m.timing_platform IN ('other', 'other_timing'));

  SELECT count(*)::integer,
         md5(string_agg(meet_id::text || ':athletic_net', ',' ORDER BY meet_id))
    INTO candidate_rows, candidate_fingerprint
    FROM _anet_live_repair_candidates;
  IF candidate_rows <> expected_rows OR candidate_fingerprint <> expected_fingerprint THEN
    RAISE EXCEPTION 'anet.live candidate set changed: rows %, fingerprint %',
      candidate_rows, candidate_fingerprint;
  END IF;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.meets', m.meet_id::text, to_jsonb(m)
    FROM public.meets m
    JOIN _anet_live_repair_candidates c USING (meet_id);

  IF (SELECT count(*) FROM ingest.fact_cleanup_archive WHERE operation_key = operation) <> expected_rows
     OR (SELECT count(DISTINCT source_pk) FROM ingest.fact_cleanup_archive WHERE operation_key = operation)
        <> expected_rows THEN
    RAISE EXCEPTION 'anet.live repair archive is incomplete or duplicated';
  END IF;

  UPDATE public.meets m
     SET timing_platform = 'athletic_net'
    FROM _anet_live_repair_candidates c
   WHERE m.meet_id = c.meet_id
     AND m.timing_platform IS NOT DISTINCT FROM c.stored_timing_platform;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  IF updated_rows <> expected_rows THEN
    RAISE EXCEPTION 'anet.live repair updated %, expected %', updated_rows, expected_rows;
  END IF;

  IF EXISTS (
    SELECT 1 FROM _anet_live_repair_candidates c
    JOIN public.meets m USING (meet_id)
    WHERE m.timing_platform IS DISTINCT FROM 'athletic_net'
  ) THEN
    RAISE EXCEPTION 'anet.live repair postcondition failed';
  END IF;
  RAISE NOTICE 'anet.live repair applied to % completed rows', expected_rows;
END $$;

COMMIT;
