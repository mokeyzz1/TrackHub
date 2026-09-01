-- Event-specific, resumable recovery inventory for missing 4x100 results.
-- This queue is deliberately separate from ingest.recovery_queue, whose relay coverage means
-- "any relay" and therefore cannot distinguish a meet that has 4x400 from one that has 4x100.
-- Queue state never authorizes a public fact write; source observations still pass through the
-- control plane and canonical_fact_writer.js.

CREATE TABLE IF NOT EXISTS ingest.event_recovery_queue (
  job_id                         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope_key                      text NOT NULL,
  meet_id                        integer NOT NULL REFERENCES public.meets(meet_id) ON DELETE RESTRICT,
  event_type_id                  integer NOT NULL REFERENCES public.event_types(event_type_id) ON DELETE RESTRICT,
  event_code                     text NOT NULL CHECK (event_code = '4x100m'),
  status                         text NOT NULL DEFAULT 'queued'
                                 CHECK (status IN ('queued', 'in_progress', 'needs_review', 'complete', 'blocked', 'not_found', 'exhausted')),
  priority                       integer NOT NULL DEFAULT 100 CHECK (priority >= 0),
  individual_fact_count          bigint NOT NULL DEFAULT 0 CHECK (individual_fact_count >= 0),
  parent_fact_count              bigint NOT NULL DEFAULT 0 CHECK (parent_fact_count >= 0),
  numeric_parent_fact_count      bigint NOT NULL DEFAULT 0 CHECK (numeric_parent_fact_count >= 0),
  leg_fact_count                 bigint NOT NULL DEFAULT 0 CHECK (leg_fact_count >= 0),
  source_candidates              jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts                       integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at                timestamptz NOT NULL DEFAULT now(),
  lease_token                    uuid,
  leased_until                   timestamptz,
  last_run_id                    uuid REFERENCES ingest.runs(run_id) ON DELETE SET NULL,
  last_source                    text CHECK (last_source IS NULL OR last_source IN ('tfrrs', 'athletic_net')),
  last_source_status             text,
  last_error                     text,
  last_parent_count              integer NOT NULL DEFAULT 0 CHECK (last_parent_count >= 0),
  last_numeric_parent_count      integer NOT NULL DEFAULT 0 CHECK (last_numeric_parent_count >= 0),
  last_leg_count                 integer NOT NULL DEFAULT 0 CHECK (last_leg_count >= 0),
  created_at                     timestamptz NOT NULL DEFAULT now(),
  updated_at                     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_key, meet_id, event_type_id)
);

COMMENT ON TABLE ingest.event_recovery_queue IS
  'Private, resumable event-level recovery jobs. It never directly writes public facts.';

COMMENT ON COLUMN ingest.event_recovery_queue.source_candidates IS
  'Verified source URLs for this meet. The 4x100 worker intentionally excludes generic timing sites.';

CREATE INDEX IF NOT EXISTS ingest_event_recovery_queue_claim_idx
  ON ingest.event_recovery_queue (scope_key, status, next_attempt_at, priority, meet_id);

CREATE INDEX IF NOT EXISTS ingest_event_recovery_queue_lease_idx
  ON ingest.event_recovery_queue (scope_key, status, leased_until)
  WHERE status = 'in_progress';

ALTER TABLE ingest.event_recovery_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ingest.event_recovery_queue FROM PUBLIC;
REVOKE ALL ON SEQUENCE ingest.event_recovery_queue_job_id_seq FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ingest.event_recovery_queue TO service_role;
    GRANT USAGE, SELECT ON SEQUENCE ingest.event_recovery_queue_job_id_seq TO service_role;
  END IF;
END
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
DECLARE
  changed_rows integer;
