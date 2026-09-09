-- Reconciles the mixed conference catalog into current primary NCAA/NAIA conferences
-- plus the existing Puerto Rico LAI league. Secondary associations, regions, governing
-- bodies, aliases, and stale "Independent" placeholders do not belong in conferences.
--
-- Current-source evidence checked 2026-09-04:
--   NCAA membership directory: https://www.ncaa.org/about-us/membership-directory/
--   NAIA conference ratings: https://www.naia.org/news/mens-cross-country/2025-26-naia-mens-cross-country-preseason-conference-ratings/
--   WAC -> UAC: https://uacsports.com/news/2026/6/24/general-united-athletic-conference-unveils-new-brand-identity-forge-ahead.aspx
--   Golden State -> Great Southwest: https://gsacsports.org/sports/2022/10/17/History.aspx
--   Cheyney NCAA exit: https://psacsports.org/news/2018/3/20/general-psac-statement-on-cheyney-university.aspx
--   Alliance closure: https://www.nysed.gov/college-university-evaluation/alliance-university-closure-information
--   Penn State York USCAA/PSUAC: https://www.psuac.prestosports.com/index
--
-- Every changed conference and school is archived before mutation.
-- Rollback: docs/database-audit/rollback_reconcile_primary_conference_catalog.sql

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  operation constant text := '20260904_reconcile_primary_conference_catalog_v1';
  expected_before_conferences constant integer := 197;
  expected_deleted_conferences constant integer := 79;
  expected_updated_conferences constant integer := 23;
  expected_alias_conferences constant integer := 39;
  expected_alias_school_rewires constant integer := 44;
  expected_manual_school_changes constant integer := 58;
  expected_affected_schools constant integer := 102;
  archived_count integer;
  changed_count integer;
  deleted_count integer;
