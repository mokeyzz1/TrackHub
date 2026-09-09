-- TFRRS result tables may emit "Glendale (CA)" while the official team catalog uses
-- the Glendale team slug. Resolve that exact source label to the existing CCCAA team.
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
  'Glendale (CA)',
  'Glendale (CA)',
  t.gender,
  'glendale ca',
  'glendale ca',
  t.team_id,
  'verified_alias',
  'Exact TFRRS result-table label mapped to Glendale Community College CCCAA team.'
FROM public.teams t
JOIN public.schools s ON s.school_id = t.school_id
WHERE s.official_name = 'Glendale Community College'
  AND t.gender IN ('M', 'F')
ON CONFLICT (source, normalized_source_team_key, source_gender) DO UPDATE
SET source_team_name = EXCLUDED.source_team_name,
    normalized_source_team_name = EXCLUDED.normalized_source_team_name,
    team_id = EXCLUDED.team_id,
    status = 'active',
    match_method = EXCLUDED.match_method,
    notes = EXCLUDED.notes,
    verified_at = now(),
    updated_at = now();
