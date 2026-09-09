-- Restore the exact pre-consolidation athlete rows and dependencies archived by
-- 20260902170615_consolidate_reviewed_athlete_duplicates.sql.
-- The preceding secondary identity preservation migration remains in place.

DO $$
DECLARE
  operation constant text := '20260902_consolidate_reviewed_athlete_duplicates';
BEGIN
  PERFORM set_config('statement_timeout', '10min', true);
  PERFORM set_config('lock_timeout', '5s', true);

  LOCK TABLE
    ingest.fact_cleanup_archive,
    public.athletes,
    public.results,
    public.relay_athletes,
    public.athlete_prs,
    public.athlete_team_seasons,
    ingest.observations,
    ingest.athlete_aliases,
    ingest.source_links
  IN SHARE ROW EXCLUSIVE MODE;

  IF (SELECT count(*) FROM ingest.fact_cleanup_archive WHERE operation_key = operation) <> 2921
     OR (SELECT count(*) FROM ingest.fact_cleanup_archive
          WHERE operation_key = operation AND source_table = 'public.athletes') <> 671
     OR (SELECT count(*) FROM ingest.fact_cleanup_archive
          WHERE operation_key = operation AND source_table = 'public.results') <> 1944
     OR (SELECT count(*) FROM ingest.fact_cleanup_archive
          WHERE operation_key = operation AND source_table = 'public.relay_athletes') <> 134
     OR (SELECT count(*) FROM ingest.fact_cleanup_archive
          WHERE operation_key = operation AND source_table = 'public.athlete_prs') <> 9
     OR (SELECT count(*) FROM ingest.fact_cleanup_archive
          WHERE operation_key = operation AND source_table = 'public.athlete_team_seasons') <> 1
     OR (SELECT count(*) FROM ingest.fact_cleanup_archive
          WHERE operation_key = operation AND source_table = 'ingest.observations') <> 151
     OR (SELECT count(*) FROM ingest.fact_cleanup_archive
          WHERE operation_key = operation AND source_table = 'ingest.athlete_aliases') <> 2
     OR (SELECT count(*) FROM ingest.fact_cleanup_archive
          WHERE operation_key = operation AND source_table = 'ingest.source_links') <> 9 THEN
    RAISE EXCEPTION 'reviewed athlete rollback archive is incomplete';
  END IF;

  -- Restore deleted athlete identities first so all child rows have valid FK targets.
  INSERT INTO public.athletes
  SELECT (jsonb_populate_record(NULL::public.athletes, x.row_data)).*
    FROM ingest.fact_cleanup_archive x
   WHERE x.operation_key = operation
     AND x.source_table = 'public.athletes'
     AND x.source_pk LIKE 'duplicate:%'
   ORDER BY (x.row_data->>'athlete_id')::bigint;

  -- Preserve the archived updated_at value instead of letting the normal update trigger replace it.
  ALTER TABLE public.athletes DISABLE TRIGGER update_athletes_updated_at;

  -- Restore the four canonical display rows changed by the merge.
  UPDATE public.athletes a
     SET (school_id, full_name, first_name, last_name, gender, class_year, grad_year,
          primary_events, hometown, high_school, tfrrs_athlete_id, tfrrs_profile_url,
          athletic_net_url, profile_image_url, bio, is_active, created_at, updated_at) =
         (r.school_id, r.full_name, r.first_name, r.last_name, r.gender, r.class_year, r.grad_year,
          r.primary_events, r.hometown, r.high_school, r.tfrrs_athlete_id, r.tfrrs_profile_url,
          r.athletic_net_url, r.profile_image_url, r.bio, r.is_active, r.created_at, r.updated_at)
    FROM (
      SELECT (jsonb_populate_record(NULL::public.athletes, x.row_data)).*
        FROM ingest.fact_cleanup_archive x
       WHERE x.operation_key = operation
         AND x.source_table = 'public.athletes'
         AND x.source_pk LIKE 'canonical:%'
    ) r
   WHERE a.athlete_id = r.athlete_id;

  ALTER TABLE public.athletes ENABLE TRIGGER update_athletes_updated_at;

  -- Rows that were moved still exist; put their original athlete IDs back.
  UPDATE public.results row
     SET athlete_id = r.athlete_id
    FROM (
      SELECT (jsonb_populate_record(NULL::public.results, x.row_data)).*
        FROM ingest.fact_cleanup_archive x
       WHERE x.operation_key = operation
         AND x.source_table = 'public.results'
         AND x.source_pk LIKE 'move:%'
    ) r
   WHERE row.result_id = r.result_id;

  -- Rows deleted as redundant facts are reinserted byte-for-byte.
  INSERT INTO public.results
  SELECT (jsonb_populate_record(NULL::public.results, x.row_data)).*
    FROM ingest.fact_cleanup_archive x
   WHERE x.operation_key = operation
     AND x.source_table = 'public.results'
     AND x.source_pk LIKE 'delete_duplicate:%'
   ORDER BY (x.row_data->>'result_id')::bigint;

  UPDATE public.relay_athletes row
     SET athlete_id = r.athlete_id
    FROM (
      SELECT (jsonb_populate_record(NULL::public.relay_athletes, x.row_data)).*
        FROM ingest.fact_cleanup_archive x
       WHERE x.operation_key = operation AND x.source_table = 'public.relay_athletes'
    ) r
   WHERE row.relay_athlete_id = r.relay_athlete_id;

  UPDATE public.athlete_prs row
     SET athlete_id = r.athlete_id
    FROM (
      SELECT (jsonb_populate_record(NULL::public.athlete_prs, x.row_data)).*
        FROM ingest.fact_cleanup_archive x
       WHERE x.operation_key = operation
         AND x.source_table = 'public.athlete_prs'
         AND x.source_pk LIKE 'move:%'
    ) r
   WHERE row.id = r.id;

  INSERT INTO public.athlete_prs
  SELECT (jsonb_populate_record(NULL::public.athlete_prs, x.row_data)).*
    FROM ingest.fact_cleanup_archive x
   WHERE x.operation_key = operation
     AND x.source_table = 'public.athlete_prs'
     AND x.source_pk LIKE 'delete_duplicate:%'
   ORDER BY (x.row_data->>'id')::integer;

  UPDATE public.athlete_team_seasons row
     SET (athlete_id, team_id, season_code, year_in_school, jersey_number,
          status, is_redshirt, created_at) =
         (r.athlete_id, r.team_id, r.season_code, r.year_in_school, r.jersey_number,
          r.status, r.is_redshirt, r.created_at)
    FROM (
      SELECT (jsonb_populate_record(NULL::public.athlete_team_seasons, x.row_data)).*
        FROM ingest.fact_cleanup_archive x
       WHERE x.operation_key = operation AND x.source_table = 'public.athlete_team_seasons'
    ) r
   WHERE row.ats_id = r.ats_id;

  UPDATE ingest.observations row
     SET (target_athlete_id, canonical_result_id) =
         (r.target_athlete_id, r.canonical_result_id)
    FROM (
      SELECT (jsonb_populate_record(NULL::ingest.observations, x.row_data)).*
        FROM ingest.fact_cleanup_archive x
       WHERE x.operation_key = operation AND x.source_table = 'ingest.observations'
    ) r
   WHERE row.observation_id = r.observation_id;

  UPDATE ingest.athlete_aliases row
     SET (target_athlete_id, updated_at) = (r.target_athlete_id, r.updated_at)
    FROM (
      SELECT (jsonb_populate_record(NULL::ingest.athlete_aliases, x.row_data)).*
        FROM ingest.fact_cleanup_archive x
       WHERE x.operation_key = operation AND x.source_table = 'ingest.athlete_aliases'
    ) r
   WHERE row.athlete_alias_id = r.athlete_alias_id;

  UPDATE ingest.source_links row
     SET result_id = r.result_id
    FROM (
      SELECT (jsonb_populate_record(NULL::ingest.source_links, x.row_data)).*
        FROM ingest.fact_cleanup_archive x
       WHERE x.operation_key = operation AND x.source_table = 'ingest.source_links'
    ) r
   WHERE row.source_record_id = r.source_record_id;

  -- Every archived row must now compare exactly with its restored source row.
  IF EXISTS (
    SELECT 1 FROM ingest.fact_cleanup_archive x
    LEFT JOIN public.athletes row ON row.athlete_id = (x.row_data->>'athlete_id')::bigint
    WHERE x.operation_key = operation AND x.source_table = 'public.athletes'
      AND (row.athlete_id IS NULL OR to_jsonb(row) IS DISTINCT FROM x.row_data)
  ) OR EXISTS (
    SELECT 1 FROM ingest.fact_cleanup_archive x
    LEFT JOIN public.results row ON row.result_id = (x.row_data->>'result_id')::bigint
    WHERE x.operation_key = operation AND x.source_table = 'public.results'
      AND (row.result_id IS NULL OR to_jsonb(row) IS DISTINCT FROM x.row_data)
  ) OR EXISTS (
    SELECT 1 FROM ingest.fact_cleanup_archive x
    LEFT JOIN public.relay_athletes row
      ON row.relay_athlete_id = (x.row_data->>'relay_athlete_id')::integer
    WHERE x.operation_key = operation AND x.source_table = 'public.relay_athletes'
      AND (row.relay_athlete_id IS NULL OR to_jsonb(row) IS DISTINCT FROM x.row_data)
  ) OR EXISTS (
    SELECT 1 FROM ingest.fact_cleanup_archive x
    LEFT JOIN public.athlete_prs row ON row.id = (x.row_data->>'id')::integer
    WHERE x.operation_key = operation AND x.source_table = 'public.athlete_prs'
      AND (row.id IS NULL OR to_jsonb(row) IS DISTINCT FROM x.row_data)
  ) OR EXISTS (
    SELECT 1 FROM ingest.fact_cleanup_archive x
    LEFT JOIN public.athlete_team_seasons row ON row.ats_id = (x.row_data->>'ats_id')::bigint
    WHERE x.operation_key = operation AND x.source_table = 'public.athlete_team_seasons'
      AND (row.ats_id IS NULL OR to_jsonb(row) IS DISTINCT FROM x.row_data)
  ) OR EXISTS (
    SELECT 1 FROM ingest.fact_cleanup_archive x
    LEFT JOIN ingest.observations row
      ON row.observation_id = (x.row_data->>'observation_id')::bigint
    WHERE x.operation_key = operation AND x.source_table = 'ingest.observations'
      AND (row.observation_id IS NULL OR to_jsonb(row) IS DISTINCT FROM x.row_data)
  ) OR EXISTS (
    SELECT 1 FROM ingest.fact_cleanup_archive x
    LEFT JOIN ingest.athlete_aliases row
      ON row.athlete_alias_id = (x.row_data->>'athlete_alias_id')::bigint
    WHERE x.operation_key = operation AND x.source_table = 'ingest.athlete_aliases'
      AND (row.athlete_alias_id IS NULL OR to_jsonb(row) IS DISTINCT FROM x.row_data)
  ) OR EXISTS (
    SELECT 1 FROM ingest.fact_cleanup_archive x
    LEFT JOIN ingest.source_links row
      ON row.source_record_id = (x.row_data->>'source_record_id')::bigint
    WHERE x.operation_key = operation AND x.source_table = 'ingest.source_links'
      AND (row.source_record_id IS NULL OR to_jsonb(row) IS DISTINCT FROM x.row_data)
  ) THEN
    RAISE EXCEPTION 'reviewed athlete rollback did not restore every archived row exactly';
  END IF;

  DELETE FROM ingest.fact_cleanup_archive WHERE operation_key = operation;
END
$$;
