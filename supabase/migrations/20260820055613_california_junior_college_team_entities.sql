-- Verified California junior-college entities needed by the 2026 Orange Empire and South Coast
-- recovery runs. This migration is additive: existing schools/teams are reused, missing schools
-- get one canonical row, and each school receives one M and one F team.

WITH desired (canonical_name, source_label, source_slug, city, state) AS (
  VALUES
    ('Riverside City College', 'Riverside', 'Riverside', 'Riverside', 'CA'),
    ('Orange Coast', 'Orange Coast', 'Orange_Coast', 'Costa Mesa', 'CA'),
    ('Saddleback College', 'Saddleback', 'Saddleback', 'Mission Viejo', 'CA'),
    ('Fullerton College', 'Fullerton', 'Fullerton', 'Fullerton', 'CA'),
    ('Golden West College', 'Golden West', 'Golden_West', 'Huntington Beach', 'CA'),
    ('Santa Ana College', 'Santa Ana', 'Santa_Ana', 'Santa Ana', 'CA'),
    ('Mt. San Antonio College', 'Mt. SAC', 'Mt_SAC', 'Walnut', 'CA'),
    ('Cerritos', 'Cerritos', 'Cerritos', 'Norwalk', 'CA'),
    ('Long Beach City College', 'Long Beach', 'Long_Beach', 'Long Beach', 'CA'),
    ('El Camino College', 'El Camino', 'El_Camino', 'Torrance', 'CA'),
    ('East Los Angeles College', 'East LA', 'East_LA', 'Monterey Park', 'CA'),
    ('Pasadena City College', 'Pasadena', 'Pasadena', 'Pasadena', 'CA')
),
division AS (
  SELECT division_id
  FROM public.divisions
  WHERE code = 'NJCAA'
  LIMIT 1
)
INSERT INTO public.schools (
  official_name, short_name, city, state, division, division_id, is_active
)
SELECT d.canonical_name, d.source_label, d.city, d.state, 'NJCAA', division.division_id, true
FROM desired d
CROSS JOIN division
WHERE NOT EXISTS (
  SELECT 1
  FROM public.schools s
  WHERE lower(s.official_name) = lower(d.canonical_name)
);

WITH desired (canonical_name, source_label, source_slug, city, state) AS (
  VALUES
    ('Riverside City College', 'Riverside', 'Riverside', 'Riverside', 'CA'),
    ('Orange Coast', 'Orange Coast', 'Orange_Coast', 'Costa Mesa', 'CA'),
    ('Saddleback College', 'Saddleback', 'Saddleback', 'Mission Viejo', 'CA'),
    ('Fullerton College', 'Fullerton', 'Fullerton', 'Fullerton', 'CA'),
    ('Golden West College', 'Golden West', 'Golden_West', 'Huntington Beach', 'CA'),
    ('Santa Ana College', 'Santa Ana', 'Santa_Ana', 'Santa Ana', 'CA'),
    ('Mt. San Antonio College', 'Mt. SAC', 'Mt_SAC', 'Walnut', 'CA'),
    ('Cerritos', 'Cerritos', 'Cerritos', 'Norwalk', 'CA'),
    ('Long Beach City College', 'Long Beach', 'Long_Beach', 'Long Beach', 'CA'),
    ('El Camino College', 'El Camino', 'El_Camino', 'Torrance', 'CA'),
    ('East Los Angeles College', 'East LA', 'East_LA', 'Monterey Park', 'CA'),
    ('Pasadena City College', 'Pasadena', 'Pasadena', 'Pasadena', 'CA')
),
genders (gender) AS (
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

-- Enrich pre-existing community-college teams only where their TFRRS URL is absent. Existing
-- source URLs are never overwritten by this recovery migration.
WITH desired (canonical_name, source_label, source_slug) AS (
  VALUES
    ('Riverside City College', 'Riverside', 'Riverside'),
    ('Orange Coast', 'Orange Coast', 'Orange_Coast'),
    ('Saddleback College', 'Saddleback', 'Saddleback'),
    ('Fullerton College', 'Fullerton', 'Fullerton'),
    ('Golden West College', 'Golden West', 'Golden_West'),
    ('Santa Ana College', 'Santa Ana', 'Santa_Ana'),
    ('Mt. San Antonio College', 'Mt. SAC', 'Mt_SAC'),
    ('Cerritos', 'Cerritos', 'Cerritos'),
    ('Long Beach City College', 'Long Beach', 'Long_Beach'),
    ('El Camino College', 'El Camino', 'El_Camino'),
    ('East Los Angeles College', 'East LA', 'East_LA'),
    ('Pasadena City College', 'Pasadena', 'Pasadena')
)
UPDATE public.teams t
SET tfrrs_team_url = 'https://www.tfrrs.org/teams/tf/CA_jcollege_' || lower(t.gender) || '_' || d.source_slug || '.html',
    updated_at = now()
FROM desired d
JOIN public.schools s ON lower(s.official_name) = lower(d.canonical_name)
WHERE t.school_id = s.school_id
  AND t.tfrrs_team_url IS NULL;

-- Store source-key aliases for both genders. The importer also indexes source_team_name, so a
-- source row that carries only the displayed label (for example, "Mt. SAC") remains resolvable.
WITH desired (canonical_name, source_label, source_slug) AS (
  VALUES
    ('Riverside City College', 'Riverside', 'Riverside'),
    ('Orange Coast', 'Orange Coast', 'Orange_Coast'),
    ('Saddleback College', 'Saddleback', 'Saddleback'),
    ('Fullerton College', 'Fullerton', 'Fullerton'),
    ('Golden West College', 'Golden West', 'Golden_West'),
    ('Santa Ana College', 'Santa Ana', 'Santa_Ana'),
    ('Mt. San Antonio College', 'Mt. SAC', 'Mt_SAC'),
    ('Cerritos', 'Cerritos', 'Cerritos'),
    ('Long Beach City College', 'Long Beach', 'Long_Beach'),
    ('El Camino College', 'El Camino', 'El_Camino'),
    ('East Los Angeles College', 'East LA', 'East_LA'),
    ('Pasadena City College', 'Pasadena', 'Pasadena')
),
genders (gender) AS (
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
  d.source_slug,
  d.source_label,
  g.gender,
  lower(regexp_replace(d.source_slug, '[^a-zA-Z0-9]+', ' ', 'g')),
  lower(regexp_replace(d.source_label, '[^a-zA-Z0-9]+', ' ', 'g')),
  t.team_id,
  'verified_alias',
  'Verified from the 2026 California junior-college TFRRS results pages and source team URL.'
FROM desired d
JOIN public.schools s ON lower(s.official_name) = lower(d.canonical_name)
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
