-- Verified source-team aliases for the private ingestion control plane.
--
-- A source label is not a canonical team identity. This table records only reviewed mappings;
-- importers may use active rows as deterministic fallbacks, but they must continue to quarantine
-- unknown or ambiguous relay teams.

CREATE TABLE IF NOT EXISTS ingest.team_aliases (
  team_alias_id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source                        text NOT NULL
                                CHECK (source IN ('tfrrs', 'athletic_net', 'ustfccca', 'manual')),
  source_team_key               text NOT NULL,
  source_team_name              text,
  source_gender                 text NOT NULL
                                CHECK (source_gender IN ('M', 'F')),
  normalized_source_team_key    text NOT NULL,
  normalized_source_team_name   text,
  team_id                       bigint NOT NULL REFERENCES public.teams(team_id) ON DELETE RESTRICT,
  match_method                  text NOT NULL DEFAULT 'verified_alias'
                                CHECK (match_method IN ('exact_source_key', 'verified_alias', 'manual')),
  status                        text NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'revoked')),
  notes                         text,
  verified_at                   timestamptz NOT NULL DEFAULT now(),
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, normalized_source_team_key, source_gender)
);

COMMENT ON TABLE ingest.team_aliases IS
  'Reviewed source-team aliases used to resolve scraper labels to canonical public.teams identities.';

COMMENT ON COLUMN ingest.team_aliases.source_team_key IS
  'Stable source identity when available, such as a TFRRS team slug.';

COMMENT ON COLUMN ingest.team_aliases.source_gender IS
  'Gender of the source squad; required because public.teams has separate M/F rows.';

CREATE INDEX IF NOT EXISTS ingest_team_aliases_name_idx
  ON ingest.team_aliases (source, normalized_source_team_name, source_gender)
  WHERE status = 'active' AND normalized_source_team_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS ingest_team_aliases_team_idx
  ON ingest.team_aliases (team_id)
  WHERE status = 'active';

ALTER TABLE ingest.team_aliases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE ingest.team_aliases FROM PUBLIC;
REVOKE ALL ON SEQUENCE ingest.team_aliases_team_alias_id_seq FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ingest.team_aliases TO service_role';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE ingest.team_aliases_team_alias_id_seq TO service_role';
  END IF;
END
$$;

-- First reviewed mapping: TFRRS publishes Concordia (Tex.), while the canonical school is stored
-- as Concordia Tx. Resolve the target through the school/team relationship rather than embedding a
-- generated team_id in the migration.
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
  'Concordia_TX',
  'Concordia (Tex.)',
  t.gender,
  'concordia tx',
  'concordia tex',
  t.team_id,
  'verified_alias',
  'Verified from TFRRS source key and Texas school/state match.'
FROM public.teams t
JOIN public.schools s ON s.school_id = t.school_id
WHERE s.official_name = 'Concordia Tx'
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
