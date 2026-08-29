-- AthleticLIVE publishes the junior-college team as "CCBC Catonsville" while the canonical
-- catalog uses "Catonsville". The school and both gender-specific TFRRS team pages verify the
-- identity; keep the alumni label separate rather than mapping it to the current team.
WITH genders(gender) AS (
  VALUES ('M'), ('F')
)
INSERT INTO ingest.team_aliases (
  source, source_team_key, source_team_name, source_gender,
  normalized_source_team_key, normalized_source_team_name,
  team_id, match_method, notes
)
SELECT
  'athletic_net',
  'CCBC Catonsville',
  'CCBC Catonsville',
  g.gender,
  'ccbc catonsville',
  'ccbc catonsville',
  t.team_id,
  'verified_alias',
  'Verified against https://www.ccbcmd.edu/About/Contact/Locations/pages/CCBC-Catonsville.html and the official TFRRS Catonsville team pages.'
FROM genders g
JOIN public.schools s ON lower(s.official_name) = 'catonsville'
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
