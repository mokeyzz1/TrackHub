-- Additive evidence storage. Never backfill old observations from a mutable latest payload.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE ingest.source_record_versions (
  source_record_id bigint NOT NULL REFERENCES ingest.source_records(source_record_id),
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL,
  source_url text,
  source_meet_key text,
  source_event_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_record_id, snapshot_hash)
);
COMMENT ON TABLE ingest.source_record_versions IS
  'Append-only raw evidence versions consumed by ingestion. Hash covers canonical JSON payload and source locator metadata, not normalized decisions.';
ALTER TABLE ingest.source_record_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ingest.source_record_versions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON ingest.source_record_versions TO service_role;

ALTER TABLE ingest.observations ADD COLUMN source_snapshot_hash text;
COMMENT ON COLUMN ingest.observations.source_snapshot_hash IS
  'Exact source evidence version consumed. NULL means historical snapshot unavailable; never infer it from the latest source_records payload.';
ALTER TABLE ingest.observations ADD CONSTRAINT observations_source_snapshot_fkey
  FOREIGN KEY (source_record_id, source_snapshot_hash)
  REFERENCES ingest.source_record_versions(source_record_id, snapshot_hash) NOT VALID;
ALTER TABLE ingest.observations VALIDATE CONSTRAINT observations_source_snapshot_fkey;
CREATE INDEX observations_source_snapshot_idx
  ON ingest.observations(source_record_id, source_snapshot_hash)
  WHERE source_snapshot_hash IS NOT NULL;
