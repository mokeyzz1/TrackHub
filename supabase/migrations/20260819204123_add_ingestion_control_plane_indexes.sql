-- Cover the private control-plane foreign keys as well as its batch/review access paths.
-- These tables are empty at creation time, so ordinary CREATE INDEX statements are safe here.

CREATE INDEX IF NOT EXISTS ingest_observations_source_record_idx
  ON ingest.observations (source_record_id);

CREATE INDEX IF NOT EXISTS ingest_observations_target_athlete_idx
  ON ingest.observations (target_athlete_id)
  WHERE target_athlete_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ingest_observations_target_team_idx
  ON ingest.observations (target_team_id)
  WHERE target_team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ingest_observations_event_type_idx
  ON ingest.observations (event_type_id)
  WHERE event_type_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ingest_observations_canonical_result_idx
  ON ingest.observations (canonical_result_id)
  WHERE canonical_result_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ingest_observations_canonical_relay_idx
  ON ingest.observations (canonical_relay_id)
  WHERE canonical_relay_id IS NOT NULL;
