-- Exact emergency rollback for operation 20260904_consolidate_exact_conference_duplicates_v1.
-- Reinserts all removed conferences and restores the seven original school references.
-- The schools updated_at trigger intentionally records rollback time.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP INDEX IF EXISTS public.idx_external_ids_conference_id;
DROP INDEX IF EXISTS public.idx_conference_memberships_conference_id;
DROP INDEX IF EXISTS public.conferences_normalized_name_uidx;

DO $$
DECLARE
  operation constant text := '20260904_consolidate_exact_conference_duplicates_v1';
  expected_duplicates constant integer := 917;
  expected_school_rewires constant integer := 7;
  restored_school_count integer;
BEGIN
  IF (SELECT count(*) FROM ingest.fact_cleanup_archive
      WHERE operation_key = operation
        AND source_table = 'public.conferences.duplicate') <> expected_duplicates
     OR (SELECT count(*) FROM ingest.fact_cleanup_archive
         WHERE operation_key = operation
           AND source_table = 'public.schools.current_conference') <> expected_school_rewires THEN
    RAISE EXCEPTION 'complete conference cleanup archive is required for rollback';
  END IF;

  IF (SELECT count(*) FROM public.conferences) <> 197 THEN
    RAISE EXCEPTION 'rollback expected the consolidated 197-row conference state';
  END IF;

  INSERT INTO public.conferences
  SELECT (jsonb_populate_record(NULL::public.conferences, a.row_data)).*
  FROM ingest.fact_cleanup_archive a
  WHERE a.operation_key = operation
    AND a.source_table = 'public.conferences.duplicate'
  ORDER BY a.source_pk::bigint;

  UPDATE public.schools s
  SET current_conference_id = (a.row_data->>'current_conference_id')::bigint
  FROM ingest.fact_cleanup_archive a
  WHERE a.operation_key = operation
    AND a.source_table = 'public.schools.current_conference'
    AND s.school_id = a.source_pk::bigint;

  GET DIAGNOSTICS restored_school_count = ROW_COUNT;
  IF restored_school_count <> expected_school_rewires THEN
    RAISE EXCEPTION 'expected % restored school references, updated %',
      expected_school_rewires, restored_school_count;
  END IF;

  PERFORM setval(
    pg_get_serial_sequence('public.conferences', 'conference_id'),
    (SELECT max(conference_id) FROM public.conferences),
    true
  );

  IF (SELECT count(*) FROM public.conferences) <> 1114
     OR (SELECT count(DISTINCT name) FROM public.conferences) <> 197
     OR EXISTS (
       SELECT 1
       FROM ingest.fact_cleanup_archive a
       JOIN public.schools s ON s.school_id = a.source_pk::bigint
       WHERE a.operation_key = operation
         AND a.source_table = 'public.schools.current_conference'
         AND s.current_conference_id IS DISTINCT FROM
             (a.row_data->>'current_conference_id')::bigint
     ) THEN
    RAISE EXCEPTION 'conference rollback postcondition failed';
  END IF;

  RAISE NOTICE 'restored % duplicate conference rows and % original school references',
    expected_duplicates, expected_school_rewires;
END
$$;

COMMIT;
