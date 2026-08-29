-- Correct the California community-college division and add the verified TFRRS teams
-- needed by the 2025-26 recovery runs.
--
-- This migration is additive and identity-safe:
--   * existing school/team IDs are preserved;
--   * the previous NJCAA label is corrected only for schools whose TFRRS URL proves they
--     are California community-college teams;
--   * missing schools and M/F teams are inserted only when no canonical name already exists;
--   * source aliases resolve display labels to those canonical teams without hardcoded IDs.

INSERT INTO public.divisions (code, display_name, governing_body, sort_order)
SELECT 'CCCAA', 'California Community College Athletic Association', 'CCCAA', 6
WHERE NOT EXISTS (
  SELECT 1 FROM public.divisions WHERE code = 'CCCAA'
);

-- The earlier California junior-college migration used NJCAA as a placeholder. Correct only
-- the rows proven by their CA_jcollege TFRRS URLs; no school or team identity is changed.
UPDATE public.schools s
SET division = 'CCCAA',
    division_id = d.division_id,
    updated_at = now()
FROM public.divisions d
WHERE d.code = 'CCCAA'
  AND s.division = 'NJCAA'
  AND s.division_id = (SELECT division_id FROM public.divisions WHERE code = 'NJCAA' LIMIT 1)
  AND EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.school_id = s.school_id
      AND t.tfrrs_team_url ILIKE '%/CA_jcollege_%'
  );

-- These are the remaining community colleges present in the official TFRRS SoCal/Western
-- State/Pacific Coast team catalogs but absent from the canonical school table at audit time.
WITH desired (canonical_name, source_label, source_slug, city, state) AS (
  VALUES
    ('Allan Hancock College', 'Allan Hancock', 'Allan_Hancock', 'Santa Maria', 'CA'),
    ('Antelope Valley College', 'Antelope Valley', 'Antelope_Valley', 'Lancaster', 'CA'),
    ('Bakersfield College', 'Bakersfield', 'Bakersfield', 'Bakersfield', 'CA'),
    ('College of the Canyons', 'Canyons', 'Canyons', 'Santa Clarita', 'CA'),
    ('Cuesta College', 'Cuesta', 'Cuesta', 'San Luis Obispo', 'CA'),
    ('Cuyamaca College', 'Cuyamaca', 'Cuyamaca', 'El Cajon', 'CA'),
    ('Glendale Community College', 'Glendale', 'Glendale', 'Glendale', 'CA'),
    ('Los Angeles Harbor College', 'LA Harbor', 'LA_Harbor', 'Wilmington', 'CA'),
    ('Moorpark College', 'Moorpark', 'Moorpark', 'Moorpark', 'CA'),
    ('San Bernardino Valley College', 'San Bernardino Valley', 'San_Bernardino_Valley', 'San Bernardino', 'CA'),
    ('San Diego Mesa College', 'San Diego Mesa', 'San_Diego_Mesa', 'San Diego', 'CA'),
    ('Santa Barbara City College', 'Santa Barbara', 'Santa_Barbara', 'Santa Barbara', 'CA'),
    ('Santa Monica College', 'Santa Monica', 'Santa_Monica', 'Santa Monica', 'CA'),
    ('Southwestern College', 'Southwestern', 'Southwestern', 'Chula Vista', 'CA'),
    ('Ventura College', 'Ventura', 'Ventura', 'Ventura', 'CA'),
    ('West Los Angeles College', 'West Los Angeles', 'West_Los_Angeles', 'Culver City', 'CA')
), cccaa AS (
  SELECT division_id
  FROM public.divisions
  WHERE code = 'CCCAA'
  LIMIT 1
)
INSERT INTO public.schools (
  official_name, short_name, city, state, division, division_id, is_active
)
SELECT d.canonical_name, d.source_label, d.city, d.state, 'CCCAA', c.division_id, true
FROM desired d
CROSS JOIN cccaa c
WHERE NOT EXISTS (
  SELECT 1
  FROM public.schools s
  WHERE lower(s.official_name) = lower(d.canonical_name)
     OR lower(coalesce(s.short_name, '')) = lower(d.canonical_name)
);

