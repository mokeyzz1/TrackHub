-- Emergency rollback for operation 20260904_reconcile_primary_conference_catalog_v1.
-- Restores all 197 conference rows and every affected school affiliation/lifecycle value.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  operation constant text := '20260904_reconcile_primary_conference_catalog_v1';
  expected_deleted_conferences constant integer := 79;
  expected_updated_conferences constant integer := 23;
  expected_affected_schools constant integer := 102;
  restored_count integer;
BEGIN
  LOCK TABLE public.conferences IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.schools IN SHARE ROW EXCLUSIVE MODE;

  IF (SELECT count(*) FROM ingest.fact_cleanup_archive
      WHERE operation_key = operation
        AND source_table = 'public.conferences.deleted') <> expected_deleted_conferences
     OR (SELECT count(*) FROM ingest.fact_cleanup_archive
         WHERE operation_key = operation
           AND source_table = 'public.conferences.updated') <> expected_updated_conferences
     OR (SELECT count(*) FROM ingest.fact_cleanup_archive
         WHERE operation_key = operation
           AND source_table = 'public.schools.affiliation') <> expected_affected_schools THEN
    RAISE EXCEPTION 'complete conference reconciliation archive is required for rollback';
  END IF;

  IF (SELECT count(*) FROM public.conferences) <> 118 THEN
    RAISE EXCEPTION 'rollback expected the reconciled 118-row conference state';
  END IF;

  INSERT INTO public.conferences
  SELECT (jsonb_populate_record(NULL::public.conferences, a.row_data)).*
  FROM ingest.fact_cleanup_archive a
  WHERE a.operation_key = operation
    AND a.source_table = 'public.conferences.deleted'
  ORDER BY a.source_pk::bigint;

  GET DIAGNOSTICS restored_count = ROW_COUNT;
  IF restored_count <> expected_deleted_conferences THEN
    RAISE EXCEPTION 'expected % reinserted conferences, restored %',
      expected_deleted_conferences, restored_count;
  END IF;

  UPDATE public.conferences c
  SET name = a.row_data->>'name',
      abbreviation = a.row_data->>'abbreviation',
      division = a.row_data->>'division',
      region = a.row_data->>'region',
      website = a.row_data->>'website',
      division_id = (a.row_data->>'division_id')::integer
  FROM ingest.fact_cleanup_archive a
  WHERE a.operation_key = operation
    AND a.source_table = 'public.conferences.updated'
    AND c.conference_id = a.source_pk::bigint;

  GET DIAGNOSTICS restored_count = ROW_COUNT;
  IF restored_count <> expected_updated_conferences THEN
    RAISE EXCEPTION 'expected % restored conference updates, restored %',
      expected_updated_conferences, restored_count;
  END IF;

  UPDATE public.schools s
  SET current_conference_id = (a.row_data->>'current_conference_id')::bigint,
      division = a.row_data->>'division',
      division_id = (a.row_data->>'division_id')::integer,
      is_active = (a.row_data->>'is_active')::boolean
  FROM ingest.fact_cleanup_archive a
  WHERE a.operation_key = operation
    AND a.source_table = 'public.schools.affiliation'
    AND s.school_id = a.source_pk::bigint;

  GET DIAGNOSTICS restored_count = ROW_COUNT;
  IF restored_count <> expected_affected_schools THEN
    RAISE EXCEPTION 'expected % restored school rows, restored %',
      expected_affected_schools, restored_count;
  END IF;

  PERFORM setval(
    pg_get_serial_sequence('public.conferences', 'conference_id'),
    (SELECT max(conference_id) FROM public.conferences),
    true
  );

  IF (SELECT count(*) FROM public.conferences) <> 197
     OR (SELECT count(*) FROM public.conferences WHERE division IS NULL) <> 27
     OR (SELECT count(*) FROM public.conferences WHERE division = 'DI') <> 38
     OR (SELECT count(*) FROM public.conferences WHERE division = 'DII') <> 27
     OR (SELECT count(*) FROM public.conferences WHERE division = 'DIII') <> 82
     OR (SELECT count(*) FROM public.conferences WHERE division = 'NAIA') <> 23
     OR EXISTS (
       SELECT 1
       FROM ingest.fact_cleanup_archive a
       JOIN public.schools s ON s.school_id = a.source_pk::bigint
       WHERE a.operation_key = operation
         AND a.source_table = 'public.schools.affiliation'
         AND (s.current_conference_id IS DISTINCT FROM (a.row_data->>'current_conference_id')::bigint
              OR s.division IS DISTINCT FROM a.row_data->>'division'
              OR s.division_id IS DISTINCT FROM (a.row_data->>'division_id')::integer
              OR s.is_active IS DISTINCT FROM (a.row_data->>'is_active')::boolean)
     ) THEN
    RAISE EXCEPTION 'conference reconciliation rollback postcondition failed';
  END IF;

  RAISE NOTICE 'restored 197-row conference catalog and % affected schools',
    expected_affected_schools;
END
$$;

COMMIT;
