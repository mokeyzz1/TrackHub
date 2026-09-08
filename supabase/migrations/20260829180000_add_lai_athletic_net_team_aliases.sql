-- Resolve the exact Athletic.net team labels observed in the 2026 LAI 4x100 source rows.
--
-- This is deliberately alias-only: it reuses existing canonical schools/teams and does not
-- create or modify any public result. The labels were corroborated by the existing TFRRS /
-- TrackScoreboard identities for the same Puerto Rico institutions and by the source payload
-- from meet 12061 (2da Clasificatoria, 2026-03-21).

WITH desired (source_team_key, source_team_name, canonical_school, source_gender) AS (
  VALUES
    ('UPR Bayamon', 'UPR Bayamon', 'P.R.-Bayamon', 'M'),
    ('UPR Cayey', 'UPR Cayey', 'P.R.-Cayey', 'M'),
    ('Pontificia Univ. Catolica', 'Pontificia Univ. Catolica',
      'Pontificia Universidad Catolica de Puerto Rico', 'M'),
    ('Pontificia Univ. Catolica', 'Pontificia Univ. Catolica',
      'Pontificia Universidad Catolica de Puerto Rico', 'F'),
    ('Sagrado Corazon', 'Sagrado Corazon', 'Sagrado Corazon', 'F')
)
INSERT INTO ingest.team_aliases (
  source, source_team_key, source_team_name, source_gender,
  normalized_source_team_key, normalized_source_team_name,
  team_id, match_method, status, notes, verified_at
)
SELECT
  'athletic_net',
  d.source_team_key,
  d.source_team_name,
  d.source_gender,
  lower(regexp_replace(d.source_team_key, '[^a-zA-Z0-9]+', ' ', 'g')),
  lower(regexp_replace(d.source_team_name, '[^a-zA-Z0-9]+', ' ', 'g')),
  t.team_id,
  'verified_alias',
  'active',
  'Exact Athletic.net LAI team label corroborated by the canonical Puerto Rico school and existing source identity mappings.',
  now()
FROM desired d
JOIN public.schools s ON lower(s.official_name) = lower(d.canonical_school)
JOIN public.teams t ON t.school_id = s.school_id AND t.gender = d.source_gender
ON CONFLICT (source, normalized_source_team_key, source_gender) DO UPDATE
SET source_team_name = EXCLUDED.source_team_name,
    normalized_source_team_name = EXCLUDED.normalized_source_team_name,
    team_id = EXCLUDED.team_id,
    match_method = EXCLUDED.match_method,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes,
    verified_at = EXCLUDED.verified_at,
    updated_at = now();
