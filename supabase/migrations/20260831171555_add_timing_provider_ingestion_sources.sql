-- Register the verified timing-provider adapters with the private ingestion contract.
-- MileSplit, PT Timing, and Leone Timing have their own read-only adapters. Blue Ridge Timing
-- uses the existing AthleticLIVE format and is therefore stored as athletic_net provenance.

DO $$
BEGIN
  ALTER TABLE ingest.runs DROP CONSTRAINT IF EXISTS runs_source_check;
  ALTER TABLE ingest.source_records DROP CONSTRAINT IF EXISTS source_records_source_check;
  ALTER TABLE ingest.observations DROP CONSTRAINT IF EXISTS observations_source_check;
  ALTER TABLE ingest.team_aliases DROP CONSTRAINT IF EXISTS team_aliases_source_check;
  ALTER TABLE ingest.athlete_aliases DROP CONSTRAINT IF EXISTS athlete_aliases_source_check;
  ALTER TABLE ingest.event_recovery_queue DROP CONSTRAINT IF EXISTS event_recovery_queue_last_source_check;
END
$$;

ALTER TABLE ingest.runs ADD CONSTRAINT runs_source_check
  CHECK (source IN (
    'tfrrs', 'athletic_net', 'mixed', 'ustfccca', 'trackscoreboard',
    'milesplit', 'pt_timing', 'leonetiming', 'manual'
  ));

ALTER TABLE ingest.source_records ADD CONSTRAINT source_records_source_check
  CHECK (source IN (
    'tfrrs', 'athletic_net', 'ustfccca', 'trackscoreboard',
    'milesplit', 'pt_timing', 'leonetiming', 'manual'
  ));

ALTER TABLE ingest.observations ADD CONSTRAINT observations_source_check
  CHECK (source IN (
    'tfrrs', 'athletic_net', 'ustfccca', 'trackscoreboard',
    'milesplit', 'pt_timing', 'leonetiming', 'manual'
  ));

ALTER TABLE ingest.team_aliases ADD CONSTRAINT team_aliases_source_check
  CHECK (source IN (
    'tfrrs', 'athletic_net', 'ustfccca', 'trackscoreboard',
    'milesplit', 'pt_timing', 'leonetiming', 'manual'
  ));

ALTER TABLE ingest.athlete_aliases ADD CONSTRAINT athlete_aliases_source_check
  CHECK (source IN (
    'tfrrs', 'athletic_net', 'ustfccca', 'trackscoreboard',
    'milesplit', 'pt_timing', 'leonetiming', 'manual'
  ));

ALTER TABLE ingest.event_recovery_queue ADD CONSTRAINT event_recovery_queue_last_source_check
  CHECK (last_source IS NULL OR last_source IN (
    'tfrrs', 'athletic_net', 'milesplit', 'pt_timing', 'leonetiming'
  ));

COMMENT ON COLUMN ingest.event_recovery_queue.source_candidates IS
  'Verified source evidence and adapter routing for this meet. TrackScoreboard remains policy-excluded from the 4x100 worker.';