BEGIN
  IF nullif(trim(p_scope_key), '') IS NULL THEN
    RAISE EXCEPTION 'scope_key is required' USING ERRCODE = '22023';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'valid recovery date range is required' USING ERRCODE = '22023';
  END IF;

  WITH target_event AS (
    SELECT event_type_id
      FROM public.event_types
     WHERE code = '4x100m'
     ORDER BY event_type_id
     LIMIT 1
  ),
  individual_counts AS (
    SELECT r.meet_id, count(*)::bigint AS individual_fact_count
      FROM public.results r
     WHERE r.meet_id IS NOT NULL
     GROUP BY r.meet_id
  ),
  relay_counts AS (
    SELECT rr.meet_id,
           count(*)::bigint AS parent_fact_count,
           count(*) FILTER (WHERE rr.mark_seconds IS NOT NULL)::bigint AS numeric_parent_fact_count
      FROM public.relay_results rr
      JOIN target_event e ON e.event_type_id = rr.event_type_id
     GROUP BY rr.meet_id
  ),
  leg_counts AS (
    SELECT r.meet_id, count(*)::bigint AS leg_fact_count
      FROM public.results r
      JOIN target_event e ON e.event_type_id = r.event_type_id
     GROUP BY r.meet_id
  ),
  shaped AS (
    SELECT m.meet_id,
           e.event_type_id,
           COALESCE(i.individual_fact_count, 0)::bigint AS individual_fact_count,
           COALESCE(rc.parent_fact_count, 0)::bigint AS parent_fact_count,
           COALESCE(rc.numeric_parent_fact_count, 0)::bigint AS numeric_parent_fact_count,
           COALESCE(l.leg_fact_count, 0)::bigint AS leg_fact_count,
           CASE
             WHEN m.tfrrs_url ~* '(tfrrs\.org|tfrrs)' THEN m.tfrrs_url
             WHEN m.meet_url ~* '(tfrrs\.org|tfrrs)' THEN m.meet_url
           END AS tfrrs_url,
           CASE
             WHEN m.athletic_net_results_url ~* '(athletic\.net|athletic\.live|anet\.live|mastiming\.net)' THEN m.athletic_net_results_url
             WHEN m.meet_url ~* '(athletic\.net|athletic\.live|anet\.live|mastiming\.net)' THEN m.meet_url
           END AS athletic_net_results_url
      FROM public.meets m
      CROSS JOIN target_event e
      LEFT JOIN individual_counts i ON i.meet_id = m.meet_id
      LEFT JOIN relay_counts rc ON rc.meet_id = m.meet_id
      LEFT JOIN leg_counts l ON l.meet_id = m.meet_id
     WHERE m.date IS NOT NULL
       AND m.date < current_date
       AND m.date <= p_end_date
       AND COALESCE(m.end_date, m.date) >= p_start_date
       AND COALESCE(i.individual_fact_count, 0) > 0
       AND COALESCE(rc.numeric_parent_fact_count, 0) = 0
  )
  INSERT INTO ingest.event_recovery_queue AS q
    (scope_key, meet_id, event_type_id, event_code, status, priority,
     individual_fact_count, parent_fact_count, numeric_parent_fact_count, leg_fact_count,
     source_candidates, updated_at)
  SELECT p_scope_key,
         s.meet_id,
         s.event_type_id,
         '4x100m',
         CASE
           WHEN s.tfrrs_url IS NOT NULL OR s.athletic_net_results_url IS NOT NULL THEN 'queued'
           ELSE 'blocked'
         END,
         CASE WHEN s.parent_fact_count > 0 THEN 10 ELSE 20 END,
         s.individual_fact_count,
         s.parent_fact_count,
         s.numeric_parent_fact_count,
         s.leg_fact_count,
         jsonb_strip_nulls(jsonb_build_object(
           'tfrrs_url', s.tfrrs_url,
           'athletic_net_results_url', s.athletic_net_results_url
         )),
         now()
    FROM shaped s
  ON CONFLICT (scope_key, meet_id, event_type_id) DO UPDATE
    SET individual_fact_count = EXCLUDED.individual_fact_count,
        parent_fact_count = EXCLUDED.parent_fact_count,
        numeric_parent_fact_count = EXCLUDED.numeric_parent_fact_count,
        leg_fact_count = EXCLUDED.leg_fact_count,
        source_candidates = EXCLUDED.source_candidates || q.source_candidates,
        priority = EXCLUDED.priority,
        status = CASE
          WHEN EXCLUDED.numeric_parent_fact_count > 0 THEN 'complete'
          WHEN q.status = 'in_progress' AND q.leased_until > now() THEN 'in_progress'
          WHEN q.status = 'needs_review' THEN 'needs_review'
          WHEN q.status = 'exhausted' THEN 'exhausted'
          WHEN q.status = 'not_found' THEN 'not_found'
          WHEN NULLIF(EXCLUDED.source_candidates->>'tfrrs_url', '') IS NOT NULL
            OR NULLIF(EXCLUDED.source_candidates->>'athletic_net_results_url', '') IS NOT NULL
            OR NULLIF(q.source_candidates->>'tfrrs_url', '') IS NOT NULL
            OR NULLIF(q.source_candidates->>'athletic_net_results_url', '') IS NOT NULL THEN 'queued'
          ELSE 'blocked'
          ELSE 'queued'
        END,
        updated_at = now();

  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  RETURN changed_rows;
END;
$$;

CREATE OR REPLACE FUNCTION ingest.claim_4x100_recovery_job(
  p_scope_key text,
  p_lease_minutes integer DEFAULT 60,
  p_retry_failed boolean DEFAULT false
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
  IF p_source NOT IN ('tfrrs', 'athletic_net') THEN
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
  IF p_source IS NOT NULL AND p_source NOT IN ('tfrrs', 'athletic_net') THEN
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

REVOKE ALL ON FUNCTION ingest.refresh_4x100_recovery_queue(text, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION ingest.claim_4x100_recovery_job(text, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION ingest.record_4x100_recovery_run(bigint, uuid, uuid, text, text, integer, integer, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ingest.finish_4x100_recovery_job(bigint, uuid, text, uuid, text, text, integer, integer, integer, text, integer) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION ingest.refresh_4x100_recovery_queue(text, date, date) TO service_role;
    GRANT EXECUTE ON FUNCTION ingest.claim_4x100_recovery_job(text, integer, boolean) TO service_role;
    GRANT EXECUTE ON FUNCTION ingest.record_4x100_recovery_run(bigint, uuid, uuid, text, text, integer, integer, integer, text) TO service_role;
    GRANT EXECUTE ON FUNCTION ingest.finish_4x100_recovery_job(bigint, uuid, text, uuid, text, text, integer, integer, integer, text, integer) TO service_role;
  END IF;
END
$$;
