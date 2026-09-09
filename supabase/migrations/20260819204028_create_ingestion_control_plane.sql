-- Enterprise ingestion control plane.
--
-- This is intentionally additive and private. It does not change or rewrite the existing fact
-- tables. Scrapers write source observations here first; a single orchestrator later decides
-- whether an observation is inserted, claims an existing history row, is skipped as a duplicate,
-- or is quarantined for review.
--
-- The column types below were verified against the live project on 2026-08-19:
--   results.result_id / athletes.athlete_id / teams.team_id -> bigint
--   meets.meet_id / results.meet_id / relay_results IDs -> integer

CREATE SCHEMA IF NOT EXISTS ingest;

REVOKE ALL ON SCHEMA ingest FROM PUBLIC;

CREATE TABLE IF NOT EXISTS ingest.runs (
  run_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source          text NOT NULL CHECK (source IN ('tfrrs', 'athletic_net', 'mixed', 'ustfccca', 'manual')),
  mode            text NOT NULL CHECK (mode IN ('dry_run', 'commit')),
  status          text NOT NULL DEFAULT 'created'
                  CHECK (status IN ('created', 'running', 'succeeded', 'partial', 'failed', 'aborted')),
  scope           jsonb NOT NULL DEFAULT '{}'::jsonb,
  parser_version  text NOT NULL,
  code_revision   text,
  started_at      timestamptz,
  finished_at     timestamptz,
  metrics         jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ingest.runs IS
  'One auditable execution of an importer or recovery job. A run is never silently successful.';

CREATE TABLE IF NOT EXISTS ingest.source_records (
  source_record_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source            text NOT NULL CHECK (source IN ('tfrrs', 'athletic_net', 'ustfccca', 'manual')),
  source_record_key text NOT NULL,
  source_meet_key   text,
  source_event_key  text,
  source_url        text,
  payload_hash      text,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_record_key)
);

COMMENT ON TABLE ingest.source_records IS
  'Stable source identity and the latest compact source payload. Raw pages belong in durable object storage, not this table.';

CREATE TABLE IF NOT EXISTS ingest.observations (
  observation_id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id                  uuid NOT NULL REFERENCES ingest.runs(run_id) ON DELETE RESTRICT,
  source_record_id        bigint NOT NULL REFERENCES ingest.source_records(source_record_id) ON DELETE RESTRICT,
  source                  text NOT NULL CHECK (source IN ('tfrrs', 'athletic_net', 'ustfccca', 'manual')),
  entity_type             text NOT NULL CHECK (entity_type IN ('individual_result', 'relay_result', 'relay_leg')),
  target_meet_id          integer REFERENCES public.meets(meet_id) ON DELETE RESTRICT,
  target_athlete_id       bigint REFERENCES public.athletes(athlete_id) ON DELETE RESTRICT,
  target_team_id          bigint REFERENCES public.teams(team_id) ON DELETE RESTRICT,
  event_type_id           integer REFERENCES public.event_types(event_type_id) ON DELETE RESTRICT,
  raw_event_name          text,
  measure                 text CHECK (measure IN ('time', 'distance', 'points', 'unknown')),
  mark_raw                text,
  mark_seconds            double precision,
  mark_meters             double precision,
  points                  double precision,
  place                   integer,
  round                   text,
  result_date             date,
  performance_key         text,
  canonical_key           text,
  decision                text NOT NULL DEFAULT 'pending'
                          CHECK (decision IN ('pending', 'insert', 'claim', 'skip_duplicate', 'quarantine', 'error')),
  decision_reason         text,
  confidence              numeric(5, 4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  canonical_result_id     bigint REFERENCES public.results(result_id) ON DELETE RESTRICT,
  canonical_relay_id      integer REFERENCES public.relay_results(relay_result_id) ON DELETE RESTRICT,
  validation_errors        jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, source_record_id),
  CHECK (num_nonnulls(canonical_result_id, canonical_relay_id) <= 1)
);

COMMENT ON TABLE ingest.observations IS
  'One normalized source observation per run. This is the reviewable boundary before facts are written.';

CREATE TABLE IF NOT EXISTS ingest.source_links (
  source_record_id   bigint PRIMARY KEY REFERENCES ingest.source_records(source_record_id) ON DELETE RESTRICT,
  entity_type        text NOT NULL CHECK (entity_type IN ('individual_result', 'relay_result', 'relay_leg')),
  result_id          bigint REFERENCES public.results(result_id) ON DELETE RESTRICT,
  relay_result_id    integer REFERENCES public.relay_results(relay_result_id) ON DELETE RESTRICT,
  link_status        text NOT NULL DEFAULT 'unlinked'
                     CHECK (link_status IN ('linked', 'unlinked', 'quarantined')),
  first_linked_at    timestamptz,
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(result_id, relay_result_id) <= 1)
);

COMMENT ON TABLE ingest.source_links IS
  'Provenance bridge: one stable source record can point to at most one canonical fact row.';

CREATE TABLE IF NOT EXISTS ingest.quarantine (
  quarantine_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  observation_id      bigint NOT NULL UNIQUE REFERENCES ingest.observations(observation_id) ON DELETE RESTRICT,
  reason_code         text NOT NULL,
  status              text NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'resolved', 'rejected')),
  resolution_note     text,
  resolved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ingest.quarantine IS
  'Ambiguous or invalid source observations that must not be guessed into production facts.';

CREATE INDEX IF NOT EXISTS ingest_runs_status_idx
  ON ingest.runs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS ingest_observations_run_decision_idx
  ON ingest.observations (run_id, decision);

CREATE INDEX IF NOT EXISTS ingest_observations_meet_idx
  ON ingest.observations (target_meet_id, entity_type, decision);

CREATE INDEX IF NOT EXISTS ingest_observations_canonical_key_idx
  ON ingest.observations (canonical_key)
  WHERE canonical_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ingest_source_records_meet_idx
  ON ingest.source_records (source, source_meet_key);

CREATE INDEX IF NOT EXISTS ingest_source_links_result_idx
  ON ingest.source_links (result_id)
  WHERE result_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ingest_source_links_relay_idx
  ON ingest.source_links (relay_result_id)
  WHERE relay_result_id IS NOT NULL;

-- This schema is not intended for anonymous or client access. RLS remains enabled as defense in
-- depth; the worker connects with a privileged server-side role. The conditional grant keeps the
-- migration portable to a plain PostgreSQL instance where Supabase's service_role does not exist.
ALTER TABLE ingest.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest.source_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest.observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest.source_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest.quarantine ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA ingest FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA ingest FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA ingest TO service_role';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ingest TO service_role';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ingest TO service_role';
  END IF;
END
$$;
