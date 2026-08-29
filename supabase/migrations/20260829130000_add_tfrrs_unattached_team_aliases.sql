-- TFRRS publishes explicitly unattached relay teams as "unatt". Resolve that source label to
-- the existing canonical Unattached team, but keep gender-specific mappings so a source page
-- cannot cross-link a men's relay to the women's team (or vice versa).
WITH labels(source_team_key, source_team_name) AS (
  VALUES
    ('unatt', 'unatt'),
    ('unattached', 'Unattached'),
    ('unattached team', 'Unattached Team')
), genders(gender) AS (
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
  l.source_team_key,
  l.source_team_name,
  g.gender,
  lower(regexp_replace(l.source_team_key, '[^a-zA-Z0-9]+', ' ', 'g')),
  lower(regexp_replace(l.source_team_name, '[^a-zA-Z0-9]+', ' ', 'g')),
  t.team_id,
  'verified_alias',
  'Explicit TFRRS unattached label mapped to the canonical gender-specific Unattached team.'
FROM labels l
CROSS JOIN genders g
JOIN public.schools s ON lower(s.official_name) = 'unattached'
JOIN public.teams t ON t.school_id = s.school_id AND t.gender = g.gender
ON CONFLICT (source, normalized_source_team_key, source_gender) DO UPDATE
SET source_team_name = EXCLUDED.source_team_name,
    normalized_source_team_name = EXCLUDED.normalized_source_team_name,
    team_id = EXCLUDED.team_id,
    status = 'active',
    match_method = EXCLUDED.match_method,
    notes = EXCLUDED.notes,
    verified_at = now(),
    updated_at = now();
