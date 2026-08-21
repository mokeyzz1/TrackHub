-- A relay-only probe must not erase an unrelated unresolved observation. Preserve partial queue
-- state while still recording whether the source published relay observations.

CREATE OR REPLACE FUNCTION ingest.reconcile_recovery_queue_relay_probe(p_run_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ingest, public, pg_temp
AS $$
DECLARE
  run_row record;
  source_observations bigint;
  relay_observations bigint;
  meet_ids integer[];
  changed_rows integer;
BEGIN
  SELECT source, mode, status, scope
    INTO run_row
    FROM ingest.runs
   WHERE run_id = p_run_id;

  IF NOT FOUND
     OR run_row.mode <> 'dry_run'
     OR run_row.status <> 'succeeded'
     OR COALESCE((run_row.scope->>'relays_only')::boolean, false) IS NOT TRUE THEN
    RETURN 0;
  END IF;

  source_observations := NULLIF(run_row.scope->>'source_observation_count', '')::bigint;
  relay_observations := NULLIF(run_row.scope->>'source_relay_observation_count', '')::bigint;
  IF source_observations IS NULL OR relay_observations IS NULL OR source_observations <= 0 THEN
    RETURN 0;
  END IF;

  IF run_row.scope ? 'meet_id' THEN
    meet_ids := ARRAY[(run_row.scope->>'meet_id')::integer];
  ELSE
    SELECT COALESCE(array_agg(value::integer), ARRAY[]::integer[])
      INTO meet_ids
      FROM jsonb_array_elements_text(COALESCE(run_row.scope->'meet_ids', '[]'::jsonb));
  END IF;

  UPDATE ingest.recovery_queue q
     SET relay_coverage_status = CASE WHEN relay_observations > 0 THEN 'present' ELSE 'absent' END,
         needs_relays = CASE
           WHEN relay_observations > 0 THEN q.relay_fact_count = 0
           ELSE false
         END,
         relay_checked_at = now(),
         relay_probe_run_id = p_run_id,
         last_run_id = p_run_id,
         last_error = CASE
           WHEN q.quarantined_observation_count > 0
             THEN 'source_observations_quarantined=' || q.quarantined_observation_count::text
           WHEN relay_observations = 0 THEN NULL
           ELSE q.last_error
         END,
         status = CASE
           WHEN q.quarantined_observation_count > 0 THEN 'partial'
           WHEN relay_observations = 0 AND NOT q.needs_individual THEN 'complete'
           ELSE q.status
         END,
         updated_at = now()
   WHERE q.meet_id = ANY(meet_ids)
     AND q.status IN ('queued', 'in_progress', 'partial', 'exhausted');

  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  RETURN changed_rows;
END;
$$;

REVOKE ALL ON FUNCTION ingest.reconcile_recovery_queue_relay_probe(uuid) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION ingest.reconcile_recovery_queue_relay_probe(uuid) TO service_role;
  END IF;
END
$$;
