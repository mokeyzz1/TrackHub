-- Exact rollback for operation 20260904_classify_all_other_schools_v1.
-- Restores the classification fields touched by the migration and removes new division rows
-- only when nothing references them. The existing schools trigger intentionally records the
-- rollback time in updated_at instead of allowing that audit timestamp to move backwards.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  operation constant text := '20260904_classify_all_other_schools_v1';
  expected_count constant integer := 128;
  restored_count integer;
BEGIN
  CREATE TEMP TABLE _school_classification_rollback ON COMMIT DROP AS
  SELECT (jsonb_populate_record(NULL::public.schools, a.row_data)).*
  FROM ingest.fact_cleanup_archive a
  WHERE a.operation_key = operation
    AND a.source_table = 'public.schools';

  IF (SELECT count(*) FROM _school_classification_rollback) <> expected_count THEN
    RAISE EXCEPTION 'rollback requires exactly % archived school before-images', expected_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _school_classification_rollback r
    LEFT JOIN public.schools s USING (school_id)
    WHERE s.school_id IS NULL
  ) THEN
    RAISE EXCEPTION 'rollback found a missing classified school';
  END IF;

  UPDATE public.schools s
  SET division = r.division,
      division_id = r.division_id
  FROM _school_classification_rollback r
  WHERE s.school_id = r.school_id;

  GET DIAGNOSTICS restored_count = ROW_COUNT;
  IF restored_count <> expected_count THEN
    RAISE EXCEPTION 'expected % restored schools, updated %', expected_count, restored_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _school_classification_rollback r
    JOIN public.schools s USING (school_id)
    WHERE s.division IS DISTINCT FROM r.division
       OR s.division_id IS DISTINCT FROM r.division_id
  ) THEN
    RAISE EXCEPTION 'rollback did not restore every touched school field exactly';
  END IF;
END
$$;

DELETE FROM public.divisions d
WHERE d.code IN ('USPORTS', 'USCAA', 'NCCAA-I', 'NCCAA-II', 'LAI')
  AND NOT EXISTS (SELECT 1 FROM public.schools s WHERE s.division_id = d.division_id)
  AND NOT EXISTS (SELECT 1 FROM public.conferences c WHERE c.division_id = d.division_id);

COMMIT;