-- The previous wrapper already delegates counting/scoping to its base function. This migration
-- extends only the meet_url routing layer, preserving existing queue status, lease, and retry
-- behavior while making the three new adapters claimable.
CREATE OR REPLACE FUNCTION ingest.refresh_4x100_recovery_queue(
  p_scope_key text,
  p_start_date date,
  p_end_date date,
  p_season text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ingest, public, pg_temp
AS $$
DECLARE
  changed_rows integer;
  routed_rows integer;
  repaired_rows integer;
BEGIN
  changed_rows := ingest.refresh_4x100_recovery_queue_base(
    p_scope_key, p_start_date, p_end_date, p_season
  );

  WITH supported_urls AS (
    SELECT q.job_id,
           m.meet_url,
           CASE
             WHEN lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) = 'tfrrs.org'
               OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) LIKE '%.tfrrs.org'
               THEN 'tfrrs'
             WHEN lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) = 'milesplit.live'
               OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) LIKE '%.milesplit.live'
               OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) = 'milesplit.com'
               OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) LIKE '%.milesplit.com'
               THEN 'milesplit'
             WHEN lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) = 'pttiming.com'
               OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) LIKE '%.pttiming.com'
               THEN 'pt_timing'
             WHEN lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) = 'leonetiming.com'
               OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) LIKE '%.leonetiming.com'
               THEN 'leonetiming'
             ELSE 'athletic_net'
           END AS provider
      FROM ingest.event_recovery_queue q
      JOIN public.meets m ON m.meet_id = q.meet_id
     WHERE q.scope_key = p_scope_key
       AND q.status <> 'complete'
       AND (NULLIF(trim(p_season), '') IS NULL OR btrim(m.season) = btrim(p_season))
       AND m.meet_url IS NOT NULL
       AND (
         lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) = 'tfrrs.org'
         OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) LIKE '%.tfrrs.org'
         OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) = 'athletic.net'
         OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) LIKE '%.athletic.net'
         OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) = 'anet.live'
         OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) LIKE '%.anet.live'
         OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) IN (
           'live.jdlfasttrack.com', 'live.mastiming.net', 'live.herostiming.com',
           'live.mountaintiming.com', 'results.blacksquirreltiming.com',
           'blueridgetiming.live'
         )
         OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) LIKE '%.blacksquirreltiming.com'
         OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) = 'milesplit.live'
         OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) LIKE '%.milesplit.live'
         OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) = 'milesplit.com'
         OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) LIKE '%.milesplit.com'
         OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) = 'pttiming.com'
         OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) LIKE '%.pttiming.com'
         OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) = 'leonetiming.com'
         OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) LIKE '%.leonetiming.com'
       )
  )
  UPDATE ingest.event_recovery_queue q
     SET source_candidates = q.source_candidates || jsonb_strip_nulls(jsonb_build_object(
       'meet_url', u.meet_url,
       'meet_url_provider', u.provider,
       'meet_url_capability', 'supported',
       'meet_url_route', jsonb_build_object(
         'status', 'routed',
         'routed_at', now(),
         'previous_attempts', q.attempts
       ),
       'tfrrs_url', CASE WHEN u.provider = 'tfrrs' THEN u.meet_url END,
       'athletic_net_results_url', CASE WHEN u.provider = 'athletic_net' THEN u.meet_url END,
       'milesplit_url', CASE WHEN u.provider = 'milesplit' THEN u.meet_url END,
       'pt_timing_url', CASE WHEN u.provider = 'pt_timing' THEN u.meet_url END,
       'leonetiming_url', CASE WHEN u.provider = 'leonetiming' THEN u.meet_url END
     )),
         status = CASE WHEN q.status = 'blocked' THEN 'queued' ELSE q.status END,
         attempts = CASE WHEN q.status = 'blocked' THEN 0 ELSE q.attempts END,
         last_error = CASE WHEN q.status = 'blocked' THEN NULL ELSE q.last_error END,
         next_attempt_at = CASE WHEN q.status = 'blocked' THEN now() ELSE q.next_attempt_at END,
         updated_at = now()
    FROM supported_urls u
   WHERE q.job_id = u.job_id;

  GET DIAGNOSTICS routed_rows = ROW_COUNT;

  UPDATE ingest.event_recovery_queue q
     SET source_candidates = q.source_candidates || jsonb_build_object(
       'meet_url_route', jsonb_build_object(
         'status', 'routed',
         'routed_at', now(),
         'previous_attempts', q.attempts
       )
     ),
         status = 'queued',
         attempts = 0,
         last_error = NULL,
         next_attempt_at = now(),
         updated_at = now()
   WHERE q.status = 'exhausted'
     AND q.last_source IS NULL
     AND q.last_error LIKE 'maximum attempts exceeded%'
     AND q.source_candidates->>'meet_url_capability' = 'supported'
     AND NULLIF(q.source_candidates->>'meet_url', '') IS NOT NULL;

  GET DIAGNOSTICS repaired_rows = ROW_COUNT;
  RETURN changed_rows + routed_rows + repaired_rows;
END;
$$;

