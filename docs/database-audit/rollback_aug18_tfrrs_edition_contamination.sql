-- Emergency rollback for 20260902140000_repair_aug18_tfrrs_edition_contamination.sql.
-- Run only after that migration and before deleting its private archive rows.

BEGIN;

DO $$
DECLARE
  operation constant text := '20260902_aug18_tfrrs_edition_contamination';
  deleted_archive_count bigint;
BEGIN
  IF (SELECT count(*) FROM ingest.fact_cleanup_archive WHERE operation_key = operation) <> 122251 THEN
    RAISE EXCEPTION 'complete 122251-row archive is required for rollback';
  END IF;

  DELETE FROM public.relay_athletes a
   WHERE EXISTS (
     SELECT 1 FROM ingest.fact_cleanup_archive x
      WHERE x.operation_key = operation
        AND x.source_table = 'public.relay_athletes'
        AND x.source_pk = a.relay_athlete_id::text
   );
  DELETE FROM public.relay_results r
   WHERE EXISTS (
     SELECT 1 FROM ingest.fact_cleanup_archive x
      WHERE x.operation_key = operation
        AND x.source_table = 'public.relay_results'
        AND x.source_pk = r.relay_result_id::text
   );
  DELETE FROM public.results r
   WHERE EXISTS (
     SELECT 1 FROM ingest.fact_cleanup_archive x
      WHERE x.operation_key = operation
        AND x.source_table = 'public.results'
        AND x.source_pk = r.result_id::text
   );

  INSERT INTO public.results
  SELECT (jsonb_populate_record(NULL::public.results, x.row_data)).*
    FROM ingest.fact_cleanup_archive x
   WHERE x.operation_key = operation AND x.source_table = 'public.results';

  INSERT INTO public.relay_results
  SELECT (jsonb_populate_record(NULL::public.relay_results, x.row_data)).*
    FROM ingest.fact_cleanup_archive x
   WHERE x.operation_key = operation AND x.source_table = 'public.relay_results';

  INSERT INTO public.relay_athletes
  SELECT (jsonb_populate_record(NULL::public.relay_athletes, x.row_data)).*
    FROM ingest.fact_cleanup_archive x
   WHERE x.operation_key = operation AND x.source_table = 'public.relay_athletes';

  -- The normal BEFORE UPDATE trigger replaces archived updated_at with now(). Disable only that
  -- trigger inside this transaction so the original meet rows are restored byte-for-byte.
  ALTER TABLE public.meets DISABLE TRIGGER update_meets_updated_at;

  UPDATE public.meets m
     SET name = old.name,
         date = old.date,
         location = old.location,
         meet_url = old.meet_url,
         status = old.status,
         level = old.level,
         season = old.season,
         created_at = old.created_at,
         updated_at = old.updated_at,
         timing_platform = old.timing_platform,
         source_url = old.source_url,
         tfrrs_meet_id = old.tfrrs_meet_id,
         end_date = old.end_date,
         tfrrs_url = old.tfrrs_url,
         athletic_net_results_url = old.athletic_net_results_url,
         wa_results_url = old.wa_results_url,
         results_status = old.results_status,
         results_last_checked_at = old.results_last_checked_at,
         results_imported_at = old.results_imported_at,
         results_error = old.results_error,
         results_source = old.results_source
    FROM (
      SELECT (jsonb_populate_record(NULL::public.meets, x.row_data)).*
        FROM ingest.fact_cleanup_archive x
       WHERE x.operation_key = operation AND x.source_table = 'public.meets'
   ) old
   WHERE m.meet_id = old.meet_id;

  ALTER TABLE public.meets ENABLE TRIGGER update_meets_updated_at;

  IF EXISTS (
    SELECT 1 FROM ingest.fact_cleanup_archive a
    JOIN public.meets x ON x.meet_id = a.source_pk::integer
    WHERE a.operation_key = operation AND a.source_table = 'public.meets'
      AND to_jsonb(x) <> a.row_data
  ) OR EXISTS (
    SELECT 1 FROM ingest.fact_cleanup_archive a
    JOIN public.results x ON x.result_id = a.source_pk::bigint
    WHERE a.operation_key = operation AND a.source_table = 'public.results'
      AND to_jsonb(x) <> a.row_data
  ) OR EXISTS (
    SELECT 1 FROM ingest.fact_cleanup_archive a
    JOIN public.relay_results x ON x.relay_result_id = a.source_pk::integer
    WHERE a.operation_key = operation AND a.source_table = 'public.relay_results'
      AND to_jsonb(x) <> a.row_data
  ) OR EXISTS (
    SELECT 1 FROM ingest.fact_cleanup_archive a
    JOIN public.relay_athletes x ON x.relay_athlete_id = a.source_pk::integer
    WHERE a.operation_key = operation AND a.source_table = 'public.relay_athletes'
      AND to_jsonb(x) <> a.row_data
  ) THEN
    RAISE EXCEPTION 'rollback did not restore all archived rows exactly';
  END IF;

  DELETE FROM ingest.fact_cleanup_archive WHERE operation_key = operation;
  GET DIAGNOSTICS deleted_archive_count = ROW_COUNT;
  IF deleted_archive_count <> 122251 THEN
    RAISE EXCEPTION 'rollback archive cleanup deleted % rows, expected 122251',
      deleted_archive_count;
  END IF;
END
$$;

COMMIT;
