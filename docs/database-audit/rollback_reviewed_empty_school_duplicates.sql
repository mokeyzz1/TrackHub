-- Emergency reversal for operation 20260902_remove_reviewed_empty_school_duplicates.
-- Run only after the corresponding guarded migration has completed successfully.

DO $$
DECLARE
  operation constant text := '20260902_remove_reviewed_empty_school_duplicates';
BEGIN
  IF (SELECT count(*) FROM ingest.fact_cleanup_archive WHERE operation_key = operation) <> 355 THEN
    RAISE EXCEPTION 'complete 355-row cleanup archive is required for rollback';
  END IF;
  IF (SELECT count(*) FROM ingest.fact_cleanup_archive
       WHERE operation_key = operation AND source_table = 'public.schools.canonical') <> 1
     OR (SELECT count(*) FROM ingest.fact_cleanup_archive
          WHERE operation_key = operation AND source_table = 'public.schools.duplicate') <> 64
     OR (SELECT count(*) FROM ingest.fact_cleanup_archive
          WHERE operation_key = operation AND source_table = 'public.teams.duplicate') <> 128
     OR (SELECT count(*) FROM ingest.fact_cleanup_archive
          WHERE operation_key = operation AND source_table = 'public.athletes') <> 9
     OR (SELECT count(*) FROM ingest.fact_cleanup_archive
          WHERE operation_key = operation AND source_table = 'public.results') <> 152
     OR (SELECT count(*) FROM ingest.fact_cleanup_archive
          WHERE operation_key = operation AND source_table = 'public.relay_results') <> 1 THEN
    RAISE EXCEPTION 'cleanup archive relation counts are incomplete';
  END IF;

  -- A completed rollback is a safe replay no-op.
  IF (SELECT count(*)
        FROM ingest.fact_cleanup_archive a
        JOIN public.schools s ON s.school_id = a.source_pk::bigint
       WHERE a.operation_key = operation AND a.source_table = 'public.schools.duplicate') = 64 THEN
    IF (SELECT count(*)
          FROM ingest.fact_cleanup_archive a JOIN public.results r
            ON r.result_id = a.source_pk::bigint
         WHERE a.operation_key = operation AND a.source_table = 'public.results'
           AND r.team_id = (a.row_data->>'team_id')::bigint) = 152 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'duplicate schools exist but dependent rows are not fully restored';
  END IF;

  INSERT INTO public.schools
  SELECT (jsonb_populate_record(NULL::public.schools, a.row_data)).*
    FROM ingest.fact_cleanup_archive a
   WHERE a.operation_key = operation AND a.source_table = 'public.schools.duplicate'
   ORDER BY a.source_pk::bigint;
  INSERT INTO public.teams
  SELECT (jsonb_populate_record(NULL::public.teams, a.row_data)).*
    FROM ingest.fact_cleanup_archive a
   WHERE a.operation_key = operation AND a.source_table = 'public.teams.duplicate'
   ORDER BY a.source_pk::bigint;

  UPDATE public.athletes row
     SET school_id = (a.row_data->>'school_id')::bigint
    FROM ingest.fact_cleanup_archive a
   WHERE a.operation_key = operation AND a.source_table = 'public.athletes'
     AND row.athlete_id = a.source_pk::bigint;
  UPDATE public.results row
     SET team_id = (a.row_data->>'team_id')::bigint
    FROM ingest.fact_cleanup_archive a
   WHERE a.operation_key = operation AND a.source_table = 'public.results'
     AND row.result_id = a.source_pk::bigint;
  UPDATE public.relay_results row
     SET team_id = (a.row_data->>'team_id')::integer
    FROM ingest.fact_cleanup_archive a
   WHERE a.operation_key = operation AND a.source_table = 'public.relay_results'
     AND row.relay_result_id = a.source_pk::integer;
  UPDATE public.schools row
     SET official_name = a.row_data->>'official_name',
         short_name = a.row_data->>'short_name',
         is_active = (a.row_data->>'is_active')::boolean,
         updated_at = (a.row_data->>'updated_at')::timestamptz
    FROM ingest.fact_cleanup_archive a
   WHERE a.operation_key = operation AND a.source_table = 'public.schools.canonical'
     AND row.school_id = a.source_pk::bigint;

  IF (SELECT count(*)
        FROM ingest.fact_cleanup_archive a JOIN public.athletes row
          ON row.athlete_id = a.source_pk::bigint
       WHERE a.operation_key = operation AND a.source_table = 'public.athletes'
         AND row.school_id = (a.row_data->>'school_id')::bigint) <> 9
     OR (SELECT count(*)
          FROM ingest.fact_cleanup_archive a JOIN public.results row
            ON row.result_id = a.source_pk::bigint
         WHERE a.operation_key = operation AND a.source_table = 'public.results'
           AND row.team_id = (a.row_data->>'team_id')::bigint) <> 152
     OR (SELECT count(*)
          FROM ingest.fact_cleanup_archive a JOIN public.relay_results row
            ON row.relay_result_id = a.source_pk::integer
         WHERE a.operation_key = operation AND a.source_table = 'public.relay_results'
           AND row.team_id = (a.row_data->>'team_id')::integer) <> 1 THEN
    RAISE EXCEPTION 'rollback did not restore every dependent identity reference';
  END IF;
END
$$;
