-- Meet 13053 is the verified Big 12 Outdoor Championships shell. Its individual facts are Big 12,
-- but 27 legacy relay parents (and 108 lineup children) came from Big Ten meet 13056. The same 27
-- relay facts and all 108 lineup children already exist exactly once on meet 13056. A second legacy
-- path also stored 94 comma-separated relay lineups as synthetic individual athletes on meet 13053.
-- The reviewed TFRRS recovery run bd986e42-73a6-46af-9904-ee288e03b8df replaced those placeholders
-- with canonical relay parents and separately attributable legs.

CREATE TABLE IF NOT EXISTS ingest.fact_cleanup_archive (
  archive_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_key text NOT NULL,
  source_table text NOT NULL,
  source_pk text NOT NULL,
  row_data jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_key, source_table, source_pk)
);

ALTER TABLE ingest.fact_cleanup_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ingest.fact_cleanup_archive FROM PUBLIC;
REVOKE ALL ON SEQUENCE ingest.fact_cleanup_archive_archive_id_seq FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT ON ingest.fact_cleanup_archive TO service_role;
    GRANT USAGE, SELECT ON SEQUENCE ingest.fact_cleanup_archive_archive_id_seq TO service_role;
  END IF;
END
$$;

DO $$
DECLARE
  operation constant text := '20260829_big12_cross_meet_relays';
  bad_parent_ids constant integer[] := ARRAY[
    224319,224320,224321,224322,224323,224324,224325,224326,224327,
    224328,224329,224330,224331,224345,224347,224348,224349,224350,
    224351,224352,224353,224354,224355,224356,224357,224358,224359
  ];
  parent_count integer;
  parent_match_count integer;
  bad_leg_count integer;
  lineup_match_count integer;
  placeholder_count integer;
  private_reference_count integer;
BEGIN
  SELECT count(*)::integer
    INTO parent_count
    FROM public.relay_results
   WHERE meet_id = 13053
     AND relay_result_id = ANY(bad_parent_ids);

  SELECT count(*)::integer
    INTO placeholder_count
    FROM public.results r
    JOIN public.athletes a ON a.athlete_id = r.athlete_id
    JOIN public.event_types et ON et.event_type_id = r.event_type_id
   WHERE r.result_id BETWEEN 8011439 AND 8011532
     AND r.meet_id = 13053
     AND et.category = 'relay'
     AND a.full_name LIKE '%,%';

  -- Production has already been repaired when both reviewed sets are absent. A clean local/test
  -- database also has neither set. Keep the data-specific migration portable and replay-safe.
  IF parent_count = 0 AND placeholder_count = 0 THEN
    RETURN;
  END IF;

  IF parent_count <> 27 THEN
    RAISE EXCEPTION 'expected 27 reviewed relay parents on meet 13053, found %', parent_count;
  END IF;

  WITH matches AS (
    SELECT bad.relay_result_id, count(good.relay_result_id)::integer AS copies
      FROM public.relay_results bad
      LEFT JOIN public.relay_results good
        ON good.meet_id = 13056
       AND good.team_id = bad.team_id
       AND good.event_type_id = bad.event_type_id
       AND lower(trim(good.mark_raw)) = lower(trim(bad.mark_raw))
       AND good.place IS NOT DISTINCT FROM bad.place
       AND good.round IS NOT DISTINCT FROM bad.round
     WHERE bad.meet_id = 13053
       AND bad.relay_result_id = ANY(bad_parent_ids)
     GROUP BY bad.relay_result_id
  )
  SELECT count(*) FILTER (WHERE copies = 1)::integer
    INTO parent_match_count
    FROM matches;
  IF parent_match_count <> 27 THEN
    RAISE EXCEPTION 'all 27 relay parents must have one exact Big Ten copy; matched %', parent_match_count;
  END IF;

  SELECT count(*)::integer
    INTO bad_leg_count
    FROM public.relay_athletes
   WHERE relay_result_id = ANY(bad_parent_ids);
  IF bad_leg_count <> 108 THEN
    RAISE EXCEPTION 'expected 108 reviewed lineup children, found %', bad_leg_count;
  END IF;

  WITH parent_map AS (
    SELECT bad.relay_result_id AS bad_id, min(good.relay_result_id) AS good_id
      FROM public.relay_results bad
      JOIN public.relay_results good
        ON good.meet_id = 13056
       AND good.team_id = bad.team_id
       AND good.event_type_id = bad.event_type_id
       AND lower(trim(good.mark_raw)) = lower(trim(bad.mark_raw))
       AND good.place IS NOT DISTINCT FROM bad.place
       AND good.round IS NOT DISTINCT FROM bad.round
     WHERE bad.meet_id = 13053
       AND bad.relay_result_id = ANY(bad_parent_ids)
     GROUP BY bad.relay_result_id
  )
  SELECT count(*)::integer
    INTO lineup_match_count
    FROM parent_map m
    JOIN public.relay_athletes bad ON bad.relay_result_id = m.bad_id
    JOIN public.relay_athletes good
      ON good.relay_result_id = m.good_id
     AND good.leg_order IS NOT DISTINCT FROM bad.leg_order
     AND lower(regexp_replace(COALESCE(good.athlete_name, ''), '[^a-z0-9]+', '', 'gi'))
         = lower(regexp_replace(COALESCE(bad.athlete_name, ''), '[^a-z0-9]+', '', 'gi'));
  IF lineup_match_count <> 108 THEN
    RAISE EXCEPTION 'all 108 lineup children must match the correct Big Ten copies; matched %', lineup_match_count;
  END IF;

  IF placeholder_count <> 94 THEN
    RAISE EXCEPTION 'expected 94 reviewed synthetic-lineup results, found %', placeholder_count;
  END IF;

  SELECT
    (SELECT count(*) FROM ingest.source_links WHERE relay_result_id = ANY(bad_parent_ids))
    + (SELECT count(*) FROM ingest.observations WHERE canonical_relay_id = ANY(bad_parent_ids))
    + (SELECT count(*) FROM ingest.source_links WHERE result_id BETWEEN 8011439 AND 8011532)
    + (SELECT count(*) FROM ingest.observations WHERE canonical_result_id BETWEEN 8011439 AND 8011532)
    INTO private_reference_count;
  IF private_reference_count <> 0 THEN
    RAISE EXCEPTION 'reviewed bad facts unexpectedly have % private provenance references', private_reference_count;
  END IF;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.relay_athletes', relay_athlete_id::text, to_jsonb(a)
    FROM public.relay_athletes a
   WHERE relay_result_id = ANY(bad_parent_ids)
  ON CONFLICT DO NOTHING;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.relay_results', relay_result_id::text, to_jsonb(r)
    FROM public.relay_results r
   WHERE meet_id = 13053
     AND relay_result_id = ANY(bad_parent_ids)
  ON CONFLICT DO NOTHING;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.results', result_id::text, to_jsonb(r)
    FROM public.results r
   WHERE result_id BETWEEN 8011439 AND 8011532
     AND meet_id = 13053
  ON CONFLICT DO NOTHING;

  DELETE FROM public.relay_athletes
   WHERE relay_result_id = ANY(bad_parent_ids);

  DELETE FROM public.relay_results
   WHERE meet_id = 13053
     AND relay_result_id = ANY(bad_parent_ids);

  DELETE FROM public.results
   WHERE result_id BETWEEN 8011439 AND 8011532
     AND meet_id = 13053;

  IF (SELECT count(*) FROM ingest.fact_cleanup_archive WHERE operation_key = operation) <> 229 THEN
    RAISE EXCEPTION 'cleanup archive must contain 229 rows';
  END IF;
END
$$;
