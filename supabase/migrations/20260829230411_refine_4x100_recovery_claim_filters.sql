-- Allow a worker to claim only jobs it can actually process. This is important for targeted
-- retries: a TFRRS-only worker must not consume an Athletic.net-only job and mark it blocked.

CREATE OR REPLACE FUNCTION ingest.claim_4x100_recovery_job(
  p_scope_key text,
  p_lease_minutes integer,
  p_retry_failed boolean,
  p_source text,
  p_meet_id integer
)
RETURNS SETOF ingest.event_recovery_queue
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ingest, public, pg_temp
AS $$
DECLARE
  selected_job ingest.event_recovery_queue;
  new_token uuid := gen_random_uuid();
BEGIN
  IF nullif(trim(p_scope_key), '') IS NULL THEN
    RAISE EXCEPTION 'scope_key is required' USING ERRCODE = '22023';
  END IF;
  IF p_lease_minutes IS NULL OR p_lease_minutes < 1 OR p_lease_minutes > 1440 THEN
    RAISE EXCEPTION 'lease_minutes must be between 1 and 1440' USING ERRCODE = '22023';
  END IF;
  IF p_source IS NOT NULL AND p_source NOT IN ('tfrrs', 'athletic_net') THEN
    RAISE EXCEPTION 'unsupported 4x100 source filter: %', p_source USING ERRCODE = '22023';
  END IF;

  UPDATE ingest.event_recovery_queue
     SET status = 'queued',
         lease_token = NULL,
         leased_until = NULL,
         last_error = COALESCE(last_error, 'recovered_expired_lease'),
         updated_at = now()
   WHERE scope_key = p_scope_key
     AND status = 'in_progress'
     AND leased_until IS NOT NULL
     AND leased_until < now();

  SELECT q.*
    INTO selected_job
    FROM ingest.event_recovery_queue q
   WHERE q.scope_key = p_scope_key
     AND (p_meet_id IS NULL OR q.meet_id = p_meet_id)
     AND (p_source IS NULL
       OR (p_source = 'tfrrs' AND nullif(q.source_candidates->>'tfrrs_url', '') IS NOT NULL)
       OR (p_source = 'athletic_net' AND nullif(q.source_candidates->>'athletic_net_results_url', '') IS NOT NULL))
     AND q.next_attempt_at <= now()
     AND (
       q.status = 'queued'
       OR (p_retry_failed AND q.status IN ('not_found', 'exhausted'))
     )
   ORDER BY q.priority, q.attempts, q.meet_id, q.job_id
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE ingest.event_recovery_queue
     SET status = 'in_progress',
         attempts = attempts + 1,
         lease_token = new_token,
         leased_until = now() + make_interval(mins => p_lease_minutes),
         updated_at = now()
   WHERE job_id = selected_job.job_id;

  RETURN QUERY
  SELECT q.*
    FROM ingest.event_recovery_queue q
   WHERE q.job_id = selected_job.job_id;
END;
$$;

REVOKE ALL ON FUNCTION ingest.claim_4x100_recovery_job(text, integer, boolean, text, integer) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION ingest.claim_4x100_recovery_job(text, integer, boolean, text, integer) TO service_role;
  END IF;
END
$$;
