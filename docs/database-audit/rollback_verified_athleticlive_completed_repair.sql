-- Exact rollback for 20260902_timing_platform_verified_athleticlive_completed_repair.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

DO $$
DECLARE
  operation CONSTANT text := '20260902_timing_platform_verified_athleticlive_completed_repair';
  expected_rows CONSTANT integer := 96;
  archive_rows integer;
BEGIN
  LOCK TABLE ingest.fact_cleanup_archive, public.meets IN SHARE ROW EXCLUSIVE MODE;
  SELECT count(*)::integer INTO archive_rows
    FROM ingest.fact_cleanup_archive
   WHERE operation_key = operation AND source_table = 'public.meets';
  IF archive_rows = 0 THEN
    RAISE NOTICE 'verified AthleticLIVE archive is absent; rollback is a safe no-op';
    RETURN;
  ELSIF archive_rows <> expected_rows THEN
    RAISE EXCEPTION 'verified AthleticLIVE rollback requires exactly %, found %', expected_rows, archive_rows;
  END IF;
  IF (SELECT count(DISTINCT source_pk) FROM ingest.fact_cleanup_archive
       WHERE operation_key = operation AND source_table = 'public.meets') <> expected_rows THEN
    RAISE EXCEPTION 'verified AthleticLIVE rollback archive contains duplicate meet ids';
  END IF;

  CREATE TEMP TABLE _verified_athleticlive_repair_rollback ON COMMIT DROP AS
  SELECT (a.row_data->>'meet_id')::integer AS meet_id,
         a.row_data->>'timing_platform' AS original_timing_platform,
         (a.row_data->>'updated_at')::timestamptz AS original_updated_at
    FROM ingest.fact_cleanup_archive a
   WHERE a.operation_key = operation AND a.source_table = 'public.meets';
  IF EXISTS (
    SELECT 1
      FROM _verified_athleticlive_repair_rollback r
      LEFT JOIN public.meets m USING (meet_id)
     WHERE m.meet_id IS NULL OR m.timing_platform IS DISTINCT FROM 'athletic_net'
  ) THEN
    RAISE EXCEPTION 'verified AthleticLIVE rollback found an unexpected current platform or missing meet';
  END IF;

  ALTER TABLE public.meets DISABLE TRIGGER update_meets_updated_at;
  UPDATE public.meets m
     SET timing_platform = r.original_timing_platform,
         updated_at = r.original_updated_at
    FROM _verified_athleticlive_repair_rollback r
   WHERE m.meet_id = r.meet_id;
  ALTER TABLE public.meets ENABLE TRIGGER update_meets_updated_at;
  IF EXISTS (
    SELECT 1
      FROM _verified_athleticlive_repair_rollback r
      JOIN public.meets m USING (meet_id)
     WHERE m.timing_platform IS DISTINCT FROM r.original_timing_platform
        OR m.updated_at IS DISTINCT FROM r.original_updated_at
  ) THEN
    RAISE EXCEPTION 'verified AthleticLIVE rollback did not restore the before-image exactly';
  END IF;
  DELETE FROM ingest.fact_cleanup_archive
   WHERE operation_key = operation AND source_table = 'public.meets';
  RAISE NOTICE 'verified AthleticLIVE rollback restored % rows', expected_rows;
END $$;

COMMIT;
