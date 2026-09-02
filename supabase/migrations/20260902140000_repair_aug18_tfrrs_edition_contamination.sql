-- Repair the 2026-08-18 TFRRS annual-edition contamination incident.
--
-- match-tfrrs-index.js verified only month/day, not year. It assigned 2026 TFRRS result URLs to
-- 160 older annual meet shells more than three days from the actual meet. The subsequent importer
-- copied 106,219 individual results, 3,246 relay parents, and 12,626 relay legs into those shells.
-- This repair archives every original row, removes facts already present on the correct meet,
-- relocates one representative of facts not already present, and preserves all preexisting rows.

DO $$
DECLARE
  operation constant text := '20260902_aug18_tfrrs_edition_contamination';
  archive_count bigint;
  mapping_count integer;
  individual_count bigint;
  relay_count bigint;
  relay_leg_count bigint;
  individual_keeper_count bigint;
  relay_keeper_count bigint;
BEGIN
  SELECT count(*) INTO archive_count
    FROM ingest.fact_cleanup_archive WHERE operation_key = operation;

  -- A completed operation is a replay-safe no-op. A partial archive is never accepted.
  IF archive_count <> 0 THEN
    IF archive_count = 122251
       AND (SELECT count(*)
              FROM ingest.fact_cleanup_archive a
              JOIN public.meets m ON m.meet_id = a.source_pk::integer
             WHERE a.operation_key = operation AND a.source_table = 'public.meets'
               AND m.tfrrs_url IS NULL AND m.results_status = 'missing_tfrrs_url'
               AND m.results_imported_at IS NULL AND m.results_source IS NULL) = 160
       AND (SELECT count(*)
              FROM ingest.fact_cleanup_archive a
              JOIN public.results r ON r.result_id = a.source_pk::bigint
             WHERE a.operation_key = operation AND a.source_table = 'public.results'
               AND r.meet_id <> (a.row_data->>'meet_id')::integer) = 19434
       AND (SELECT count(*)
              FROM ingest.fact_cleanup_archive a
              JOIN public.relay_results r ON r.relay_result_id = a.source_pk::integer
             WHERE a.operation_key = operation AND a.source_table = 'public.relay_results'
               AND r.meet_id <> (a.row_data->>'meet_id')::integer) = 156
       AND (SELECT count(*)
              FROM ingest.fact_cleanup_archive a
              JOIN public.relay_athletes r ON r.relay_athlete_id = a.source_pk::integer
             WHERE a.operation_key = operation AND a.source_table = 'public.relay_athletes') = 583 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'August 18 cleanup archive/state is incomplete or inconsistent (% rows)',
      archive_count;
  END IF;

  DROP TABLE IF EXISTS
    _aug18_sourced_meets, _aug18_meet_map, _aug18_individual,
    _aug18_individual_groups, _aug18_individual_actions,
    _aug18_relay_legs, _aug18_relays, _aug18_relay_groups, _aug18_relay_actions;

  CREATE TEMP TABLE _aug18_sourced_meets ON COMMIT DROP AS
  SELECT m.*,
         substring(coalesce(nullif(m.tfrrs_url, ''), nullif(m.meet_url, ''))
                   FROM '/results/([0-9]+)') AS source_id
    FROM public.meets m;

  CREATE TEMP TABLE _aug18_meet_map ON COMMIT DROP AS
  SELECT bad.meet_id AS bad_meet_id,
         good.meet_id AS good_meet_id,
         good.name AS good_meet_name,
         good.date AS good_meet_date,
         good.location AS good_meet_location,
         CASE
           WHEN good.season ILIKE 'Indoor%' THEN 'indoor'
           WHEN good.season ILIKE 'Outdoor%' THEN 'outdoor'
           WHEN good.season ILIKE 'Cross Country%' OR good.season ILIKE 'XC%' THEN 'cross_country'
         END AS good_environment,
         bad.source_id
    FROM _aug18_sourced_meets bad
    JOIN _aug18_sourced_meets good USING (source_id)
   WHERE bad.meet_id <> good.meet_id
     AND nullif(bad.meet_url, '') IS NULL
     AND nullif(good.meet_url, '') IS NOT NULL
     AND bad.updated_at::date = DATE '2026-08-18'
     AND abs(bad.date - good.date) > 3;
  ALTER TABLE _aug18_meet_map ADD PRIMARY KEY (bad_meet_id);

  SELECT count(*) INTO mapping_count FROM _aug18_meet_map;
  IF mapping_count <> 160
     OR (SELECT count(DISTINCT good_meet_id) FROM _aug18_meet_map) <> 108
     OR EXISTS (SELECT 1 FROM _aug18_meet_map WHERE source_id IS NULL)
     OR EXISTS (SELECT good_meet_id FROM _aug18_meet_map GROUP BY good_meet_id, source_id
                 HAVING count(DISTINCT source_id) <> 1) THEN
    RAISE EXCEPTION 'expected 160 reviewed old-to-current meet mappings, found %', mapping_count;
  END IF;

  CREATE TEMP TABLE _aug18_individual ON COMMIT DROP AS
  SELECT r.result_id, r.meet_id AS bad_meet_id, m.good_meet_id,
         m.good_meet_name, m.good_meet_date, m.good_meet_location, m.good_environment,
         r.athlete_id, r.event_type_id, r.place, r.round, r.mark_raw,
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
    FROM public.results r
    JOIN _aug18_meet_map m ON m.bad_meet_id = r.meet_id
   WHERE r.created_at::date = DATE '2026-08-18';
  ALTER TABLE _aug18_individual ADD PRIMARY KEY (result_id);

  -- Dense rank supplies a null-safe semantic group identifier without concatenated-key ambiguity.
  ALTER TABLE _aug18_individual ADD COLUMN group_id bigint;
  WITH ranked AS (
    SELECT result_id,
           dense_rank() OVER (ORDER BY good_meet_id, athlete_id, event_type_id, place,
                                      mark_key, round_key) AS group_id
      FROM _aug18_individual
  )
  UPDATE _aug18_individual i SET group_id = r.group_id
    FROM ranked r WHERE r.result_id = i.result_id;

  CREATE TEMP TABLE _aug18_individual_groups ON COMMIT DROP AS
  SELECT i.group_id,
         bool_or(
           EXISTS (
             SELECT 1 FROM public.results good
              WHERE good.meet_id = i.good_meet_id
                AND good.athlete_id IS NOT DISTINCT FROM i.athlete_id
                AND good.event_type_id IS NOT DISTINCT FROM i.event_type_id
                AND good.place IS NOT DISTINCT FROM i.place
                AND CASE
                      WHEN good.mark_seconds IS NOT NULL
                        THEN 's:' || round(good.mark_seconds::numeric, 5)::text
                      WHEN good.mark_meters IS NOT NULL
                        THEN 'm:' || round(good.mark_meters::numeric, 4)::text
                      ELSE 'r:' || lower(regexp_replace(coalesce(good.mark_raw, ''), '[ah]$', '', 'i'))
                    END = i.mark_key
                AND CASE
                      WHEN lower(coalesce(good.round, '')) LIKE 'final%' THEN 'final'
                      WHEN lower(coalesce(good.round, '')) LIKE 'prelim%' THEN 'prelim'
                      ELSE lower(coalesce(good.round, ''))
                    END = i.round_key
           )
           OR EXISTS (
             -- Mirror the live unique index so a floating-point representation difference cannot
             -- turn a confirmed duplicate into a relocation conflict.
             SELECT 1 FROM public.results good
              WHERE good.meet_id = i.good_meet_id
                AND good.athlete_id IS NOT DISTINCT FROM i.athlete_id
                AND good.event_type_id IS NOT DISTINCT FROM i.event_type_id
                AND good.place IS NOT DISTINCT FROM i.place
                AND lower(regexp_replace(good.mark_raw, '[ah]$', '', 'i'))
                    IS NOT DISTINCT FROM lower(regexp_replace(i.mark_raw, '[ah]$', '', 'i'))
                AND good.round IS NOT DISTINCT FROM i.round
           )
         ) AS has_canonical_target,
         count(*)::integer AS row_count
    FROM _aug18_individual i
   GROUP BY i.group_id;
  ALTER TABLE _aug18_individual_groups ADD PRIMARY KEY (group_id);

  CREATE TEMP TABLE _aug18_individual_actions ON COMMIT DROP AS
  SELECT i.result_id, i.good_meet_id, i.good_meet_name, i.good_meet_date,
         i.good_meet_location, i.good_environment,
         CASE WHEN g.has_canonical_target OR
                        row_number() OVER (PARTITION BY i.group_id ORDER BY i.result_id) > 1
              THEN 'delete' ELSE 'relocate' END AS action
    FROM _aug18_individual i
    JOIN _aug18_individual_groups g USING (group_id);
  ALTER TABLE _aug18_individual_actions ADD PRIMARY KEY (result_id);

  CREATE TEMP TABLE _aug18_relay_legs ON COMMIT DROP AS
  SELECT rr.relay_result_id,
         count(ra.relay_athlete_id)::integer AS leg_count,
         count(ra.athlete_id)::integer AS known_leg_count
    FROM public.relay_results rr
    JOIN _aug18_meet_map m ON m.bad_meet_id = rr.meet_id
    LEFT JOIN public.relay_athletes ra USING (relay_result_id)
   WHERE rr.created_at::date = DATE '2026-08-18'
   GROUP BY rr.relay_result_id;
  ALTER TABLE _aug18_relay_legs ADD PRIMARY KEY (relay_result_id);

  CREATE TEMP TABLE _aug18_relays ON COMMIT DROP AS
  SELECT rr.relay_result_id, rr.meet_id AS bad_meet_id, m.good_meet_id,
         m.good_meet_name, m.good_meet_date, rr.team_id, rr.event_type_id,
         rr.place, rr.round, rr.mark_raw, l.leg_count, l.known_leg_count,
         CASE
           WHEN rr.mark_seconds IS NOT NULL THEN 's:' || round(rr.mark_seconds, 5)::text
           ELSE 'r:' || lower(regexp_replace(coalesce(rr.mark_raw, ''), '[ah]$', '', 'i'))
         END AS mark_key,
         CASE
           WHEN lower(coalesce(rr.round, '')) LIKE 'final%' THEN 'final'
           WHEN lower(coalesce(rr.round, '')) LIKE 'prelim%' THEN 'prelim'
           ELSE lower(coalesce(rr.round, ''))
         END AS round_key
    FROM public.relay_results rr
    JOIN _aug18_meet_map m ON m.bad_meet_id = rr.meet_id
    JOIN _aug18_relay_legs l USING (relay_result_id)
   WHERE rr.created_at::date = DATE '2026-08-18';
  ALTER TABLE _aug18_relays ADD PRIMARY KEY (relay_result_id);
  ALTER TABLE _aug18_relays ADD COLUMN group_id bigint;
  WITH ranked AS (
    SELECT relay_result_id,
           dense_rank() OVER (ORDER BY good_meet_id, team_id, event_type_id, place,
                                      mark_key, round_key) AS group_id
      FROM _aug18_relays
  )
  UPDATE _aug18_relays r SET group_id = x.group_id
    FROM ranked x WHERE x.relay_result_id = r.relay_result_id;

  CREATE TEMP TABLE _aug18_relay_groups ON COMMIT DROP AS
  SELECT r.group_id,
         bool_or(
           EXISTS (
             SELECT 1 FROM public.relay_results good
              WHERE good.meet_id = r.good_meet_id
                AND good.team_id IS NOT DISTINCT FROM r.team_id
                AND good.event_type_id IS NOT DISTINCT FROM r.event_type_id
                AND good.place IS NOT DISTINCT FROM r.place
                AND CASE
                      WHEN good.mark_seconds IS NOT NULL
                        THEN 's:' || round(good.mark_seconds, 5)::text
                      ELSE 'r:' || lower(regexp_replace(coalesce(good.mark_raw, ''), '[ah]$', '', 'i'))
                    END = r.mark_key
                AND CASE
                      WHEN lower(coalesce(good.round, '')) LIKE 'final%' THEN 'final'
                      WHEN lower(coalesce(good.round, '')) LIKE 'prelim%' THEN 'prelim'
                      ELSE lower(coalesce(good.round, ''))
                    END = r.round_key
           )
           OR EXISTS (
             SELECT 1 FROM public.relay_results good
              WHERE good.meet_id = r.good_meet_id
                AND good.team_id IS NOT DISTINCT FROM r.team_id
                AND good.event_type_id IS NOT DISTINCT FROM r.event_type_id
                AND good.place IS NOT DISTINCT FROM r.place
                AND lower(regexp_replace(good.mark_raw, '[ah]$', '', 'i'))
                    IS NOT DISTINCT FROM lower(regexp_replace(r.mark_raw, '[ah]$', '', 'i'))
                AND good.round IS NOT DISTINCT FROM r.round
           )
         ) AS has_canonical_target,
         count(*)::integer AS row_count
    FROM _aug18_relays r
   GROUP BY r.group_id;
  ALTER TABLE _aug18_relay_groups ADD PRIMARY KEY (group_id);

  CREATE TEMP TABLE _aug18_relay_actions ON COMMIT DROP AS
  SELECT r.relay_result_id, r.good_meet_id, r.good_meet_name, r.good_meet_date,
         CASE WHEN g.has_canonical_target OR
                        row_number() OVER (
                          PARTITION BY r.group_id
                          ORDER BY r.known_leg_count DESC, r.leg_count DESC, r.relay_result_id
                        ) > 1
              THEN 'delete' ELSE 'relocate' END AS action
    FROM _aug18_relays r
    JOIN _aug18_relay_groups g USING (group_id);
  ALTER TABLE _aug18_relay_actions ADD PRIMARY KEY (relay_result_id);

  SELECT count(*) INTO individual_count FROM _aug18_individual;
  SELECT count(*) INTO relay_count FROM _aug18_relays;
  SELECT coalesce(sum(leg_count), 0) INTO relay_leg_count FROM _aug18_relay_legs;
  SELECT count(*) INTO individual_keeper_count
    FROM _aug18_individual_actions WHERE action = 'relocate';
  SELECT count(*) INTO relay_keeper_count
    FROM _aug18_relay_actions WHERE action = 'relocate';

  IF individual_count <> 106219 OR relay_count <> 3246 OR relay_leg_count <> 12626
     OR individual_keeper_count <> 19434 OR relay_keeper_count <> 156 THEN
    RAISE EXCEPTION
      'reviewed counts drifted (individual %, relay %, legs %, individual keepers %, relay keepers %)',
      individual_count, relay_count, relay_leg_count,
      individual_keeper_count, relay_keeper_count;
  END IF;

  IF (SELECT count(*) FROM ingest.source_links sl
        JOIN _aug18_individual i ON i.result_id = sl.result_id) <> 0
     OR (SELECT count(*) FROM ingest.observations o
          JOIN _aug18_individual i ON i.result_id = o.canonical_result_id) <> 0
     OR (SELECT count(*) FROM ingest.source_links sl
          JOIN _aug18_relays r ON r.relay_result_id = sl.relay_result_id) <> 0
     OR (SELECT count(*) FROM ingest.observations o
          JOIN _aug18_relays r ON r.relay_result_id = o.canonical_relay_id) <> 0 THEN
    RAISE EXCEPTION 'contaminated facts unexpectedly acquired provenance references';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM _aug18_individual_actions a
      JOIN public.results r ON r.result_id = a.result_id
     WHERE a.action = 'relocate'
     GROUP BY a.good_meet_id, r.athlete_id, r.event_type_id, r.place,
              lower(regexp_replace(r.mark_raw, '[ah]$', '', 'i')), r.round
    HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1
      FROM _aug18_relay_actions a
      JOIN public.relay_results r ON r.relay_result_id = a.relay_result_id
     WHERE a.action = 'relocate'
     GROUP BY a.good_meet_id, r.team_id, r.event_type_id, r.place,
              lower(regexp_replace(r.mark_raw, '[ah]$', '', 'i')), r.round
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'relocated representatives would conflict with each other';
  END IF;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.meets', m.meet_id::text, to_jsonb(m)
    FROM public.meets m JOIN _aug18_meet_map x ON x.bad_meet_id = m.meet_id;
  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.results', r.result_id::text, to_jsonb(r)
    FROM public.results r JOIN _aug18_individual i USING (result_id);
  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.relay_results', r.relay_result_id::text, to_jsonb(r)
    FROM public.relay_results r JOIN _aug18_relays x USING (relay_result_id);
  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.relay_athletes', a.relay_athlete_id::text, to_jsonb(a)
    FROM public.relay_athletes a JOIN _aug18_relays r USING (relay_result_id);

  IF (SELECT count(*) FROM ingest.fact_cleanup_archive WHERE operation_key = operation) <> 122251 THEN
    RAISE EXCEPTION 'cleanup archive must contain exactly 122251 rows';
  END IF;

  DELETE FROM public.relay_athletes a
   USING _aug18_relay_actions x
   WHERE x.relay_result_id = a.relay_result_id AND x.action = 'delete';
  DELETE FROM public.relay_results r
   USING _aug18_relay_actions x
   WHERE x.relay_result_id = r.relay_result_id AND x.action = 'delete';
  DELETE FROM public.results r
   USING _aug18_individual_actions x
   WHERE x.result_id = r.result_id AND x.action = 'delete';

  UPDATE public.results r
     SET meet_id = x.good_meet_id,
         meet_name = x.good_meet_name,
         meet_location = x.good_meet_location,
         date = x.good_meet_date,
         environment = coalesce(x.good_environment, r.environment)
    FROM _aug18_individual_actions x
   WHERE x.result_id = r.result_id AND x.action = 'relocate';

  UPDATE public.relay_results r
     SET meet_id = x.good_meet_id,
         meet_name = x.good_meet_name,
         date = x.good_meet_date
    FROM _aug18_relay_actions x
   WHERE x.relay_result_id = r.relay_result_id AND x.action = 'relocate';

  UPDATE public.meets m
     SET tfrrs_url = NULL,
         tfrrs_meet_id = NULL,
         results_status = 'missing_tfrrs_url',
         results_last_checked_at = now(),
         results_imported_at = NULL,
         results_error = NULL,
         results_source = NULL,
         updated_at = now()
    FROM _aug18_meet_map x
   WHERE x.bad_meet_id = m.meet_id;

  IF EXISTS (
    SELECT 1 FROM public.results r JOIN _aug18_meet_map m ON m.bad_meet_id = r.meet_id
     WHERE r.created_at::date = DATE '2026-08-18'
  ) OR EXISTS (
    SELECT 1 FROM public.relay_results r JOIN _aug18_meet_map m ON m.bad_meet_id = r.meet_id
     WHERE r.created_at::date = DATE '2026-08-18'
  ) OR (SELECT count(*) FROM public.results r
         JOIN _aug18_individual_actions a ON a.result_id = r.result_id
        WHERE a.action = 'relocate' AND r.meet_id = a.good_meet_id) <> individual_keeper_count
     OR (SELECT count(*) FROM public.relay_results r
          JOIN _aug18_relay_actions a ON a.relay_result_id = r.relay_result_id
         WHERE a.action = 'relocate' AND r.meet_id = a.good_meet_id) <> relay_keeper_count THEN
    RAISE EXCEPTION 'August 18 cleanup postconditions failed';
  END IF;
END
$$;