WITH desired (canonical_name, source_slug) AS (
  VALUES
    ('Allan Hancock College', 'Allan_Hancock'),
    ('Antelope Valley College', 'Antelope_Valley'),
    ('Bakersfield College', 'Bakersfield'),
    ('College of the Canyons', 'Canyons'),
    ('Cuesta College', 'Cuesta'),
    ('Cuyamaca College', 'Cuyamaca'),
    ('Glendale Community College', 'Glendale'),
    ('Los Angeles Harbor College', 'LA_Harbor'),
    ('Moorpark College', 'Moorpark'),
    ('San Bernardino Valley College', 'San_Bernardino_Valley'),
    ('San Diego Mesa College', 'San_Diego_Mesa'),
    ('Santa Barbara City College', 'Santa_Barbara'),
    ('Santa Monica College', 'Santa_Monica'),
    ('Southwestern College', 'Southwestern'),
    ('Ventura College', 'Ventura'),
    ('West Los Angeles College', 'West_Los_Angeles')
), genders (gender) AS (
  VALUES ('M'), ('F')
)
INSERT INTO public.teams (school_id, gender, tfrrs_team_url, is_active)
SELECT
  s.school_id,
  g.gender,
  'https://www.tfrrs.org/teams/tf/CA_jcollege_' || lower(g.gender) || '_' || d.source_slug || '.html',
  true
FROM desired d
JOIN public.schools s ON lower(s.official_name) = lower(d.canonical_name)
CROSS JOIN genders g
WHERE NOT EXISTS (
  SELECT 1
  FROM public.teams t
  WHERE t.school_id = s.school_id
    AND t.gender = g.gender
);

-- Keep both stable TFRRS slugs and the labels seen in result tables. The latter are important
-- because some TFRRS result pages emit plain text instead of a linked team identity.
WITH aliases (canonical_name, source_team_key, source_team_name) AS (
  VALUES
    ('Allan Hancock College', 'Allan_Hancock', 'Allan Hancock'),
    ('Antelope Valley College', 'Antelope_Valley', 'Antelope Valley'),
    ('Bakersfield College', 'Bakersfield', 'Bakersfield'),
    ('College of the Canyons', 'Canyons', 'Canyons'),
    ('Cuesta College', 'Cuesta', 'Cuesta'),
    ('Cuyamaca College', 'Cuyamaca', 'Cuyamaca'),
    ('Glendale Community College', 'Glendale', 'Glendale'),
    ('Los Angeles Harbor College', 'LA_Harbor', 'LA Harbor'),
    ('Los Angeles Harbor College', 'Los Angeles Harbor', 'Los Angeles Harbor'),
    ('Moorpark College', 'Moorpark', 'Moorpark'),
    ('San Bernardino Valley College', 'San_Bernardino_Valley', 'San Bernardino Valley'),
    ('San Diego Mesa College', 'San_Diego_Mesa', 'San Diego Mesa'),
    ('Santa Barbara City College', 'Santa_Barbara', 'Santa Barbara'),
    ('Santa Barbara City College', 'Santa Barbara City', 'Santa Barbara City'),
    ('Santa Monica College', 'Santa_Monica', 'Santa Monica'),
    ('Southwestern College', 'Southwestern', 'Southwestern'),
    ('Southwestern College', 'Southwestern College', 'Southwestern College'),
    ('Ventura College', 'Ventura', 'Ventura'),
    ('West Los Angeles College', 'West_Los_Angeles', 'West Los Angeles'),
    ('West Los Angeles College', 'West Los Angeles College', 'West Los Angeles College')
), genders (gender) AS (
  VALUES ('M'), ('F')
)
INSERT INTO ingest.team_aliases (
  source,
  source_team_key,
  source_team_name,
  source_gender,
  normalized_source_team_key,
  normalized_source_team_name,
  team_id,
  match_method,
  notes
)
SELECT
  'tfrrs',
  a.source_team_key,
  a.source_team_name,
  g.gender,
  lower(regexp_replace(a.source_team_key, '[^a-zA-Z0-9]+', ' ', 'g')),
  lower(regexp_replace(a.source_team_name, '[^a-zA-Z0-9]+', ' ', 'g')),
  t.team_id,
  'verified_alias',
  'Verified against the official TFRRS California community-college team catalog; classified under CCCAA.'
FROM aliases a
JOIN public.schools s ON lower(s.official_name) = lower(a.canonical_name)
JOIN public.teams t ON t.school_id = s.school_id
CROSS JOIN genders g
WHERE t.gender = g.gender
ON CONFLICT (source, normalized_source_team_key, source_gender) DO UPDATE
SET source_team_name = EXCLUDED.source_team_name,
    normalized_source_team_name = EXCLUDED.normalized_source_team_name,
    team_id = EXCLUDED.team_id,
    status = 'active',
    match_method = EXCLUDED.match_method,
    notes = EXCLUDED.notes,
    verified_at = now(),
    updated_at = now();
