-- Consolidate 667 evidence-backed duplicate athlete rows into 665 people.
--
-- Preconditions:
--   * reviewed school/meet cleanup migrations have already run;
--   * the 341 secondary source identities have already been preserved;
--   * the four same-day contradictory pairs remain separate.
--
-- This creates no table. Every changed/deleted row is copied to the existing private
-- ingest.fact_cleanup_archive before mutation. See the paired rollback SQL in
-- docs/database-audit/rollback_reviewed_athlete_duplicates.sql.

DO $$
DECLARE
  operation constant text := '20260902_consolidate_reviewed_athlete_duplicates';
  expected_archive_rows constant integer := 2921;
  archive_rows integer;
  candidate_pairs integer;
  held_pairs integer;
  duplicate_athletes integer;
  source_identities integer;
  mapping_fingerprint text;
  held_fingerprint text;
  result_fingerprint text;
  relay_fingerprint text;
  pr_fingerprint text;
  profile_fingerprint text;
  observation_fingerprint text;
  source_link_fingerprint text;
  alias_fingerprint text;
  season_fingerprint text;
BEGIN
  PERFORM set_config('statement_timeout', '10min', true);
  PERFORM set_config('lock_timeout', '5s', true);

  SELECT count(*)::integer INTO archive_rows
    FROM ingest.fact_cleanup_archive WHERE operation_key = operation;

  -- A fully archived final state is replay-safe. A partial archive is never guessed through.
  IF archive_rows = expected_archive_rows THEN
    IF (SELECT count(*) FROM ingest.fact_cleanup_archive
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
      RAISE EXCEPTION 'reviewed athlete archive has the right total but the wrong table distribution';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM ingest.fact_cleanup_archive x
        JOIN public.athletes a
          ON a.athlete_id = (x.row_data->>'athlete_id')::bigint
       WHERE x.operation_key = operation
         AND x.source_table = 'public.athletes'
         AND x.source_pk LIKE 'duplicate:%'
    ) OR EXISTS (
      SELECT 1
        FROM ingest.fact_cleanup_archive x
        JOIN public.results r ON r.result_id = (x.row_data->>'result_id')::bigint
       WHERE x.operation_key = operation
         AND x.source_table = 'public.results'
         AND x.source_pk LIKE 'delete:%'
    ) THEN
      RAISE EXCEPTION 'reviewed athlete archive exists but duplicate athletes/results remain';
    END IF;

    RETURN;
  ELSIF archive_rows <> 0 THEN
    RAISE EXCEPTION 'reviewed athlete archive is partial: expected 0 or %, found %',
      expected_archive_rows, archive_rows;
  END IF;

  -- One statement acquires locks in a consistent order. If ingestion is active, lock_timeout
  -- fails closed instead of letting the reviewed evidence drift during the scan.
  LOCK TABLE
    ingest.fact_cleanup_archive,
    public.athletes,
    public.results,
    public.relay_athletes,
    public.athlete_prs,
    public.athlete_team_seasons,
    public.external_ids,
    public.live_results,
    ingest.observations,
    ingest.athlete_aliases,
    ingest.source_links
  IN SHARE ROW EXCLUSIVE MODE;

  DROP TABLE IF EXISTS
    _merge_identity_facts, _merge_identity_pairs, _merge_athlete_map,
    _merge_result_plan, _merge_relay_plan, _merge_pr_plan,
    _merge_profile_plan, _merge_source_identities, _merge_identity_dates;

  CREATE TEMP TABLE _merge_identity_facts ON COMMIT DROP AS
  SELECT r.athlete_id, r.meet_id, r.date, r.event_type_id,
         coalesce(r.place, -2147483648) AS place_key,
         CASE
           WHEN lower(coalesce(r.round, '')) LIKE 'final%' THEN 'final'
           WHEN lower(coalesce(r.round, '')) LIKE 'prelim%' THEN 'prelim'
           ELSE lower(coalesce(r.round, ''))
         END AS round_key,
         CASE
           WHEN r.mark_seconds IS NOT NULL THEN 's:' || round(r.mark_seconds::numeric, 5)::text
           WHEN r.mark_meters IS NOT NULL THEN 'm:' || round(r.mark_meters::numeric, 4)::text
           ELSE 'r:' || lower(regexp_replace(coalesce(r.mark_raw, ''), '[ah]$', '', 'i'))
         END AS mark_key
    FROM public.results r
    JOIN public.event_types et USING (event_type_id)
   WHERE r.meet_id IS NOT NULL
     AND r.athlete_id IS NOT NULL
     AND r.mark_raw ~ '[0-9]'
     AND et.category <> 'relay';

  CREATE INDEX ON _merge_identity_facts
    (meet_id, event_type_id, place_key, round_key, mark_key);
  CREATE INDEX ON _merge_identity_facts (athlete_id, date, meet_id);

  CREATE TEMP TABLE _merge_identity_pairs ON COMMIT DROP AS
  SELECT f1.athlete_id AS athlete_a, f2.athlete_id AS athlete_b, false AS conflict
    FROM _merge_identity_facts f1
    JOIN _merge_identity_facts f2
      ON f2.meet_id = f1.meet_id
     AND f2.event_type_id = f1.event_type_id
     AND f2.place_key = f1.place_key
     AND f2.round_key = f1.round_key
     AND f2.mark_key = f1.mark_key
     AND f2.athlete_id > f1.athlete_id
    JOIN public.athletes a ON a.athlete_id = f1.athlete_id
    JOIN public.athletes b
      ON b.athlete_id = f2.athlete_id
     AND b.gender IS NOT DISTINCT FROM a.gender
     AND lower(regexp_replace(b.full_name, '[^a-z0-9]+', '', 'gi'))
         = lower(regexp_replace(a.full_name, '[^a-z0-9]+', '', 'gi'))
   GROUP BY f1.athlete_id, f2.athlete_id;

  -- Restrict the contradiction check to candidate athletes' dates/meets. On production the full
  -- facts table is millions of rows; probing it pair-by-pair can exceed the hosted timeout.
  CREATE TEMP TABLE _merge_identity_dates ON COMMIT DROP AS
  SELECT DISTINCT f.athlete_id, f.date, f.meet_id
    FROM _merge_identity_facts f
    JOIN (
      SELECT athlete_a AS athlete_id FROM _merge_identity_pairs
      UNION
      SELECT athlete_b FROM _merge_identity_pairs
    ) c USING (athlete_id)
   WHERE f.date IS NOT NULL;
  CREATE INDEX ON _merge_identity_dates (athlete_id, date, meet_id);

  UPDATE _merge_identity_pairs p SET conflict = true
   WHERE EXISTS (
     SELECT 1
       FROM _merge_identity_dates x
       JOIN _merge_identity_dates y
         ON y.athlete_id = p.athlete_b
        AND y.date = x.date
        AND y.meet_id <> x.meet_id
      WHERE x.athlete_id = p.athlete_a
   );

  CREATE TEMP TABLE _merge_athlete_map ON COMMIT DROP AS
  WITH RECURSIVE edges AS (
    SELECT athlete_a AS a, athlete_b AS b FROM _merge_identity_pairs WHERE NOT conflict
  ), nodes AS (
    SELECT a AS node FROM edges UNION SELECT b FROM edges
  ), reach(root, node) AS (
    SELECT node, node FROM nodes
    UNION
    SELECT r.root, CASE WHEN e.a = r.node THEN e.b ELSE e.a END
      FROM reach r JOIN edges e ON e.a = r.node OR e.b = r.node
  )
  SELECT node AS athlete_id, min(root) AS canonical_athlete_id
    FROM reach GROUP BY node;

  CREATE INDEX ON _merge_athlete_map (athlete_id);
  CREATE INDEX ON _merge_athlete_map (canonical_athlete_id);

  CREATE TEMP TABLE _merge_result_plan ON COMMIT DROP AS
  WITH component_results AS (
    SELECT r.*, m.canonical_athlete_id,
           CASE WHEN r.meet_id IS NULL THEN r.result_id ELSE 0 END AS history_discriminator,
           CASE
             WHEN r.mark_seconds IS NOT NULL THEN 's:' || round(r.mark_seconds::numeric, 5)::text
             WHEN r.mark_meters IS NOT NULL THEN 'm:' || round(r.mark_meters::numeric, 4)::text
             ELSE 'r:' || lower(regexp_replace(coalesce(r.mark_raw, ''), '[ah]$', '', 'i'))
           END AS mark_key,
           CASE
             WHEN lower(coalesce(r.round, '')) LIKE 'final%' THEN 'final'
             WHEN lower(coalesce(r.round, '')) LIKE 'prelim%' THEN 'prelim'
             ELSE lower(coalesce(r.round, ''))
           END AS round_key
      FROM public.results r JOIN _merge_athlete_map m USING (athlete_id)
  ), ranked AS (
    SELECT c.*,
           row_number() OVER (
             PARTITION BY canonical_athlete_id, meet_id, history_discriminator,
                          event_type_id, place, mark_key, round_key
             ORDER BY (athlete_id = canonical_athlete_id) DESC, result_id
           ) AS keep_rank,
           first_value(result_id) OVER (
             PARTITION BY canonical_athlete_id, meet_id, history_discriminator,
                          event_type_id, place, mark_key, round_key
             ORDER BY (athlete_id = canonical_athlete_id) DESC, result_id
           ) AS survivor_result_id
      FROM component_results c
  )
  SELECT result_id, athlete_id, canonical_athlete_id, survivor_result_id,
         CASE
           WHEN athlete_id = canonical_athlete_id THEN 'keep'
           WHEN keep_rank = 1 THEN 'move'
           ELSE 'delete_duplicate'
         END AS action
    FROM ranked;

  CREATE INDEX ON _merge_result_plan (result_id);

  CREATE TEMP TABLE _merge_relay_plan ON COMMIT DROP AS
  WITH ranked AS (
    SELECT ra.relay_athlete_id, ra.athlete_id, m.canonical_athlete_id,
           row_number() OVER (
             PARTITION BY m.canonical_athlete_id, ra.relay_result_id, ra.leg_order
             ORDER BY (ra.athlete_id = m.canonical_athlete_id) DESC, ra.relay_athlete_id
           ) AS keep_rank
      FROM public.relay_athletes ra JOIN _merge_athlete_map m USING (athlete_id)
  )
  SELECT relay_athlete_id, athlete_id, canonical_athlete_id,
         CASE WHEN athlete_id = canonical_athlete_id THEN 'keep'
              WHEN keep_rank = 1 THEN 'move' ELSE 'delete_duplicate' END AS action
    FROM ranked;

  CREATE TEMP TABLE _merge_pr_plan ON COMMIT DROP AS
  WITH ranked AS (
    SELECT p.id, p.athlete_id, m.canonical_athlete_id,
           row_number() OVER (
             PARTITION BY m.canonical_athlete_id, p.event_name, p.season
             ORDER BY p.mark_seconds ASC NULLS LAST,
                      p.mark_meters DESC NULLS LAST,
                      (p.athlete_id = m.canonical_athlete_id) DESC,
                      p.id
           ) AS keep_rank
      FROM public.athlete_prs p JOIN _merge_athlete_map m USING (athlete_id)
  )
  SELECT id, athlete_id, canonical_athlete_id,
         CASE WHEN athlete_id = canonical_athlete_id THEN 'keep'
              WHEN keep_rank = 1 THEN 'move' ELSE 'delete_duplicate' END AS action
    FROM ranked;

  CREATE TEMP TABLE _merge_profile_plan ON COMMIT DROP AS
  WITH latest AS (
    SELECT DISTINCT ON (m.canonical_athlete_id)
           m.canonical_athlete_id, t.school_id
      FROM _merge_athlete_map m
      JOIN public.results r USING (athlete_id)
      JOIN public.teams t USING (team_id)
     WHERE r.date IS NOT NULL AND t.school_id <> 1835
     ORDER BY m.canonical_athlete_id, r.date DESC, r.result_id DESC
  ), anet AS (
    SELECT m.canonical_athlete_id,
           min(a.athletic_net_url) FILTER (WHERE a.athletic_net_url IS NOT NULL) AS athletic_net_url
      FROM _merge_athlete_map m JOIN public.athletes a USING (athlete_id)
     GROUP BY m.canonical_athlete_id
  )
  SELECT c.athlete_id, l.school_id,
         coalesce(c.athletic_net_url, anet.athletic_net_url) AS athletic_net_url
    FROM public.athletes c
    JOIN latest l ON l.canonical_athlete_id = c.athlete_id
    JOIN anet ON anet.canonical_athlete_id = c.athlete_id
   WHERE c.school_id <> l.school_id
      OR (c.athletic_net_url IS NULL AND anet.athletic_net_url IS NOT NULL);

  CREATE TEMP TABLE _merge_source_identities ON COMMIT DROP AS
  WITH secondary AS (
    SELECT m.canonical_athlete_id, a.full_name, a.gender,
           a.tfrrs_athlete_id,
           substring(a.athletic_net_url FROM '/athlete/([0-9]+)') AS athletic_net_id
      FROM _merge_athlete_map m JOIN public.athletes a USING (athlete_id)
     WHERE m.athlete_id <> m.canonical_athlete_id
  )
  SELECT 'tfrrs'::text AS source, tfrrs_athlete_id AS source_key,
         canonical_athlete_id, full_name, gender
    FROM secondary WHERE tfrrs_athlete_id IS NOT NULL
  UNION ALL
  SELECT 'athletic_net', athletic_net_id, canonical_athlete_id, full_name, gender
    FROM secondary WHERE athletic_net_id IS NOT NULL;

  SELECT count(*) INTO candidate_pairs FROM _merge_identity_pairs;
  SELECT count(*) INTO held_pairs FROM _merge_identity_pairs WHERE conflict;
  SELECT count(*) INTO duplicate_athletes
    FROM _merge_athlete_map WHERE athlete_id <> canonical_athlete_id;
  SELECT count(*) INTO source_identities FROM _merge_source_identities;

  SELECT md5(string_agg(canonical_athlete_id::text || ':' || athlete_id::text,
                        ',' ORDER BY athlete_id))
    INTO mapping_fingerprint FROM _merge_athlete_map
   WHERE athlete_id <> canonical_athlete_id;
  SELECT md5(string_agg(athlete_a::text || ':' || athlete_b::text,
                        ',' ORDER BY athlete_a, athlete_b))
    INTO held_fingerprint FROM _merge_identity_pairs WHERE conflict;
  SELECT md5(string_agg(result_id::text || ':' || action || ':' || canonical_athlete_id::text,
                        ',' ORDER BY result_id))
    INTO result_fingerprint FROM _merge_result_plan
   WHERE athlete_id <> canonical_athlete_id;
  SELECT md5(string_agg(relay_athlete_id::text || ':' || action || ':' || canonical_athlete_id::text,
                        ',' ORDER BY relay_athlete_id))
    INTO relay_fingerprint FROM _merge_relay_plan
   WHERE athlete_id <> canonical_athlete_id;
  SELECT md5(string_agg(id::text || ':' || action || ':' || canonical_athlete_id::text,
                        ',' ORDER BY id))
    INTO pr_fingerprint FROM _merge_pr_plan
   WHERE athlete_id <> canonical_athlete_id;
  SELECT md5(string_agg(athlete_id::text || ':' || school_id::text || ':' ||
                        coalesce(athletic_net_url, ''), ',' ORDER BY athlete_id))
    INTO profile_fingerprint FROM _merge_profile_plan;
  SELECT md5(string_agg(o.observation_id::text || ':' ||
                        coalesce(m.canonical_athlete_id, o.target_athlete_id)::text || ':' ||
                        coalesce(p.survivor_result_id, o.canonical_result_id)::text,
                        ',' ORDER BY o.observation_id))
    INTO observation_fingerprint
    FROM ingest.observations o
    LEFT JOIN _merge_athlete_map m
      ON m.athlete_id = o.target_athlete_id AND m.athlete_id <> m.canonical_athlete_id
    LEFT JOIN _merge_result_plan p
      ON p.result_id = o.canonical_result_id AND p.action = 'delete_duplicate'
   WHERE m.athlete_id IS NOT NULL OR p.result_id IS NOT NULL;
  SELECT md5(string_agg(sl.source_record_id::text || ':' || p.survivor_result_id::text,
                        ',' ORDER BY sl.source_record_id))
    INTO source_link_fingerprint
    FROM ingest.source_links sl JOIN _merge_result_plan p ON p.result_id = sl.result_id
   WHERE p.action = 'delete_duplicate';
  SELECT md5(string_agg('alias:' || a.athlete_alias_id::text || ':' ||
                        m.canonical_athlete_id::text, ',' ORDER BY a.athlete_alias_id))
    INTO alias_fingerprint
    FROM ingest.athlete_aliases a
    JOIN _merge_athlete_map m ON m.athlete_id = a.target_athlete_id
   WHERE m.athlete_id <> m.canonical_athlete_id;
  SELECT md5(string_agg('season:' || s.ats_id::text || ':' ||
                        m.canonical_athlete_id::text, ',' ORDER BY s.ats_id))
    INTO season_fingerprint
    FROM public.athlete_team_seasons s JOIN _merge_athlete_map m USING (athlete_id)
   WHERE m.athlete_id <> m.canonical_athlete_id;

  IF candidate_pairs <> 671 OR held_pairs <> 4 OR duplicate_athletes <> 667
     OR source_identities <> 341
     OR mapping_fingerprint <> 'e31c072e2661b32edd038a79f1f00d30'
     OR held_fingerprint <> '7223f94ba7ba9ed537ca07cc8ed7f8d2'
     OR result_fingerprint <> 'b726cf4cffd370b012b2c940fa4d03f6'
     OR relay_fingerprint <> '981642206986864e669bd81e78102b6d'
     OR pr_fingerprint <> '84410615bf95d05021bb75872585b06c'
     OR profile_fingerprint <> '08fcb79ed8b76695b50a5c68c3ca6d7a'
     OR observation_fingerprint <> 'd984ab42003e0c272e7eee1caf138e36'
     OR source_link_fingerprint <> '8b467b80eb4d59e9c4de5013ad7db9bc'
     OR alias_fingerprint <> '7b6994be7d3d72f7228a1d4bc58e3ae5'
     OR season_fingerprint <> 'd2a93b68970d019bb85a12a34439df07' THEN
    RAISE EXCEPTION 'reviewed athlete merge evidence/action fingerprints changed';
  END IF;

  IF (SELECT count(*) FROM _merge_result_plan
       WHERE athlete_id <> canonical_athlete_id AND action = 'delete_duplicate') <> 1255
     OR (SELECT count(*) FROM _merge_result_plan
       WHERE athlete_id <> canonical_athlete_id AND action = 'move') <> 689
     OR (SELECT count(*) FROM _merge_relay_plan
       WHERE athlete_id <> canonical_athlete_id AND action = 'move') <> 134
     OR EXISTS (SELECT 1 FROM _merge_relay_plan
       WHERE athlete_id <> canonical_athlete_id AND action <> 'move')
     OR (SELECT count(*) FROM _merge_pr_plan
       WHERE athlete_id <> canonical_athlete_id AND action = 'delete_duplicate') <> 4
     OR (SELECT count(*) FROM _merge_pr_plan
       WHERE athlete_id <> canonical_athlete_id AND action = 'move') <> 5
     OR (SELECT count(*) FROM _merge_profile_plan) <> 4
     OR (SELECT count(*) FROM public.athlete_team_seasons s JOIN _merge_athlete_map m USING (athlete_id)
       WHERE m.athlete_id <> m.canonical_athlete_id) <> 1
     OR (SELECT count(*) FROM ingest.observations o
       WHERE EXISTS (SELECT 1 FROM _merge_athlete_map m
                      WHERE m.athlete_id = o.target_athlete_id
                        AND m.athlete_id <> m.canonical_athlete_id)
          OR EXISTS (SELECT 1 FROM _merge_result_plan p
                      WHERE p.result_id = o.canonical_result_id
                        AND p.action = 'delete_duplicate')) <> 151
     OR (SELECT count(*) FROM ingest.athlete_aliases a JOIN _merge_athlete_map m
       ON m.athlete_id = a.target_athlete_id
       WHERE m.athlete_id <> m.canonical_athlete_id) <> 2
     OR (SELECT count(*) FROM ingest.source_links sl JOIN _merge_result_plan p
       ON p.result_id = sl.result_id WHERE p.action = 'delete_duplicate') <> 9
     OR EXISTS (SELECT 1 FROM public.external_ids x JOIN _merge_athlete_map m USING (athlete_id)
       WHERE m.athlete_id <> m.canonical_athlete_id)
     OR EXISTS (SELECT 1 FROM public.live_results x JOIN _merge_athlete_map m USING (athlete_id)
       WHERE m.athlete_id <> m.canonical_athlete_id) THEN
    RAISE EXCEPTION 'reviewed athlete merge dependent-row counts changed';
  END IF;

  -- The four conflicting PR keys are exact performance ties. Prefer the existing canonical row.
  IF EXISTS (
    SELECT 1
      FROM public.athlete_prs d
      JOIN _merge_pr_plan p ON p.id = d.id AND p.action = 'delete_duplicate'
      JOIN public.athlete_prs c
        ON c.athlete_id = p.canonical_athlete_id
       AND c.event_name = d.event_name
       AND c.season IS NOT DISTINCT FROM d.season
     WHERE c.mark_seconds IS DISTINCT FROM d.mark_seconds
        OR c.mark_meters IS DISTINCT FROM d.mark_meters
  ) THEN
    RAISE EXCEPTION 'reviewed PR conflict is no longer an exact performance tie';
  END IF;

  -- Secondary source keys must already resolve to the canonical athlete in both identity systems.
  IF (SELECT count(*) FROM _merge_source_identities i JOIN public.external_ids x
       ON x.source = i.source AND x.external_key = i.source_key
      AND x.athlete_id = i.canonical_athlete_id AND x.verified IS TRUE) <> 341
     OR (SELECT count(*) FROM _merge_source_identities i JOIN ingest.athlete_aliases a
       ON a.source = i.source AND a.source_athlete_key = i.source_key
      AND a.target_athlete_id = i.canonical_athlete_id AND a.status = 'active') <> 341 THEN
    RAISE EXCEPTION 'reviewed secondary athlete identities are not fully preserved';
  END IF;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.athletes',
         'duplicate:' || a.athlete_id::text || ':' || m.canonical_athlete_id::text, to_jsonb(a)
    FROM public.athletes a JOIN _merge_athlete_map m USING (athlete_id)
   WHERE m.athlete_id <> m.canonical_athlete_id;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.athletes', 'canonical:' || a.athlete_id::text, to_jsonb(a)
    FROM public.athletes a JOIN _merge_profile_plan p USING (athlete_id);

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.results', p.action || ':' || r.result_id::text || ':' ||
         CASE WHEN p.action = 'move' THEN p.canonical_athlete_id ELSE p.survivor_result_id END::text,
         to_jsonb(r)
    FROM public.results r JOIN _merge_result_plan p USING (result_id)
   WHERE p.athlete_id <> p.canonical_athlete_id;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.relay_athletes', ra.relay_athlete_id::text || ':' || p.canonical_athlete_id::text,
         to_jsonb(ra)
    FROM public.relay_athletes ra JOIN _merge_relay_plan p USING (relay_athlete_id)
   WHERE p.athlete_id <> p.canonical_athlete_id;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.athlete_prs', p.action || ':' || pr.id::text || ':' || p.canonical_athlete_id::text,
         to_jsonb(pr)
    FROM public.athlete_prs pr JOIN _merge_pr_plan p USING (id)
   WHERE p.athlete_id <> p.canonical_athlete_id;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.athlete_team_seasons', s.ats_id::text || ':' || m.canonical_athlete_id::text,
         to_jsonb(s)
    FROM public.athlete_team_seasons s JOIN _merge_athlete_map m USING (athlete_id)
   WHERE m.athlete_id <> m.canonical_athlete_id;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'ingest.observations', o.observation_id::text, to_jsonb(o)
    FROM ingest.observations o
   WHERE EXISTS (SELECT 1 FROM _merge_athlete_map m
                  WHERE m.athlete_id = o.target_athlete_id
                    AND m.athlete_id <> m.canonical_athlete_id)
      OR EXISTS (SELECT 1 FROM _merge_result_plan p
                  WHERE p.result_id = o.canonical_result_id
                    AND p.action = 'delete_duplicate');

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'ingest.athlete_aliases', a.athlete_alias_id::text, to_jsonb(a)
    FROM ingest.athlete_aliases a JOIN _merge_athlete_map m
      ON m.athlete_id = a.target_athlete_id
   WHERE m.athlete_id <> m.canonical_athlete_id;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'ingest.source_links', sl.source_record_id::text, to_jsonb(sl)
    FROM ingest.source_links sl JOIN _merge_result_plan p ON p.result_id = sl.result_id
   WHERE p.action = 'delete_duplicate';

  IF (SELECT count(*) FROM ingest.fact_cleanup_archive WHERE operation_key = operation)
       <> expected_archive_rows THEN
    RAISE EXCEPTION 'reviewed athlete archive count mismatch';
  END IF;

  UPDATE ingest.source_links sl SET result_id = p.survivor_result_id
    FROM _merge_result_plan p
   WHERE p.action = 'delete_duplicate' AND sl.result_id = p.result_id;

  UPDATE ingest.observations o SET canonical_result_id = p.survivor_result_id
    FROM _merge_result_plan p
   WHERE p.action = 'delete_duplicate' AND o.canonical_result_id = p.result_id;

  DELETE FROM public.results r USING _merge_result_plan p
   WHERE r.result_id = p.result_id AND p.action = 'delete_duplicate';

  UPDATE public.results r SET athlete_id = p.canonical_athlete_id
    FROM _merge_result_plan p
   WHERE r.result_id = p.result_id AND p.action = 'move';

  UPDATE public.relay_athletes ra SET athlete_id = p.canonical_athlete_id
    FROM _merge_relay_plan p
   WHERE ra.relay_athlete_id = p.relay_athlete_id
     AND p.athlete_id <> p.canonical_athlete_id AND p.action = 'move';

  DELETE FROM public.athlete_prs pr USING _merge_pr_plan p
   WHERE pr.id = p.id AND p.action = 'delete_duplicate';

  UPDATE public.athlete_prs pr SET athlete_id = p.canonical_athlete_id
    FROM _merge_pr_plan p WHERE pr.id = p.id AND p.action = 'move';

  UPDATE public.athlete_team_seasons s SET athlete_id = m.canonical_athlete_id
    FROM _merge_athlete_map m
   WHERE s.athlete_id = m.athlete_id AND m.athlete_id <> m.canonical_athlete_id;

  UPDATE ingest.observations o SET target_athlete_id = m.canonical_athlete_id
    FROM _merge_athlete_map m
   WHERE o.target_athlete_id = m.athlete_id AND m.athlete_id <> m.canonical_athlete_id;

  UPDATE ingest.athlete_aliases a SET target_athlete_id = m.canonical_athlete_id,
         updated_at = now()
    FROM _merge_athlete_map m
   WHERE a.target_athlete_id = m.athlete_id AND m.athlete_id <> m.canonical_athlete_id;

  UPDATE public.athletes a SET school_id = p.school_id,
         athletic_net_url = p.athletic_net_url, updated_at = now()
    FROM _merge_profile_plan p WHERE a.athlete_id = p.athlete_id;

  DELETE FROM public.athletes a USING _merge_athlete_map m
   WHERE a.athlete_id = m.athlete_id AND m.athlete_id <> m.canonical_athlete_id;

  IF EXISTS (SELECT 1 FROM _merge_athlete_map m JOIN public.athletes a USING (athlete_id)
              WHERE m.athlete_id <> m.canonical_athlete_id)
     OR EXISTS (SELECT 1 FROM _merge_athlete_map m JOIN public.results r USING (athlete_id)
              WHERE m.athlete_id <> m.canonical_athlete_id)
     OR EXISTS (SELECT 1 FROM _merge_athlete_map m JOIN public.relay_athletes r USING (athlete_id)
              WHERE m.athlete_id <> m.canonical_athlete_id)
     OR EXISTS (SELECT 1 FROM _merge_athlete_map m JOIN public.athlete_prs r USING (athlete_id)
              WHERE m.athlete_id <> m.canonical_athlete_id)
     OR EXISTS (SELECT 1 FROM _merge_athlete_map m JOIN public.athlete_team_seasons r USING (athlete_id)
              WHERE m.athlete_id <> m.canonical_athlete_id)
     OR EXISTS (SELECT 1 FROM _merge_athlete_map m JOIN public.external_ids r USING (athlete_id)
              WHERE m.athlete_id <> m.canonical_athlete_id)
     OR EXISTS (SELECT 1 FROM _merge_athlete_map m JOIN public.live_results r USING (athlete_id)
              WHERE m.athlete_id <> m.canonical_athlete_id)
     OR EXISTS (SELECT 1 FROM _merge_athlete_map m JOIN ingest.observations r
              ON r.target_athlete_id = m.athlete_id WHERE m.athlete_id <> m.canonical_athlete_id)
     OR EXISTS (SELECT 1 FROM _merge_athlete_map m JOIN ingest.athlete_aliases r
              ON r.target_athlete_id = m.athlete_id WHERE m.athlete_id <> m.canonical_athlete_id)
     OR EXISTS (SELECT 1 FROM ingest.source_links sl JOIN _merge_result_plan p
              ON p.result_id = sl.result_id WHERE p.action = 'delete_duplicate')
     OR EXISTS (SELECT 1 FROM ingest.observations o JOIN _merge_result_plan p
              ON p.result_id = o.canonical_result_id WHERE p.action = 'delete_duplicate') THEN
    RAISE EXCEPTION 'reviewed athlete consolidation left a duplicate reference behind';
  END IF;
END
$$;
