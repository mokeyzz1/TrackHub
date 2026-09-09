-- Preserve the 341 reviewed secondary athlete source identities before consolidating athlete rows.
--
-- This creates no table. It uses the existing public.external_ids portability map and the private
-- ingest.athlete_aliases resolver. The evidence set is pinned by exact counts and fingerprints so
-- changed data cannot silently produce a different identity plan.

DO $$
DECLARE
  operation constant text := '20260902_preserve_reviewed_secondary_athlete_identities';
  candidate_pairs integer;
  held_pairs integer;
  duplicate_athletes integer;
  source_identities integer;
  alias_count integer;
  external_count integer;
  mapping_fingerprint text;
  identity_fingerprint text;
  held_fingerprint text;
BEGIN
  PERFORM set_config('statement_timeout', '10min', true);
  PERFORM set_config('lock_timeout', '5s', true);

  DROP TABLE IF EXISTS
    _reviewed_identity_facts,
    _reviewed_identity_pairs,
    _reviewed_athlete_merge_map,
    _reviewed_source_identities,
    _reviewed_identity_dates;

  CREATE TEMP TABLE _reviewed_identity_facts ON COMMIT DROP AS
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

  CREATE INDEX ON _reviewed_identity_facts
    (meet_id, event_type_id, place_key, round_key, mark_key);
  CREATE INDEX ON _reviewed_identity_facts (athlete_id, date, meet_id);

  CREATE TEMP TABLE _reviewed_identity_pairs ON COMMIT DROP AS
  SELECT f1.athlete_id AS athlete_a, f2.athlete_id AS athlete_b,
         false AS conflict
    FROM _reviewed_identity_facts f1
    JOIN _reviewed_identity_facts f2
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

  -- Restrict the contradiction check to dates/meets belonging to candidate athletes. The full
  -- facts table is millions of rows on production; probing it pair-by-pair can exceed the hosted
  -- statement timeout even with the broad facts indexes.
  CREATE TEMP TABLE _reviewed_identity_dates ON COMMIT DROP AS
  SELECT DISTINCT f.athlete_id, f.date, f.meet_id
    FROM _reviewed_identity_facts f
    JOIN (
      SELECT athlete_a AS athlete_id FROM _reviewed_identity_pairs
      UNION
      SELECT athlete_b FROM _reviewed_identity_pairs
    ) c USING (athlete_id)
   WHERE f.date IS NOT NULL;
  CREATE INDEX ON _reviewed_identity_dates (athlete_id, date, meet_id);

  UPDATE _reviewed_identity_pairs p
     SET conflict = true
   WHERE EXISTS (
     SELECT 1
       FROM _reviewed_identity_dates x
       JOIN _reviewed_identity_dates y
         ON y.athlete_id = p.athlete_b
        AND y.date = x.date
        AND y.meet_id <> x.meet_id
      WHERE x.athlete_id = p.athlete_a
   );

  CREATE TEMP TABLE _reviewed_athlete_merge_map ON COMMIT DROP AS
  WITH RECURSIVE edges AS (
    SELECT athlete_a AS a, athlete_b AS b
      FROM _reviewed_identity_pairs WHERE NOT conflict
  ), nodes AS (
    SELECT a AS node FROM edges UNION SELECT b FROM edges
  ), reach(root, node) AS (
    SELECT node, node FROM nodes
    UNION
    SELECT r.root, CASE WHEN e.a = r.node THEN e.b ELSE e.a END
      FROM reach r
      JOIN edges e ON e.a = r.node OR e.b = r.node
  )
  SELECT node AS athlete_id, min(root) AS canonical_athlete_id
    FROM reach GROUP BY node;

  CREATE TEMP TABLE _reviewed_source_identities ON COMMIT DROP AS
  WITH secondary AS (
    SELECT m.athlete_id, m.canonical_athlete_id, a.full_name, a.gender,
           a.tfrrs_athlete_id, a.tfrrs_profile_url,
           substring(a.athletic_net_url FROM '/athlete/([0-9]+)') AS athletic_net_id,
           a.athletic_net_url
      FROM _reviewed_athlete_merge_map m
      JOIN public.athletes a USING (athlete_id)
     WHERE m.athlete_id <> m.canonical_athlete_id
  )
  SELECT 'tfrrs'::text AS source,
         tfrrs_athlete_id AS source_key,
         full_name AS source_name,
         gender AS source_gender,
         canonical_athlete_id,
         tfrrs_profile_url AS source_url
    FROM secondary WHERE tfrrs_athlete_id IS NOT NULL
  UNION ALL
  SELECT 'athletic_net', athletic_net_id, full_name, gender,
         canonical_athlete_id, athletic_net_url
    FROM secondary WHERE athletic_net_id IS NOT NULL;

  SELECT count(*) INTO candidate_pairs FROM _reviewed_identity_pairs;
  SELECT count(*) INTO held_pairs FROM _reviewed_identity_pairs WHERE conflict;
  SELECT count(*) INTO duplicate_athletes
    FROM _reviewed_athlete_merge_map WHERE athlete_id <> canonical_athlete_id;
  SELECT count(*) INTO source_identities FROM _reviewed_source_identities;

  SELECT md5(string_agg(canonical_athlete_id::text || ':' || athlete_id::text,
                        ',' ORDER BY athlete_id))
    INTO mapping_fingerprint
    FROM _reviewed_athlete_merge_map
   WHERE athlete_id <> canonical_athlete_id;

  SELECT md5(string_agg(source || ':' || source_key || ':' || canonical_athlete_id::text,
                        ',' ORDER BY source, source_key))
    INTO identity_fingerprint
    FROM _reviewed_source_identities;

  SELECT md5(string_agg(athlete_a::text || ':' || athlete_b::text,
                        ',' ORDER BY athlete_a, athlete_b))
    INTO held_fingerprint
    FROM _reviewed_identity_pairs WHERE conflict;

  IF candidate_pairs <> 671
     OR held_pairs <> 4
     OR duplicate_athletes <> 667
     OR source_identities <> 341
     OR mapping_fingerprint <> 'e31c072e2661b32edd038a79f1f00d30'
     OR identity_fingerprint <> '3c49daca52c8ead8d82667b10e58be6a'
     OR held_fingerprint <> '7223f94ba7ba9ed537ca07cc8ed7f8d2' THEN
    RAISE EXCEPTION
      'reviewed athlete identity evidence changed (pairs %, held %, duplicates %, identities %, map %, identities %, held %)',
      candidate_pairs, held_pairs, duplicate_athletes, source_identities,
      mapping_fingerprint, identity_fingerprint, held_fingerprint;
  END IF;

  IF EXISTS (
    SELECT 1 FROM _reviewed_source_identities
     WHERE source_gender NOT IN ('M', 'F') OR source_key IS NULL
  ) THEN
    RAISE EXCEPTION 'reviewed athlete identity contains an invalid source key or gender';
  END IF;

  SELECT count(*) INTO alias_count
    FROM _reviewed_source_identities i
    JOIN ingest.athlete_aliases a
      ON a.source = i.source AND a.source_athlete_key = i.source_key;
  SELECT count(*) INTO external_count
    FROM _reviewed_source_identities i
    JOIN public.external_ids x
      ON x.source = i.source AND x.external_key = i.source_key;

  IF alias_count = 341 AND external_count = 341 THEN
    IF EXISTS (
      SELECT 1
        FROM _reviewed_source_identities i
        JOIN ingest.athlete_aliases a
          ON a.source = i.source AND a.source_athlete_key = i.source_key
       WHERE a.target_athlete_id <> i.canonical_athlete_id OR a.status <> 'active'
    ) OR EXISTS (
      SELECT 1
        FROM _reviewed_source_identities i
        JOIN public.external_ids x
          ON x.source = i.source AND x.external_key = i.source_key
       WHERE x.athlete_id <> i.canonical_athlete_id OR x.verified IS NOT TRUE
    ) THEN
      RAISE EXCEPTION 'existing reviewed athlete identities conflict with the canonical mapping';
    END IF;
    RETURN;
  END IF;

  IF alias_count <> 0 OR external_count <> 0 THEN
    RAISE EXCEPTION 'reviewed athlete identities are partially populated (aliases %, external IDs %)',
      alias_count, external_count;
  END IF;

  INSERT INTO public.external_ids
    (athlete_id, source, external_name, external_key, external_url, verified)
  SELECT canonical_athlete_id, source, source_name, source_key, source_url, true
    FROM _reviewed_source_identities
   ORDER BY source, source_key
  ON CONFLICT (source, external_key) DO NOTHING;

  INSERT INTO ingest.athlete_aliases
    (source, source_athlete_key, source_athlete_name, source_gender,
     target_athlete_id, match_method, status, notes)
  SELECT source, source_key, source_name, source_gender,
         canonical_athlete_id, 'verified_alias', 'active',
         operation || ': shared exact meet/event/place/round/mark evidence; same-day conflict excluded'
    FROM _reviewed_source_identities
   ORDER BY source, source_key
  ON CONFLICT (source, source_athlete_key) DO NOTHING;

  IF (SELECT count(*)
        FROM _reviewed_source_identities i
        JOIN public.external_ids x
          ON x.source = i.source AND x.external_key = i.source_key
         AND x.athlete_id = i.canonical_athlete_id AND x.verified IS TRUE) <> 341
     OR (SELECT count(*)
           FROM _reviewed_source_identities i
           JOIN ingest.athlete_aliases a
             ON a.source = i.source AND a.source_athlete_key = i.source_key
            AND a.target_athlete_id = i.canonical_athlete_id AND a.status = 'active') <> 341 THEN
    RAISE EXCEPTION 'reviewed athlete source identity insertion did not complete exactly';
  END IF;
END
$$;
