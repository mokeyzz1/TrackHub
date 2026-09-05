-- A completed recovery item no longer has an actionable error. Clear stale retry messages on
-- both refreshes and future successful writes so queue state remains self-consistent.
CREATE OR REPLACE FUNCTION ingest.clear_recovery_queue_error_on_complete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ingest, pg_temp
AS $$
BEGIN
  IF NEW.status = 'complete' THEN
    NEW.last_error := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ingest_recovery_queue_clear_error_on_complete ON ingest.recovery_queue;
CREATE TRIGGER ingest_recovery_queue_clear_error_on_complete
  BEFORE INSERT OR UPDATE ON ingest.recovery_queue
  FOR EACH ROW
  EXECUTE FUNCTION ingest.clear_recovery_queue_error_on_complete();
