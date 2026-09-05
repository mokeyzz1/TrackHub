-- Verified AthleticLIVE source-team alias discovered during Grand Valley State Tune-Up recovery.
-- The source publishes the relay squad as `Kirtland (Mich.) CC - A`; the canonical team is the
-- men's Kirtland CC row. Keep this deterministic and gender-specific.

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
  'athletic_net',
  'Kirtland (Mich.) CC - A',
  'Kirtland (Mich.) CC - A',
  t.gender,
  'kirtland mich cc a',
  'kirtland mich cc a',
  t.team_id,
  'verified_alias',
  'Verified from the AthleticLIVE Grand Valley State Tune-Up relay row and canonical Kirtland CC team.'
FROM public.teams t
JOIN public.schools s ON s.school_id = t.school_id
WHERE s.official_name = 'Kirtland CC'
  AND t.gender = 'M'
ON CONFLICT (source, normalized_source_team_key, source_gender) DO UPDATE
SET source_team_name = EXCLUDED.source_team_name,
    normalized_source_team_name = EXCLUDED.normalized_source_team_name,
    team_id = EXCLUDED.team_id,
    status = 'active',
    match_method = EXCLUDED.match_method,
    notes = EXCLUDED.notes,
    verified_at = now(),
    updated_at = now();
