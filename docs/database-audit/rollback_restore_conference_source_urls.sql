-- Exact emergency rollback for operation 20260904_restore_conference_source_urls_v1.
-- Restores only the conference website field. The updated_at trigger records rollback time.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
  operation constant text := '20260904_restore_conference_source_urls_v1';
  expected_count constant integer := 32;
  restored_count integer;
BEGIN
  IF (SELECT count(*) FROM ingest.fact_cleanup_archive
      WHERE operation_key = operation
        AND source_table = 'public.conferences') <> expected_count THEN
    RAISE EXCEPTION 'complete % row conference URL archive is required', expected_count;
  END IF;

  UPDATE public.conferences c
  SET website = a.row_data->>'website'
  FROM ingest.fact_cleanup_archive a
  WHERE a.operation_key = operation
    AND a.source_table = 'public.conferences'
    AND c.conference_id = a.source_pk::bigint;

  GET DIAGNOSTICS restored_count = ROW_COUNT;
  IF restored_count <> expected_count THEN
    RAISE EXCEPTION 'expected % restored conference rows, updated %',
      expected_count, restored_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM ingest.fact_cleanup_archive a
    JOIN public.conferences c ON c.conference_id = a.source_pk::bigint
    WHERE a.operation_key = operation
      AND a.source_table = 'public.conferences'
      AND c.website IS DISTINCT FROM a.row_data->>'website'
  ) THEN
    RAISE EXCEPTION 'conference URL rollback postcondition failed';
  END IF;

  RAISE NOTICE 'restored % prior conference website values', expected_count;
END
$$;

COMMIT;
