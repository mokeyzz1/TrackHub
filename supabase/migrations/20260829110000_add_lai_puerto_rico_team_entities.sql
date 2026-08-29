-- Add the Puerto Rico LAI institutions present in TrackScoreboard relay meets.
--
-- This is additive and identity-safe:
--   * existing schools and teams are reused;
--   * no public athlete or result row is changed;
--   * source labels resolve through verified team aliases;
--   * division is deliberately `Other` because the evidence establishes LAI
--     participation, not NCAA/NAIA membership for these institutions.
--
-- The institutions and their LAI participation were verified against the LAI
-- report for the 2026 Campeonato de Relevos and the TrackScoreboard source
-- payload. TrackScoreboard team IDs are not canonical school IDs, so aliases
-- are keyed by the stable source abbreviation and gender.

WITH desired (canonical_name, source_label) AS (
  VALUES
    ('Universidad Ana G. Mendez', 'Universidad Ana G Mendez'),
    ('Universidad Interamericana de Puerto Rico', 'Universidad Interamericana'),
    ('Caribbean University', 'Caribbean University'),
    ('Universidad Politecnica de Puerto Rico', 'Universidad Politecnica'),
    ('P.R.-Humacao', 'UPR Humacao'),
    ('Pontificia Universidad Catolica de Puerto Rico', 'Pontificia Univ. Catolica'),
    ('P.R.-Arecibo', 'UPR Arecibo'),
    ('P.R.-Ponce', 'UPR Ponce'),
    ('Sagrado Corazon', 'Sagrado Corazon')
)
INSERT INTO public.schools (
  official_name, short_name, state, division, division_id, is_active
)
SELECT d.canonical_name,
       d.source_label,
       'PR',
       'Other',
       NULL,
       true
FROM desired d
WHERE NOT EXISTS (
  SELECT 1
  FROM public.schools s
  WHERE lower(s.official_name) = lower(d.canonical_name)
     OR lower(coalesce(s.short_name, '')) = lower(d.canonical_name)
);

WITH desired (canonical_name) AS (
  VALUES
    ('Universidad Ana G. Mendez'),
    ('Universidad Interamericana de Puerto Rico'),
    ('Caribbean University'),
    ('Universidad Politecnica de Puerto Rico'),
    ('P.R.-Humacao'),
    ('Pontificia Universidad Catolica de Puerto Rico'),
    ('P.R.-Arecibo'),
    ('P.R.-Ponce'),
    ('Sagrado Corazon')
), genders (gender) AS (
  VALUES ('M'), ('F')
)
INSERT INTO public.teams (school_id, gender, is_active)
SELECT s.school_id, g.gender, true
FROM desired d
JOIN public.schools s ON lower(s.official_name) = lower(d.canonical_name)
CROSS JOIN genders g
WHERE NOT EXISTS (
  SELECT 1
  FROM public.teams t
  WHERE t.school_id = s.school_id
    AND t.gender = g.gender
);

WITH desired (canonical_name, source_team_key, source_team_name) AS (
  VALUES
    ('Universidad Ana G. Mendez', 'UAGM', 'UNIVERSIDAD ANA G MENDEZ'),
    ('Universidad Interamericana de Puerto Rico', 'UIPR', 'UNIVERSIDAD INTERAMERICANA'),
    ('Caribbean University', 'CU', 'CARIBBEAN UNIVERSITY'),
    ('Universidad Politecnica de Puerto Rico', 'PUPR', 'UNIVERSIDAD POLITECNICA'),
    ('P.R.-Humacao', 'UPRH', 'UPR HUMACAO'),
    ('Pontificia Universidad Catolica de Puerto Rico', 'PUCP', 'PONTIFICIA UNIV. CATOLICA'),
    ('P.R.-Arecibo', 'UPRA', 'UPR ARECIBO'),
    ('P.R.-Ponce', 'UPRP', 'UPR PONCE'),
    ('Sagrado Corazon', 'USC', 'SAGRADO CORAZON')
), genders (gender) AS (
  VALUES ('M'), ('F')
)
INSERT INTO ingest.team_aliases (
  source, source_team_key, source_team_name, source_gender,
  normalized_source_team_key, normalized_source_team_name,
  team_id, match_method, notes
)
SELECT
  'trackscoreboard',
  d.source_team_key,
  d.source_team_name,
  g.gender,
  lower(regexp_replace(d.source_team_key, '[^a-zA-Z0-9]+', ' ', 'g')),
  lower(regexp_replace(d.source_team_name, '[^a-zA-Z0-9]+', ' ', 'g')),
  t.team_id,
  'verified_alias',
  'TrackScoreboard LAI institution verified against the official LAI 2026 relay report; canonical division intentionally remains Other.'
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