BEGIN
  LOCK TABLE public.conferences IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.schools IN SHARE ROW EXCLUSIVE MODE;

  IF (SELECT count(*) FROM public.conferences) <> expected_before_conferences THEN
    RAISE EXCEPTION 'conference inventory drifted; expected % rows', expected_before_conferences;
  END IF;

  IF (SELECT count(*) FROM public.conference_memberships) <> 0
     OR (SELECT count(*) FROM public.external_ids WHERE conference_id IS NOT NULL) <> 0 THEN
    RAISE EXCEPTION 'new conference dependencies appeared; rerun the dependency audit';
  END IF;

  IF (SELECT count(*) FROM ingest.fact_cleanup_archive WHERE operation_key = operation) <> 0 THEN
    RAISE EXCEPTION 'operation archive is already populated';
  END IF;

  IF EXISTS (
    SELECT required.code
    FROM (VALUES ('DI'), ('DII'), ('DIII'), ('NAIA'), ('USCAA'), ('LAI')) AS required(code)
    LEFT JOIN public.divisions d ON d.code = required.code
    WHERE d.division_id IS NULL
  ) THEN
    RAISE EXCEPTION 'required division dimension rows are missing';
  END IF;

  CREATE TEMP TABLE _conference_merge_map (
    source_conference_id bigint PRIMARY KEY,
    target_conference_id bigint NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _conference_merge_map (source_conference_id, target_conference_id)
  SELECT source.conference_id, target.conference_id
  FROM public.conferences source
  JOIN public.conferences target
    ON target.division = 'DIII'
   AND source.division = 'DIII'
   AND lower(btrim(source.name)) = lower(btrim(target.abbreviation))
   AND source.conference_id <> target.conference_id;

  INSERT INTO _conference_merge_map (source_conference_id, target_conference_id)
  SELECT source.conference_id, target.conference_id
  FROM (VALUES
    ('American Rivers', 'American Rivers Conference'),
    ('Little East', 'Little East Conference')
  ) AS mapping(source_name, target_name)
  JOIN public.conferences source ON source.name = mapping.source_name
  JOIN public.conferences target ON target.name = mapping.target_name;

  IF (SELECT count(*) FROM _conference_merge_map) <> expected_alias_conferences THEN
    RAISE EXCEPTION 'expected % DIII alias rows, mapped %',
      expected_alias_conferences, (SELECT count(*) FROM _conference_merge_map);
  END IF;

  IF (SELECT count(*)
      FROM public.schools s
      JOIN _conference_merge_map m ON m.source_conference_id = s.current_conference_id)
       <> expected_alias_school_rewires THEN
    RAISE EXCEPTION 'expected % DIII alias school rewires', expected_alias_school_rewires;
  END IF;

  CREATE TEMP TABLE _manual_school_change_spec (
    source_conference_name text NOT NULL,
    school_name text NOT NULL,
    target_conference_name text,
    change_conference boolean NOT NULL DEFAULT true,
    target_division_code text,
    change_division boolean NOT NULL DEFAULT false,
    target_is_active boolean,
    change_is_active boolean NOT NULL DEFAULT false,
    PRIMARY KEY (source_conference_name, school_name)
  ) ON COMMIT DROP;

  INSERT INTO _manual_school_change_spec
    (source_conference_name, school_name, target_conference_name,
     change_conference, target_division_code, change_division,
     target_is_active, change_is_active)
  VALUES
    ('GNAC', 'St. Joseph''s (Me.)', 'Great Northeast Athletic Conference', true, null, false, null, false),
    ('Northeast-10', 'American Int''l', 'Northeast-10 Conference', true, null, false, null, false),
    ('Northeast-10', 'So. Conn. State', 'Northeast-10 Conference', true, null, false, null, false),

    ('Mets', 'St. John''s University', 'BIG EAST', true, null, false, null, false),
    ('Heptagonals', 'Brown', 'Ivy League', true, null, false, null, false),
    ('Heptagonals', 'Columbia', 'Ivy League', true, null, false, null, false),
    ('Heptagonals', 'Cornell', 'Ivy League', true, null, false, null, false),
    ('Heptagonals', 'Dartmouth', 'Ivy League', true, null, false, null, false),
    ('Heptagonals', 'Harvard', 'Ivy League', true, null, false, null, false),
    ('Heptagonals', 'Penn', 'Ivy League', true, null, false, null, false),
    ('Heptagonals', 'Princeton', 'Ivy League', true, null, false, null, false),
    ('Heptagonals', 'Yale', 'Ivy League', true, null, false, null, false),
    ('None', 'St. Francis College (New York)', null, true, null, false, false, true),
    ('NEICAAA', 'Connecticut', 'BIG EAST', true, null, false, null, false),
    ('NEICAAA', 'Providence', 'BIG EAST', true, null, false, null, false),
    ('IC4A/ECAC', 'Georgetown', 'BIG EAST', true, null, false, null, false),
    ('IC4A/ECAC', 'Temple University', 'The American', true, null, false, null, false),
    ('IC4A/ECAC', 'Villanova', 'BIG EAST', true, null, false, null, false),
    ('MPSF', 'Oregon State', 'Pac-12', true, null, false, null, false),
    ('MPSF', 'Washington State', 'Pac-12', true, null, false, null, false),

    ('Heartland Conference', 'St. Mary''s University (Texas)', 'Lone Star Conference', true, null, false, null, false),
    ('Independents', 'Alaska Anchorage', 'Great Northwest Athletic Conference', true, null, false, null, false),
    ('Independents', 'Alaska Fairbanks', 'Great Northwest Athletic Conference', true, null, false, null, false),
    ('Independents', 'Auburn Montgomery', 'Gulf South Conference', true, null, false, null, false),
    ('Independents', 'Cheyney', null, true, null, true, null, false),
    ('Independents', 'Dominican (N.Y.)', 'Central Atlantic Collegiate Conference', true, null, false, null, false),
    ('Independents', 'Gannon', 'Pennsylvania State Athletic Conference', true, null, false, null, false),
    ('Independents', 'Georgia College', 'Peach Belt Conference', true, null, false, null, false),
    ('Independents', 'Saint Michael''s College', 'Northeast-10 Conference', true, null, false, null, false),
    ('Independents', 'Shepherd', 'Pennsylvania State Athletic Conference', true, null, false, null, false),
    ('Independents', 'Union (Tenn.)', 'Gulf South Conference', true, null, false, null, false),
    ('Independents', 'Valdosta State', 'Gulf South Conference', true, null, false, null, false),
    ('Independents', 'Virginia Union', 'Central Intercollegiate Athletic Association', true, null, false, null, false),
    ('Independents', 'Wayne State (Mich.)', 'Great Lakes Intercollegiate Athletic Conference', true, null, false, null, false),
    ('Independents', 'West Florida', 'Gulf South Conference', true, null, false, null, false),
    ('Independent', 'Alliance', null, true, null, false, false, true),
    ('Independent', 'New Paltz St', 'State University of New York Athletic Conference', true, null, false, null, false),
    ('Independent', 'Penn State York', null, true, 'USCAA', true, null, false),

    ('Independent (NCAA Division III)', 'Clark', 'New England Women''s and Men''s Athletic Conference', true, null, false, null, false),
    ('Independent (NCAA Division III)', 'Clarkson', 'Liberty League', true, null, false, null, false),
    ('Independent (NCAA Division III)', 'Emerson', 'New England Women''s and Men''s Athletic Conference', true, null, false, null, false),
    ('Independent (NCAA Division III)', 'Endicott', 'Conference of New England', true, null, false, null, false),
    ('Independent (NCAA Division III)', 'Kalamazoo', 'Michigan Intercollegiate Athletic Association', true, null, false, null, false),
    ('Independent (NCAA Division III)', 'Lycoming', 'Landmark Conference', true, null, false, null, false),
    ('Independent (NCAA Division III)', 'Penn State Berks', 'United East Conference', true, null, false, null, false),
    ('Independent (NCAA Division III)', 'Wilkes', 'Landmark Conference', true, null, false, null, false),

    ('Golden State Athletic Conference', 'Simpson Cal', 'California Pacific Conference', true, null, false, null, false),
    ('NAIA Independent', 'MSU-Northern', 'Frontier Conference', true, null, false, null, false),
    ('Midlands Collegiate Athletic Conference', 'Central Christian', 'Sooner Athletic Conference', true, null, false, null, false),
    ('North Star Athletic Association', 'Bellevue University', 'Frontier Conference', true, null, false, null, false),
    ('North Star Athletic Association', 'Dakota State', 'Frontier Conference', true, null, false, null, false),
    ('North Star Athletic Association', 'Dickinson St', 'Frontier Conference', true, null, false, null, false),
    ('North Star Athletic Association', 'Valley City State', 'Frontier Conference', true, null, false, null, false),

    ('Liga Atlética Interuniversitaria de Puerto Rico', 'P.R.-Bayamon', null, false, 'LAI', true, null, false),
    ('Liga Atlética Interuniversitaria de Puerto Rico', 'P.R.-Carolina', null, false, 'LAI', true, null, false),
    ('Liga Atlética Interuniversitaria de Puerto Rico', 'P.R.-Cayey', null, false, 'LAI', true, null, false),
    ('Liga Atlética Interuniversitaria de Puerto Rico', 'P.R.-Mayaguez', null, false, 'LAI', true, null, false),
    ('Liga Atlética Interuniversitaria de Puerto Rico', 'P.R.-Rio Piedras', null, false, 'LAI', true, null, false);

  IF (SELECT count(*) FROM _manual_school_change_spec) <> expected_manual_school_changes THEN
    RAISE EXCEPTION 'manual school change specification is incomplete';
  END IF;

  CREATE TEMP TABLE _manual_school_changes ON COMMIT DROP AS
  SELECT s.school_id,
         target.conference_id AS target_conference_id,
         spec.change_conference,
         d.division_id AS target_division_id,
         spec.target_division_code,
         spec.change_division,
         spec.target_is_active,
         spec.change_is_active
  FROM _manual_school_change_spec spec
  JOIN public.conferences source ON source.name = spec.source_conference_name
  JOIN public.schools s
    ON s.current_conference_id = source.conference_id
   AND s.official_name = spec.school_name
  LEFT JOIN public.conferences target ON target.name = spec.target_conference_name
  LEFT JOIN public.divisions d ON d.code = spec.target_division_code;

  ALTER TABLE _manual_school_changes ADD PRIMARY KEY (school_id);

  IF (SELECT count(*) FROM _manual_school_changes) <> expected_manual_school_changes
     OR EXISTS (
       SELECT 1
       FROM _manual_school_change_spec spec
       LEFT JOIN public.conferences target ON target.name = spec.target_conference_name
       WHERE spec.target_conference_name IS NOT NULL
         AND target.conference_id IS NULL
     )
     OR EXISTS (
       SELECT 1
       FROM _manual_school_change_spec spec
       LEFT JOIN public.divisions d ON d.code = spec.target_division_code
       WHERE spec.change_division
         AND spec.target_division_code IS NOT NULL
         AND d.division_id IS NULL
     ) THEN
    RAISE EXCEPTION 'one or more reviewed school changes no longer resolve exactly';
  END IF;

  CREATE TEMP TABLE _website_transfer_map (
    source_name text PRIMARY KEY,
    target_name text NOT NULL UNIQUE
  ) ON COMMIT DROP;

  INSERT INTO _website_transfer_map VALUES
    ('RMAC', 'Rocky Mountain Athletic Conference'),
    ('Northeast-10', 'Northeast-10 Conference'),
    ('Gulf South', 'Gulf South Conference'),
    ('GNAC', 'Great Northeast Athletic Conference'),
    ('SIAC', 'Southern Intercollegiate Athletic Conference'),
    ('South Atlantic', 'South Atlantic Conference'),
    ('Lone Star', 'Lone Star Conference'),
    ('Peach Belt', 'Peach Belt Conference'),
    ('Great Midwest', 'Great Midwest Athletic Conference'),
    ('Sunshine State', 'Sunshine State Conference'),
    ('PacWest', 'Pacific West Conference'),
    ('PSAC', 'Pennsylvania State Athletic Conference'),
    ('CIAA', 'Central Intercollegiate Athletic Association'),
    ('CCAA', 'California Collegiate Athletic Association'),
    ('Mountain East', 'Mountain East Conference'),
    ('ECC', 'East Coast Conference'),
    ('GLIAC', 'Great Lakes Intercollegiate Athletic Conference'),
    ('GLVC', 'Great Lakes Valley Conference');

  IF (SELECT count(*)
      FROM _website_transfer_map m
      JOIN public.conferences source ON source.name = m.source_name
      JOIN public.conferences target ON target.name = m.target_name
      WHERE source.website IS NOT NULL AND target.website IS NULL) <> 18 THEN
    RAISE EXCEPTION 'conference source URL transfer inputs drifted';
  END IF;

  CREATE TEMP TABLE _conference_delete_ids (conference_id bigint PRIMARY KEY) ON COMMIT DROP;

  INSERT INTO _conference_delete_ids
  SELECT conference_id
  FROM public.conferences
  WHERE division IS NULL
    AND name NOT IN ('Ivy League', 'Pac-12');

  INSERT INTO _conference_delete_ids
  SELECT conference_id FROM public.conferences
  WHERE name IN (
    'DI Great Lakes Region', 'DI Mid-Atlantic Region', 'Heptagonals', 'IC4A/ECAC',
    'Mets', 'MPSF', 'NEICAAA', 'None',
    'Heartland Conference', 'Independent', 'Independents',
    'Independent (NCAA Division III)',
    'Midlands Collegiate Athletic Conference', 'NAIA Independent', 'North Star Athletic Association'
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO _conference_delete_ids
  SELECT source_conference_id FROM _conference_merge_map
  ON CONFLICT DO NOTHING;

  IF (SELECT count(*) FROM _conference_delete_ids) <> expected_deleted_conferences THEN
    RAISE EXCEPTION 'expected % conference deletions, resolved %',
      expected_deleted_conferences, (SELECT count(*) FROM _conference_delete_ids);
  END IF;

  CREATE TEMP TABLE _conference_update_ids (conference_id bigint PRIMARY KEY) ON COMMIT DROP;

  INSERT INTO _conference_update_ids
  SELECT conference_id FROM public.conferences
  WHERE name IN (
    'Ivy League', 'Pac-12', 'WAC', 'Golden State Athletic Conference',
    'Liga Atlética Interuniversitaria de Puerto Rico'
  );

  INSERT INTO _conference_update_ids
  SELECT target.conference_id
  FROM _website_transfer_map m
  JOIN public.conferences target ON target.name = m.target_name
  ON CONFLICT DO NOTHING;

  IF (SELECT count(*) FROM _conference_update_ids) <> expected_updated_conferences THEN
    RAISE EXCEPTION 'expected % conference updates, resolved %',
      expected_updated_conferences, (SELECT count(*) FROM _conference_update_ids);
  END IF;

  CREATE TEMP TABLE _affected_school_ids (school_id bigint PRIMARY KEY) ON COMMIT DROP;

  INSERT INTO _affected_school_ids
  SELECT s.school_id
  FROM public.schools s
  JOIN _conference_merge_map m ON m.source_conference_id = s.current_conference_id;

  INSERT INTO _affected_school_ids
  SELECT school_id FROM _manual_school_changes
  ON CONFLICT DO NOTHING;

  IF (SELECT count(*) FROM _affected_school_ids) <> expected_affected_schools THEN
    RAISE EXCEPTION 'expected % affected schools, resolved %',
      expected_affected_schools, (SELECT count(*) FROM _affected_school_ids);
  END IF;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.conferences.deleted', c.conference_id::text, to_jsonb(c)
  FROM public.conferences c
  JOIN _conference_delete_ids x USING (conference_id)
  ORDER BY c.conference_id;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.conferences.updated', c.conference_id::text, to_jsonb(c)
  FROM public.conferences c
  JOIN _conference_update_ids x USING (conference_id)
  ORDER BY c.conference_id;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.schools.affiliation', s.school_id::text, to_jsonb(s)
  FROM public.schools s
  JOIN _affected_school_ids x USING (school_id)
  ORDER BY s.school_id;

  SELECT count(*) INTO archived_count
  FROM ingest.fact_cleanup_archive
  WHERE operation_key = operation;

  IF archived_count <> expected_deleted_conferences
                       + expected_updated_conferences
                       + expected_affected_schools THEN
    RAISE EXCEPTION 'cleanup archive is incomplete (% rows)', archived_count;
  END IF;

  UPDATE public.conferences target
  SET website = source.website
  FROM _website_transfer_map m
  JOIN public.conferences source ON source.name = m.source_name
  WHERE target.name = m.target_name
    AND target.website IS NULL;

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> 18 THEN
    RAISE EXCEPTION 'expected 18 source URL transfers, updated %', changed_count;
  END IF;

  UPDATE public.conferences
  SET division = 'DI',
      division_id = (SELECT division_id FROM public.divisions WHERE code = 'DI'),
      abbreviation = CASE name
        WHEN 'Ivy League' THEN 'Ivy'
        WHEN 'Pac-12' THEN 'PAC-12'
      END
  WHERE name IN ('Ivy League', 'Pac-12');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ivy League and Pac-12 records were not updated';
  END IF;

  UPDATE public.conferences
  SET name = 'United Athletic Conference', abbreviation = 'UAC'
  WHERE name = 'WAC';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WAC record was not found for current-name update';
  END IF;

  UPDATE public.conferences
  SET name = 'Great Southwest Athletic Conference', abbreviation = 'GSAC'
  WHERE name = 'Golden State Athletic Conference';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Golden State record was not found for current-name update';
  END IF;

  UPDATE public.conferences
  SET division = 'LAI',
      division_id = (SELECT division_id FROM public.divisions WHERE code = 'LAI'),
      abbreviation = 'LAI'
  WHERE name = 'Liga Atlética Interuniversitaria de Puerto Rico';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LAI conference record was not found';
  END IF;

  UPDATE public.schools s
  SET current_conference_id = CASE
        WHEN change.change_conference THEN change.target_conference_id
        ELSE s.current_conference_id
      END,
      division = CASE
        WHEN change.change_division THEN change.target_division_code
        ELSE s.division
      END,
      division_id = CASE
        WHEN change.change_division THEN change.target_division_id
        ELSE s.division_id
      END,
      is_active = CASE
        WHEN change.change_is_active THEN change.target_is_active
        ELSE s.is_active
      END
  FROM _manual_school_changes change
  WHERE s.school_id = change.school_id;

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> expected_manual_school_changes THEN
    RAISE EXCEPTION 'expected % reviewed school changes, updated %',
      expected_manual_school_changes, changed_count;
  END IF;

  UPDATE public.schools s
  SET current_conference_id = m.target_conference_id
  FROM _conference_merge_map m
  WHERE s.current_conference_id = m.source_conference_id;

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> expected_alias_school_rewires THEN
    RAISE EXCEPTION 'expected % DIII alias school rewires, updated %',
      expected_alias_school_rewires, changed_count;
  END IF;

  DELETE FROM public.conferences c
  USING _conference_delete_ids x
  WHERE c.conference_id = x.conference_id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count <> expected_deleted_conferences THEN
    RAISE EXCEPTION 'expected % conference deletions, deleted %',
      expected_deleted_conferences, deleted_count;
  END IF;

  IF (SELECT count(*) FROM public.conferences) <> 118
     OR (SELECT count(*) FROM public.conferences WHERE division = 'DI') <> 32
     OR (SELECT count(*) FROM public.conferences WHERE division = 'DII') <> 23
     OR (SELECT count(*) FROM public.conferences WHERE division = 'DIII') <> 42
     OR (SELECT count(*) FROM public.conferences WHERE division = 'NAIA') <> 20
     OR (SELECT count(*) FROM public.conferences WHERE division = 'LAI') <> 1
     OR (SELECT count(*) FROM public.conferences
         WHERE division IN ('DI', 'DII', 'DIII', 'NAIA')) <> 117
     OR EXISTS (SELECT 1 FROM public.conferences WHERE division IS NULL OR division_id IS NULL)
     OR EXISTS (
       SELECT 1
       FROM public.conferences c
       LEFT JOIN public.divisions d ON d.division_id = c.division_id
       WHERE d.code IS DISTINCT FROM c.division
     )
     OR EXISTS (
       SELECT 1 FROM public.conferences
       GROUP BY lower(btrim(name)) HAVING count(*) > 1
     )
     OR EXISTS (
       SELECT 1 FROM public.schools s
       LEFT JOIN public.conferences c ON c.conference_id = s.current_conference_id
       WHERE s.current_conference_id IS NOT NULL AND c.conference_id IS NULL
     ) THEN
    RAISE EXCEPTION 'conference reconciliation postcondition failed';
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM public.schools s JOIN public.divisions d USING (division_id)
       WHERE s.official_name = 'Penn State York' AND d.code = 'USCAA'
     )
     OR EXISTS (
       SELECT 1 FROM public.schools
       WHERE official_name IN ('St. Francis College (New York)', 'Alliance')
         AND is_active
     )
     OR EXISTS (
       SELECT 1 FROM public.schools
       WHERE official_name = 'Cheyney'
         AND (division IS NOT NULL OR division_id IS NOT NULL OR current_conference_id IS NOT NULL)
     )
     OR (SELECT count(*) FROM public.schools s JOIN public.divisions d USING (division_id)
         WHERE d.code = 'LAI'
           AND s.official_name IN ('P.R.-Bayamon', 'P.R.-Carolina', 'P.R.-Cayey', 'P.R.-Mayaguez', 'P.R.-Rio Piedras')) <> 5 THEN
    RAISE EXCEPTION 'reviewed school lifecycle/affiliation postcondition failed';
  END IF;

  RAISE NOTICE 'reconciled conference catalog: 197 -> 118 rows; archived % rows; changed % schools',
    archived_count, expected_affected_schools;
END
$$;

COMMIT;
