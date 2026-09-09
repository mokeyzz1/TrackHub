-- TrackScoreboard meet 476 stores compact result statuses: D=DNF, Q=DQ, and S=SCR. The first
-- controlled Ed Daniels promotion preserved D/S literally. The older scraper had already stored
-- the same RIC D status as DNF, producing one duplicate parent and four duplicate athlete facts.
-- Keep the current source-linked facts, normalize their statuses, and archive the superseded
-- unlinked legacy copy before removal.

DO $$
DECLARE
  operation constant text := '20260829_ed_daniels_relay_statuses';
  legacy_parent constant integer := 215260;
  legacy_result_ids constant bigint[] := ARRAY[7180055,7180056,7180057,7180058]::bigint[];
  source_parent_ids constant integer[] := ARRAY[243464,243484];
  source_result_ids constant bigint[] := ARRAY[
    8033901,8033902,8033903,8033904,8033905,
    8034002,8034003,8034004,8034005
  ]::bigint[];
  present_count integer;
  private_reference_count integer;
BEGIN
  SELECT
    (SELECT count(*) FROM public.relay_results WHERE relay_result_id = legacy_parent)
    + (SELECT count(*) FROM public.results WHERE result_id = ANY(legacy_result_ids))
    + (SELECT count(*) FROM public.relay_results WHERE relay_result_id = ANY(source_parent_ids))
    + (SELECT count(*) FROM public.results WHERE result_id = ANY(source_result_ids))
    INTO present_count;

  -- Keep clean local/test databases portable, and make the production repair replay-safe.
  IF present_count = 0 THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.relay_results WHERE relay_result_id = legacy_parent)
     AND (SELECT mark_raw FROM public.relay_results WHERE relay_result_id = 243464) = 'DNF'
     AND (SELECT mark_raw FROM public.relay_results WHERE relay_result_id = 243484) = 'SCR'
     AND NOT EXISTS (
       SELECT 1 FROM public.results
        WHERE result_id = ANY(source_result_ids) AND mark_raw NOT IN ('DNF', 'SCR')
     ) THEN
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.relay_results WHERE relay_result_id = legacy_parent
        AND meet_id = 12417 AND team_id = 2863 AND mark_raw = 'DNF' AND round = 'Finals') <> 1 THEN
    RAISE EXCEPTION 'reviewed legacy RIC relay parent is missing or changed';
  END IF;
  IF (SELECT count(*) FROM public.relay_athletes WHERE relay_result_id = legacy_parent) <> 4 THEN
    RAISE EXCEPTION 'reviewed legacy RIC relay lineup is missing or changed';
  END IF;
  IF (SELECT count(*) FROM public.results WHERE result_id = ANY(legacy_result_ids)
        AND meet_id = 12417 AND team_id = 2863 AND mark_raw = 'DNF' AND round = 'Finals') <> 4 THEN
    RAISE EXCEPTION 'reviewed legacy RIC athlete facts are missing or changed';
  END IF;

  IF (SELECT count(*) FROM public.relay_results WHERE relay_result_id = 243464
        AND meet_id = 12417 AND team_id = 2863 AND mark_raw = 'D' AND round = 'Finals') <> 1
     OR (SELECT count(*) FROM public.results WHERE result_id BETWEEN 8033901 AND 8033905
          AND meet_id = 12417 AND team_id = 2863 AND mark_raw = 'D' AND round = 'Finals') <> 5 THEN
    RAISE EXCEPTION 'source-linked RIC D facts are missing or changed';
  END IF;
  IF (SELECT count(*) FROM public.relay_results WHERE relay_result_id = 243484
        AND meet_id = 12417 AND team_id = 747 AND mark_raw = 'S' AND round = 'Finals') <> 1
     OR (SELECT count(*) FROM public.results WHERE result_id BETWEEN 8034002 AND 8034005
          AND meet_id = 12417 AND team_id = 747 AND mark_raw = 'S' AND round = 'Finals') <> 4 THEN
    RAISE EXCEPTION 'source-linked Assumption S facts are missing or changed';
  END IF;

  SELECT
    (SELECT count(*) FROM ingest.source_links WHERE relay_result_id = legacy_parent)
    + (SELECT count(*) FROM ingest.observations WHERE canonical_relay_id = legacy_parent)
    + (SELECT count(*) FROM ingest.source_links WHERE result_id = ANY(legacy_result_ids))
    + (SELECT count(*) FROM ingest.observations WHERE canonical_result_id = ANY(legacy_result_ids))
    INTO private_reference_count;
  IF private_reference_count <> 0 THEN
    RAISE EXCEPTION 'superseded legacy RIC facts unexpectedly have % private provenance references', private_reference_count;
  END IF;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.relay_athletes', relay_athlete_id::text, to_jsonb(a)
    FROM public.relay_athletes a
   WHERE relay_result_id = legacy_parent
  ON CONFLICT DO NOTHING;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.relay_results', relay_result_id::text, to_jsonb(r)
    FROM public.relay_results r
   WHERE relay_result_id = legacy_parent OR relay_result_id = ANY(source_parent_ids)
  ON CONFLICT DO NOTHING;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.results', result_id::text, to_jsonb(r)
    FROM public.results r
   WHERE result_id = ANY(legacy_result_ids) OR result_id = ANY(source_result_ids)
  ON CONFLICT DO NOTHING;

  DELETE FROM public.relay_athletes WHERE relay_result_id = legacy_parent;
  DELETE FROM public.relay_results WHERE relay_result_id = legacy_parent;
  DELETE FROM public.results WHERE result_id = ANY(legacy_result_ids);

  UPDATE public.relay_results SET mark_raw = 'DNF' WHERE relay_result_id = 243464 AND mark_raw = 'D';
  UPDATE public.results SET mark_raw = 'DNF' WHERE result_id BETWEEN 8033901 AND 8033905 AND mark_raw = 'D';
  UPDATE public.relay_results SET mark_raw = 'SCR' WHERE relay_result_id = 243484 AND mark_raw = 'S';
  UPDATE public.results SET mark_raw = 'SCR' WHERE result_id BETWEEN 8034002 AND 8034005 AND mark_raw = 'S';

  IF (SELECT count(*) FROM ingest.fact_cleanup_archive WHERE operation_key = operation) <> 20 THEN
    RAISE EXCEPTION 'Ed Daniels status repair archive must contain 20 rows';
  END IF;
END
$$;
