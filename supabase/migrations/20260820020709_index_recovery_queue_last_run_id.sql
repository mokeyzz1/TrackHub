-- Cover the recovery_queue -> ingest.runs foreign key and run-audit lookups.
CREATE INDEX IF NOT EXISTS ingest_recovery_queue_last_run_idx
  ON ingest.recovery_queue (last_run_id);