CREATE OR REPLACE FUNCTION ingest.refresh_4x100_recovery_queue(
  p_scope_key text,
  p_start_date date,
  p_end_date date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ingest, public, pg_temp
AS $$
BEGIN
  RETURN ingest.refresh_4x100_recovery_queue(p_scope_key, p_start_date, p_end_date, NULL);
END;
$$;

REVOKE ALL ON FUNCTION ingest.refresh_4x100_recovery_queue(text, date, date, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION ingest.refresh_4x100_recovery_queue(text, date, date, text) TO service_role;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION ingest.claim_4x100_recovery_job(
  p_scope_key text,
  p_lease_minutes integer,
  p_retry_failed boolean,
  p_source text,
  p_meet_id integer,
  p_max_attempts integer
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
  IF p_source IS NOT NULL AND p_source NOT IN ('tfrrs', 'athletic_net', 'milesplit', 'pt_timing', 'leonetiming') THEN
    RAISE EXCEPTION 'unsupported 4x100 source filter: %', p_source USING ERRCODE = '22023';
  END IF;
  IF p_max_attempts IS NULL OR p_max_attempts < 1 OR p_max_attempts > 100 THEN
    RAISE EXCEPTION 'max_attempts must be between 1 and 100' USING ERRCODE = '22023';
  END IF;

  UPDATE ingest.event_recovery_queue
     SET status = CASE WHEN attempts >= p_max_attempts THEN 'exhausted' ELSE 'queued' END,
         lease_token = NULL,
         leased_until = NULL,
         last_error = COALESCE(
           last_error,
           CASE WHEN attempts >= p_max_attempts
             THEN 'maximum attempts reached after expired lease'
             ELSE 'recovered_expired_lease'
           END
         ),
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
       OR (p_source = 'athletic_net' AND nullif(q.source_candidates->>'athletic_net_results_url', '') IS NOT NULL)
       OR (p_source IN ('milesplit', 'pt_timing', 'leonetiming')
           AND q.source_candidates->>'meet_url_provider' = p_source))
     AND q.next_attempt_at <= now()
     AND (
       (q.status = 'queued' AND q.attempts < p_max_attempts)
       OR (
         p_retry_failed
         AND q.status IN ('not_found', 'exhausted')
         AND q.attempts < p_max_attempts
       )
     )
   ORDER BY q.priority, q.attempts, q.meet_id, q.job_id
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  UPDATE ingest.event_recovery_queue
     SET status = 'in_progress',
         attempts = attempts + 1,
         lease_token = new_token,
         leased_until = now() + make_interval(mins => p_lease_minutes),
         updated_at = now()
   WHERE job_id = selected_job.job_id;

  RETURN QUERY SELECT q.* FROM ingest.event_recovery_queue q WHERE q.job_id = selected_job.job_id;
END;
$$;

CREATE OR REPLACE FUNCTION ingest.record_4x100_recovery_run(
  p_job_id bigint,
  p_lease_token uuid,
  p_run_id uuid,
  p_source text,
  p_source_status text,
  p_parent_count integer,
  p_numeric_parent_count integer,
  p_leg_count integer,
  p_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ingest, public, pg_temp
AS $$
BEGIN
  IF p_source NOT IN ('tfrrs', 'athletic_net', 'milesplit', 'pt_timing', 'leonetiming') THEN
    RAISE EXCEPTION 'unsupported 4x100 source: %', p_source USING ERRCODE = '22023';
  END IF;

  UPDATE ingest.event_recovery_queue
     SET last_run_id = p_run_id,
         last_source = p_source,
         last_source_status = p_source_status,
         last_parent_count = GREATEST(COALESCE(p_parent_count, 0), 0),
         last_numeric_parent_count = GREATEST(COALESCE(p_numeric_parent_count, 0), 0),
         last_leg_count = GREATEST(COALESCE(p_leg_count, 0), 0),
         last_error = p_error,
         updated_at = now()
   WHERE job_id = p_job_id
     AND status = 'in_progress'
     AND lease_token = p_lease_token;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION ingest.finish_4x100_recovery_job(
  p_job_id bigint,
  p_lease_token uuid,
  p_status text,
  p_run_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_source_status text DEFAULT NULL,
  p_parent_count integer DEFAULT 0,
  p_numeric_parent_count integer DEFAULT 0,
  p_leg_count integer DEFAULT 0,
  p_error text DEFAULT NULL,
  p_retry_after_minutes integer DEFAULT 0
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ingest, public, pg_temp
AS $$
BEGIN
  IF p_status NOT IN ('complete', 'needs_review', 'blocked', 'not_found', 'exhausted') THEN
    RAISE EXCEPTION 'invalid terminal 4x100 job status: %', p_status USING ERRCODE = '22023';
  END IF;
  IF p_source IS NOT NULL AND p_source NOT IN ('tfrrs', 'athletic_net', 'milesplit', 'pt_timing', 'leonetiming') THEN
    RAISE EXCEPTION 'unsupported 4x100 source: %', p_source USING ERRCODE = '22023';
  END IF;
  IF p_retry_after_minutes < 0 THEN
    RAISE EXCEPTION 'retry_after_minutes must be non-negative' USING ERRCODE = '22023';
  END IF;

  UPDATE ingest.event_recovery_queue
     SET status = p_status,
         lease_token = NULL,
         leased_until = NULL,
         last_run_id = COALESCE(p_run_id, last_run_id),
         last_source = COALESCE(p_source, last_source),
         last_source_status = COALESCE(p_source_status, last_source_status),
         last_parent_count = GREATEST(COALESCE(p_parent_count, 0), 0),
         last_numeric_parent_count = GREATEST(COALESCE(p_numeric_parent_count, 0), 0),
         last_leg_count = GREATEST(COALESCE(p_leg_count, 0), 0),
         last_error = p_error,
         next_attempt_at = now() + make_interval(mins => p_retry_after_minutes),
         updated_at = now()
   WHERE job_id = p_job_id
     AND status = 'in_progress'
     AND lease_token = p_lease_token;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION ingest.claim_4x100_recovery_job(text, integer, boolean, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION ingest.record_4x100_recovery_run(bigint, uuid, uuid, text, text, integer, integer, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ingest.finish_4x100_recovery_job(bigint, uuid, text, uuid, text, text, integer, integer, integer, text, integer) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION ingest.claim_4x100_recovery_job(text, integer, boolean, text, integer, integer) TO service_role;
    GRANT EXECUTE ON FUNCTION ingest.record_4x100_recovery_run(bigint, uuid, uuid, text, text, integer, integer, integer, text) TO service_role;
    GRANT EXECUTE ON FUNCTION ingest.finish_4x100_recovery_job(bigint, uuid, text, uuid, text, text, integer, integer, integer, text, integer) TO service_role;
  END IF;
END
$$;
