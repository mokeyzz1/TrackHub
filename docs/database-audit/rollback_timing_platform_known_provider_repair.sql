-- Exact rollback for operation 20260902_timing_platform_known_provider_repair.
-- Run only after the corresponding guarded apply has completed.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

DO $$
DECLARE
  operation CONSTANT text := '20260902_timing_platform_known_provider_repair';
  expected_rows CONSTANT integer := 1342;
  archive_rows integer;
BEGIN
  LOCK TABLE ingest.fact_cleanup_archive, public.meets IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*)::integer INTO archive_rows
    FROM ingest.fact_cleanup_archive
   WHERE operation_key = operation
     AND source_table = 'public.meets';
  IF archive_rows = 0 THEN
    RAISE NOTICE 'timing repair archive is absent; rollback is a safe no-op';
    RETURN;
  ELSIF archive_rows <> expected_rows THEN
    RAISE EXCEPTION 'timing repair rollback requires exactly %, found %', expected_rows, archive_rows;
  END IF;

  IF (SELECT count(DISTINCT source_pk)
        FROM ingest.fact_cleanup_archive
       WHERE operation_key = operation AND source_table = 'public.meets') <> expected_rows THEN
    RAISE EXCEPTION 'timing repair rollback archive contains duplicate meet ids';
  END IF;

  CREATE TEMP TABLE _timing_platform_repair_rollback ON COMMIT DROP AS
  SELECT
    (a.row_data->>'meet_id')::integer AS meet_id,
    a.row_data->>'timing_platform' AS original_timing_platform,
    (a.row_data->>'updated_at')::timestamptz AS original_updated_at
  FROM ingest.fact_cleanup_archive a
  WHERE a.operation_key = operation
    AND a.source_table = 'public.meets';

  -- Fail closed if a caller tries to roll back after unrelated edits. With the archive still
  -- present, the only accepted current state is the known-provider value derived from its URL.
  IF EXISTS (
    SELECT 1
      FROM ingest.fact_cleanup_archive a
      JOIN public.meets m ON m.meet_id = (a.row_data->>'meet_id')::integer
     WHERE a.operation_key = operation
       AND a.source_table = 'public.meets'
       AND m.timing_platform IS DISTINCT FROM (
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
         END
       )
  ) THEN
    RAISE EXCEPTION 'timing repair rollback found an unexpected current platform';
  END IF;

  -- The trigger always replaces updated_at. Disable only within this transaction so the archived
  -- before-image can be restored exactly.
  ALTER TABLE public.meets DISABLE TRIGGER update_meets_updated_at;
  UPDATE public.meets m
     SET timing_platform = r.original_timing_platform,
         updated_at = r.original_updated_at
    FROM _timing_platform_repair_rollback r
   WHERE m.meet_id = r.meet_id;
  ALTER TABLE public.meets ENABLE TRIGGER update_meets_updated_at;

  IF EXISTS (
    SELECT 1
      FROM _timing_platform_repair_rollback r
      JOIN public.meets m USING (meet_id)
     WHERE m.timing_platform IS DISTINCT FROM r.original_timing_platform
        OR m.updated_at IS DISTINCT FROM r.original_updated_at
  ) THEN
    RAISE EXCEPTION 'timing repair rollback did not restore the before-image exactly';
  END IF;

  DELETE FROM ingest.fact_cleanup_archive
   WHERE operation_key = operation AND source_table = 'public.meets';
  RAISE NOTICE 'timing repair rollback restored % rows', expected_rows;
END $$;

COMMIT;
