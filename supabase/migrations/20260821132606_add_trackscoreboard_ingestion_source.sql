-- TrackScoreboard is a public timing source with a different payload shape from TFRRS and
-- Athletic.net. Keep it inside the same private control plane so its facts get the same
-- duplicate and quarantine protections.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ingest.runs'::regclass AND conname = 'runs_source_check') THEN
    ALTER TABLE ingest.runs DROP CONSTRAINT runs_source_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ingest.source_records'::regclass AND conname = 'source_records_source_check') THEN
    ALTER TABLE ingest.source_records DROP CONSTRAINT source_records_source_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ingest.observations'::regclass AND conname = 'observations_source_check') THEN
    ALTER TABLE ingest.observations DROP CONSTRAINT observations_source_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ingest.team_aliases'::regclass AND conname = 'team_aliases_source_check') THEN
    ALTER TABLE ingest.team_aliases DROP CONSTRAINT team_aliases_source_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ingest.athlete_aliases'::regclass AND conname = 'athlete_aliases_source_check') THEN
    ALTER TABLE ingest.athlete_aliases DROP CONSTRAINT athlete_aliases_source_check;
  END IF;
END
$$;

ALTER TABLE ingest.runs ADD CONSTRAINT runs_source_check
  CHECK (source IN ('tfrrs', 'athletic_net', 'mixed', 'ustfccca', 'trackscoreboard', 'manual'));
ALTER TABLE ingest.source_records ADD CONSTRAINT source_records_source_check
  CHECK (source IN ('tfrrs', 'athletic_net', 'ustfccca', 'trackscoreboard', 'manual'));
ALTER TABLE ingest.observations ADD CONSTRAINT observations_source_check
  CHECK (source IN ('tfrrs', 'athletic_net', 'ustfccca', 'trackscoreboard', 'manual'));
ALTER TABLE ingest.team_aliases ADD CONSTRAINT team_aliases_source_check
  CHECK (source IN ('tfrrs', 'athletic_net', 'ustfccca', 'trackscoreboard', 'manual'));
ALTER TABLE ingest.athlete_aliases ADD CONSTRAINT athlete_aliases_source_check
  CHECK (source IN ('tfrrs', 'athletic_net', 'ustfccca', 'trackscoreboard', 'manual'));

-- Exact source-name -> canonical-team mappings for the UPR schools already present in the
-- database. Resolve generated team IDs through the school relation, never by hardcoded ID.
WITH mappings(source_team_name, canonical_school) AS (
  VALUES
    ('UPR RIO PIEDRAS', 'P.R.-Rio Piedras'),
    ('UPR MAYAGUEZ', 'P.R.-Mayaguez'),
    ('UPR CAYEY', 'P.R.-Cayey'),
    ('UPR CAROLINA', 'P.R.-Carolina'),
    ('UPR BAYAMON', 'P.R.-Bayamon')
)
INSERT INTO ingest.team_aliases (
  source, source_team_key, source_team_name, source_gender,
  normalized_source_team_key, normalized_source_team_name,
  team_id, match_method, notes
)
SELECT
  'trackscoreboard', m.source_team_name, m.source_team_name, t.gender,
  lower(regexp_replace(m.source_team_name, '[^a-zA-Z0-9]+', ' ', 'g')),
  lower(regexp_replace(m.source_team_name, '[^a-zA-Z0-9]+', ' ', 'g')),
  t.team_id, 'verified_alias',
  'Exact TrackScoreboard institution name matched to the existing Puerto Rico canonical school.'
FROM mappings m
JOIN public.schools s ON s.official_name = m.canonical_school
JOIN public.teams t ON t.school_id = s.school_id AND t.gender IN ('M', 'F')
ON CONFLICT (source, normalized_source_team_key, source_gender) DO UPDATE
SET source_team_name = EXCLUDED.source_team_name,
    normalized_source_team_name = EXCLUDED.normalized_source_team_name,
    team_id = EXCLUDED.team_id,
    status = 'active',
    match_method = EXCLUDED.match_method,
    notes = EXCLUDED.notes,
    verified_at = now(),
    updated_at = now();
