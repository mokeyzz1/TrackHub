--
-- PostgreSQL database dump
--

\restrict TIHJDIEzhaHiz17Kk6SgZd9hHRuzpS0GHvhDhDhKDoaoBVhplBs4PupcGJrB6r1

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: event_recovery_queue; Type: TABLE; Schema: ingest; Owner: postgres
--

CREATE TABLE ingest.event_recovery_queue (
    job_id bigint NOT NULL,
    scope_key text NOT NULL,
    meet_id integer NOT NULL,
    event_type_id integer NOT NULL,
    event_code text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    individual_fact_count bigint DEFAULT 0 NOT NULL,
    parent_fact_count bigint DEFAULT 0 NOT NULL,
    numeric_parent_fact_count bigint DEFAULT 0 NOT NULL,
    leg_fact_count bigint DEFAULT 0 NOT NULL,
    source_candidates jsonb DEFAULT '{}'::jsonb NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    lease_token uuid,
    leased_until timestamp with time zone,
    last_run_id uuid,
    last_source text,
    last_source_status text,
    last_error text,
    last_parent_count integer DEFAULT 0 NOT NULL,
    last_numeric_parent_count integer DEFAULT 0 NOT NULL,
    last_leg_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_recovery_queue_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT event_recovery_queue_event_code_check CHECK ((event_code = '4x100m'::text)),
    CONSTRAINT event_recovery_queue_individual_fact_count_check CHECK ((individual_fact_count >= 0)),
    CONSTRAINT event_recovery_queue_last_leg_count_check CHECK ((last_leg_count >= 0)),
    CONSTRAINT event_recovery_queue_last_numeric_parent_count_check CHECK ((last_numeric_parent_count >= 0)),
    CONSTRAINT event_recovery_queue_last_parent_count_check CHECK ((last_parent_count >= 0)),
    CONSTRAINT event_recovery_queue_last_source_check CHECK (((last_source IS NULL) OR (last_source = ANY (ARRAY['tfrrs'::text, 'athletic_net'::text, 'milesplit'::text, 'pt_timing'::text, 'leonetiming'::text])))),
    CONSTRAINT event_recovery_queue_leg_fact_count_check CHECK ((leg_fact_count >= 0)),
    CONSTRAINT event_recovery_queue_numeric_parent_fact_count_check CHECK ((numeric_parent_fact_count >= 0)),
    CONSTRAINT event_recovery_queue_parent_fact_count_check CHECK ((parent_fact_count >= 0)),
    CONSTRAINT event_recovery_queue_priority_check CHECK ((priority >= 0)),
    CONSTRAINT event_recovery_queue_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'in_progress'::text, 'needs_review'::text, 'complete'::text, 'blocked'::text, 'not_found'::text, 'exhausted'::text])))
);


ALTER TABLE ingest.event_recovery_queue OWNER TO postgres;

--
-- Name: TABLE event_recovery_queue; Type: COMMENT; Schema: ingest; Owner: postgres
--

COMMENT ON TABLE ingest.event_recovery_queue IS 'Private, resumable event-level recovery jobs. It never directly writes public facts.';


--
-- Name: COLUMN event_recovery_queue.source_candidates; Type: COMMENT; Schema: ingest; Owner: postgres
--

COMMENT ON COLUMN ingest.event_recovery_queue.source_candidates IS 'Verified source URLs and adapter evidence. Reconciliation workflows may store their source-vs-local report under the reconciliation key.';


--
-- Name: claim_4x100_recovery_job(text, integer, boolean); Type: FUNCTION; Schema: ingest; Owner: postgres
--

CREATE FUNCTION ingest.claim_4x100_recovery_job(p_scope_key text, p_lease_minutes integer DEFAULT 60, p_retry_failed boolean DEFAULT false) RETURNS SETOF ingest.event_recovery_queue
    LANGUAGE plpgsql
    SET search_path TO 'ingest', 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN QUERY
  SELECT *
    FROM ingest.claim_4x100_recovery_job(
      p_scope_key, p_lease_minutes, p_retry_failed, NULL::text, NULL::integer, 2
    );
END;
$$;


ALTER FUNCTION ingest.claim_4x100_recovery_job(p_scope_key text, p_lease_minutes integer, p_retry_failed boolean) OWNER TO postgres;

--
-- Name: claim_4x100_recovery_job(text, integer, boolean, text, integer); Type: FUNCTION; Schema: ingest; Owner: postgres
--

CREATE FUNCTION ingest.claim_4x100_recovery_job(p_scope_key text, p_lease_minutes integer, p_retry_failed boolean, p_source text, p_meet_id integer) RETURNS SETOF ingest.event_recovery_queue
    LANGUAGE plpgsql
    SET search_path TO 'ingest', 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN QUERY
  SELECT *
    FROM ingest.claim_4x100_recovery_job(
      p_scope_key, p_lease_minutes, p_retry_failed, p_source, p_meet_id, 2
    );
END;
$$;


ALTER FUNCTION ingest.claim_4x100_recovery_job(p_scope_key text, p_lease_minutes integer, p_retry_failed boolean, p_source text, p_meet_id integer) OWNER TO postgres;

--
-- Name: claim_4x100_recovery_job(text, integer, boolean, text, integer, integer); Type: FUNCTION; Schema: ingest; Owner: postgres
--

CREATE FUNCTION ingest.claim_4x100_recovery_job(p_scope_key text, p_lease_minutes integer, p_retry_failed boolean, p_source text, p_meet_id integer, p_max_attempts integer) RETURNS SETOF ingest.event_recovery_queue
    LANGUAGE plpgsql
    SET search_path TO 'ingest', 'public', 'pg_temp'
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


ALTER FUNCTION ingest.claim_4x100_recovery_job(p_scope_key text, p_lease_minutes integer, p_retry_failed boolean, p_source text, p_meet_id integer, p_max_attempts integer) OWNER TO postgres;

--
-- Name: clear_recovery_queue_error_on_complete(); Type: FUNCTION; Schema: ingest; Owner: postgres
--

CREATE FUNCTION ingest.clear_recovery_queue_error_on_complete() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'ingest', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status = 'complete' THEN
    NEW.last_error := NULL;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION ingest.clear_recovery_queue_error_on_complete() OWNER TO postgres;

--
-- Name: finish_4x100_recovery_job(bigint, uuid, text, uuid, text, text, integer, integer, integer, text, integer); Type: FUNCTION; Schema: ingest; Owner: postgres
--

CREATE FUNCTION ingest.finish_4x100_recovery_job(p_job_id bigint, p_lease_token uuid, p_status text, p_run_id uuid DEFAULT NULL::uuid, p_source text DEFAULT NULL::text, p_source_status text DEFAULT NULL::text, p_parent_count integer DEFAULT 0, p_numeric_parent_count integer DEFAULT 0, p_leg_count integer DEFAULT 0, p_error text DEFAULT NULL::text, p_retry_after_minutes integer DEFAULT 0) RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO 'ingest', 'public', 'pg_temp'
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


ALTER FUNCTION ingest.finish_4x100_recovery_job(p_job_id bigint, p_lease_token uuid, p_status text, p_run_id uuid, p_source text, p_source_status text, p_parent_count integer, p_numeric_parent_count integer, p_leg_count integer, p_error text, p_retry_after_minutes integer) OWNER TO postgres;

--
-- Name: reconcile_recovery_queue_relay_probe(uuid); Type: FUNCTION; Schema: ingest; Owner: postgres
--

CREATE FUNCTION ingest.reconcile_recovery_queue_relay_probe(p_run_id uuid) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'ingest', 'public', 'pg_temp'
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


ALTER FUNCTION ingest.reconcile_recovery_queue_relay_probe(p_run_id uuid) OWNER TO postgres;

--
-- Name: record_4x100_recovery_run(bigint, uuid, uuid, text, text, integer, integer, integer, text); Type: FUNCTION; Schema: ingest; Owner: postgres
--

CREATE FUNCTION ingest.record_4x100_recovery_run(p_job_id bigint, p_lease_token uuid, p_run_id uuid, p_source text, p_source_status text, p_parent_count integer, p_numeric_parent_count integer, p_leg_count integer, p_error text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO 'ingest', 'public', 'pg_temp'
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


ALTER FUNCTION ingest.record_4x100_recovery_run(p_job_id bigint, p_lease_token uuid, p_run_id uuid, p_source text, p_source_status text, p_parent_count integer, p_numeric_parent_count integer, p_leg_count integer, p_error text) OWNER TO postgres;

--
-- Name: refresh_4x100_recovery_queue(text, date, date); Type: FUNCTION; Schema: ingest; Owner: postgres
--

CREATE FUNCTION ingest.refresh_4x100_recovery_queue(p_scope_key text, p_start_date date, p_end_date date) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'ingest', 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN ingest.refresh_4x100_recovery_queue(p_scope_key, p_start_date, p_end_date, NULL);
END;
$$;


ALTER FUNCTION ingest.refresh_4x100_recovery_queue(p_scope_key text, p_start_date date, p_end_date date) OWNER TO postgres;

--
-- Name: refresh_4x100_recovery_queue(text, date, date, text); Type: FUNCTION; Schema: ingest; Owner: postgres
--

CREATE FUNCTION ingest.refresh_4x100_recovery_queue(p_scope_key text, p_start_date date, p_end_date date, p_season text) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'ingest', 'public', 'pg_temp'
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


ALTER FUNCTION ingest.refresh_4x100_recovery_queue(p_scope_key text, p_start_date date, p_end_date date, p_season text) OWNER TO postgres;

--
-- Name: refresh_4x100_recovery_queue_base(text, date, date, text); Type: FUNCTION; Schema: ingest; Owner: postgres
--

CREATE FUNCTION ingest.refresh_4x100_recovery_queue_base(p_scope_key text, p_start_date date, p_end_date date, p_season text) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'ingest', 'public', 'pg_temp'
    AS $$
DECLARE
  changed_rows integer;
  cleaned_rows integer;
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
             WHEN m.tfrrs_url ~* '(tfrrs\\.org|tfrrs)' THEN m.tfrrs_url
             WHEN m.meet_url ~* '(tfrrs\\.org|tfrrs)' THEN m.meet_url
           END AS tfrrs_url,
           CASE
             WHEN m.athletic_net_results_url ~* '(athletic\\.net|athletic\\.live|anet\\.live|jdlfasttrack|blacksquirreltiming|mastiming\\.net|herostiming\\.com|mountaintiming\\.com)' THEN m.athletic_net_results_url
             WHEN m.meet_url ~* '(athletic\\.net|athletic\\.live|anet\\.live|jdlfasttrack|blacksquirreltiming|mastiming\\.net|herostiming\\.com|mountaintiming\\.com)' THEN m.meet_url
           END AS athletic_net_results_url,
           m.meet_url,
           CASE
             WHEN m.meet_url IS NULL THEN NULL
             WHEN lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) IN (
               'athletic.net', 'live.athletic.net', 'anet.live', 'live.jdlfasttrack.com',
               'live.mastiming.net', 'live.herostiming.com', 'live.mountaintiming.com',
               'results.blacksquirreltiming.com'
             ) THEN 'athletic_net'
             WHEN lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) LIKE '%.athletic.net'
               OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) LIKE '%.anet.live'
               OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) LIKE '%.blacksquirreltiming.com' THEN 'athletic_net'
             WHEN lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) = 'tfrrs.org'
               OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) LIKE '%.tfrrs.org' THEN 'tfrrs'
             ELSE COALESCE(public.detect_timing_platform(m.meet_url), 'other')
           END AS meet_url_provider
      FROM public.meets m
      CROSS JOIN target_event e
      LEFT JOIN individual_counts i ON i.meet_id = m.meet_id
      LEFT JOIN relay_counts rc ON rc.meet_id = m.meet_id
      LEFT JOIN leg_counts l ON l.meet_id = m.meet_id
     WHERE m.date IS NOT NULL
       AND m.date < current_date
       AND m.date <= p_end_date
       AND COALESCE(m.end_date, m.date) >= p_start_date
       AND (NULLIF(trim(p_season), '') IS NULL OR btrim(m.season) = btrim(p_season))
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
           'meet_url', s.meet_url,
           'meet_url_provider', s.meet_url_provider,
           'meet_url_capability', CASE
             WHEN s.meet_url IS NULL THEN 'missing'
             WHEN s.tfrrs_url IS NOT NULL OR s.athletic_net_results_url IS NOT NULL THEN 'supported'
             WHEN s.meet_url_provider = 'trackscoreboard' THEN 'policy_excluded'
             ELSE 'adapter_required'
           END,
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
        -- Current public source evidence wins; private discovery metadata remains because it is
        -- not present in EXCLUDED.source_candidates.
        source_candidates = q.source_candidates || EXCLUDED.source_candidates,
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
        END,
        updated_at = now();

  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF NULLIF(trim(p_season), '') IS NOT NULL THEN
    UPDATE ingest.event_recovery_queue q
       SET status = 'blocked',
           lease_token = NULL,
           leased_until = NULL,
           last_error = 'out_of_scope_season:' || btrim(p_season),
           updated_at = now()
     WHERE q.scope_key = p_scope_key
       AND q.status IN ('queued', 'in_progress', 'needs_review', 'not_found', 'exhausted')
       AND EXISTS (
         SELECT 1
           FROM public.meets m
          WHERE m.meet_id = q.meet_id
            AND btrim(COALESCE(m.season, '')) <> btrim(p_season)
       );
    GET DIAGNOSTICS cleaned_rows = ROW_COUNT;
  ELSE
    cleaned_rows = 0;
  END IF;

  RETURN changed_rows + cleaned_rows;
END;
$$;


ALTER FUNCTION ingest.refresh_4x100_recovery_queue_base(p_scope_key text, p_start_date date, p_end_date date, p_season text) OWNER TO postgres;

--
-- Name: refresh_4x100_recovery_queue_host_routing_base(text, date, date, text); Type: FUNCTION; Schema: ingest; Owner: postgres
--

CREATE FUNCTION ingest.refresh_4x100_recovery_queue_host_routing_base(p_scope_key text, p_start_date date, p_end_date date, p_season text) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'ingest', 'public', 'pg_temp'
    AS $$
DECLARE
  changed_rows integer;
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
           'live.mountaintiming.com', 'results.blacksquirreltiming.com'
         )
         OR lower(split_part(split_part(m.meet_url, '://', 2), '/', 1)) LIKE '%.blacksquirreltiming.com'
       )
  )
  UPDATE ingest.event_recovery_queue q
     SET source_candidates = q.source_candidates || jsonb_strip_nulls(jsonb_build_object(
       'meet_url', u.meet_url,
       'meet_url_provider', u.provider,
       'meet_url_capability', 'supported',
       'tfrrs_url', CASE WHEN u.provider = 'tfrrs' THEN u.meet_url END,
       'athletic_net_results_url', CASE WHEN u.provider = 'athletic_net' THEN u.meet_url END
     )),
         status = CASE WHEN q.status = 'blocked' THEN 'queued' ELSE q.status END,
         last_error = CASE WHEN q.status = 'blocked' THEN NULL ELSE q.last_error END,
         next_attempt_at = CASE WHEN q.status = 'blocked' THEN now() ELSE q.next_attempt_at END,
         updated_at = now()
    FROM supported_urls u
   WHERE q.job_id = u.job_id;

  GET DIAGNOSTICS repaired_rows = ROW_COUNT;

  RETURN changed_rows + repaired_rows;
END;
$$;


ALTER FUNCTION ingest.refresh_4x100_recovery_queue_host_routing_base(p_scope_key text, p_start_date date, p_end_date date, p_season text) OWNER TO postgres;

--
-- Name: refresh_recovery_queue(text, date, date); Type: FUNCTION; Schema: ingest; Owner: postgres
--

CREATE FUNCTION ingest.refresh_recovery_queue(p_scope_key text, p_start_date date, p_end_date date) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'ingest', 'public', 'pg_temp'
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

  WITH open_quarantines AS (
    SELECT o.target_meet_id AS meet_id,
           count(*)::integer AS quarantined_observation_count
      FROM ingest.quarantine q
      JOIN ingest.observations o ON o.observation_id = q.observation_id
     WHERE q.status = 'open'
     GROUP BY o.target_meet_id
  ), target_meets AS (
    SELECT m.meet_id,
           CASE
             WHEN m.tfrrs_url ~* '(tfrrs\.org|tfrrs)' THEN m.tfrrs_url
             WHEN m.tfrrs_url IS NULL AND m.meet_url ~* '(tfrrs\.org|tfrrs)' THEN m.meet_url
           END AS tfrrs_url,
           CASE
             WHEN m.athletic_net_results_url ~* '(athletic\.net|anet\.live)' THEN m.athletic_net_results_url
             WHEN m.athletic_net_results_url IS NULL AND m.meet_url ~* '(athletic\.net|anet\.live)' THEN m.meet_url
           END AS athletic_net_results_url,
           m.wa_results_url,
           m.meet_url,
           COALESCE(i.individual_fact_count, 0)::bigint AS individual_fact_count,
           COALESCE(r.relay_fact_count, 0)::bigint AS relay_fact_count,
           COALESCE(q.relay_coverage_status, 'unknown') AS relay_coverage_status,
           COALESCE(oq.quarantined_observation_count, 0)::integer AS quarantined_observation_count
      FROM public.meets m
      LEFT JOIN ingest.recovery_queue q
        ON q.scope_key = p_scope_key AND q.meet_id = m.meet_id
      LEFT JOIN open_quarantines oq ON oq.meet_id = m.meet_id
      LEFT JOIN (
        SELECT meet_id, count(*)::bigint AS individual_fact_count
          FROM public.results
         WHERE meet_id IS NOT NULL
         GROUP BY meet_id
      ) i ON i.meet_id = m.meet_id
      LEFT JOIN (
        SELECT meet_id, count(*)::bigint AS relay_fact_count
          FROM public.relay_results
         WHERE meet_id IS NOT NULL
         GROUP BY meet_id
      ) r ON r.meet_id = m.meet_id
     WHERE m.date <= p_end_date
       AND COALESCE(m.end_date, m.date) >= p_start_date
  ), shaped AS (
    SELECT t.*,
           CASE
             WHEN t.individual_fact_count = 0 AND t.relay_fact_count = 0 THEN 'empty'
             WHEN t.individual_fact_count = 0 THEN 'relay_only'
             WHEN t.relay_fact_count = 0 THEN 'individual_only'
             ELSE 'covered'
           END AS next_coverage_status,
           (t.individual_fact_count = 0) AS next_needs_individual,
           (t.relay_fact_count = 0 AND t.relay_coverage_status <> 'absent') AS next_needs_relays,
           jsonb_build_object(
             'tfrrs_url', t.tfrrs_url,
             'athletic_net_results_url', t.athletic_net_results_url,
             'wa_results_url', t.wa_results_url,
             'meet_url', t.meet_url
           ) AS next_source_candidates,
           (t.tfrrs_url IS NOT NULL OR t.athletic_net_results_url IS NOT NULL) AS has_supported_source
      FROM target_meets t
  )
  INSERT INTO ingest.recovery_queue AS q
    (scope_key, meet_id, coverage_status, needs_individual, needs_relays,
     individual_fact_count, relay_fact_count, source_candidates, priority, status,
     relay_coverage_status, quarantined_observation_count, updated_at)
  SELECT p_scope_key,
         s.meet_id,
         s.next_coverage_status,
         s.next_needs_individual,
         s.next_needs_relays,
         s.individual_fact_count,
         s.relay_fact_count,
         s.next_source_candidates,
         CASE s.next_coverage_status
           WHEN 'empty' THEN 10
           WHEN 'relay_only' THEN 20
           WHEN 'individual_only' THEN 30
           ELSE 100
         END,
         CASE
           WHEN s.quarantined_observation_count > 0 THEN 'partial'
           WHEN NOT s.next_needs_individual AND NOT s.next_needs_relays THEN 'complete'
           WHEN NOT s.has_supported_source THEN 'blocked'
           ELSE 'queued'
         END,
         s.relay_coverage_status,
         s.quarantined_observation_count,
         now()
    FROM shaped s
  ON CONFLICT (scope_key, meet_id) DO UPDATE
    SET coverage_status = EXCLUDED.coverage_status,
        needs_individual = EXCLUDED.needs_individual,
        needs_relays = EXCLUDED.needs_relays,
        individual_fact_count = EXCLUDED.individual_fact_count,
        relay_fact_count = EXCLUDED.relay_fact_count,
        source_candidates = EXCLUDED.source_candidates,
        priority = EXCLUDED.priority,
        relay_coverage_status = EXCLUDED.relay_coverage_status,
        quarantined_observation_count = EXCLUDED.quarantined_observation_count,
        status = CASE
          WHEN EXCLUDED.quarantined_observation_count > 0 THEN 'partial'
          WHEN NOT EXCLUDED.needs_individual AND NOT EXCLUDED.needs_relays THEN 'complete'
          WHEN EXCLUDED.status = 'blocked'
            THEN CASE WHEN q.status = 'in_progress' THEN q.status ELSE 'blocked' END
          WHEN q.status = 'blocked' AND EXCLUDED.status = 'queued' THEN 'queued'
          ELSE q.status
        END,
        updated_at = now();

  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  RETURN changed_rows;
END;
$$;


ALTER FUNCTION ingest.refresh_recovery_queue(p_scope_key text, p_start_date date, p_end_date date) OWNER TO postgres;

--
-- Name: detect_timing_platform(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.detect_timing_platform(url text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    IF url IS NULL THEN RETURN NULL;
    ELSIF url LIKE '%athletic.net%' OR url LIKE '%jdlfasttrack%' OR url LIKE '%blacksquirrel%' THEN RETURN 'athletic_net';
    ELSIF url LIKE '%milesplit%' THEN RETURN 'milesplit';
    ELSIF url LIKE '%pttiming%' THEN RETURN 'pt_timing';
    ELSIF url LIKE '%finishtiming%' OR url LIKE '%finishlynx%' THEN RETURN 'finish_timing';
    ELSIF url LIKE '%tfrrs%' THEN RETURN 'tfrrs';
    ELSE RETURN 'other';
    END IF;
END;
$$;


ALTER FUNCTION public.detect_timing_platform(url text) OWNER TO postgres;

--
-- Name: get_top_performances(date, date, text, character, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_top_performances(p_start_date date, p_end_date date, p_division text DEFAULT NULL::text, p_gender character DEFAULT NULL::bpchar, p_limit integer DEFAULT 100) RETURNS TABLE(athlete_id integer, full_name text, gender character, event_name text, mark_raw text, mark_seconds numeric, mark_meters numeric, date date, meet_name text, meet_id integer, place smallint, school_name text, division text, wa_points integer)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  -- ===========================================
  -- MEN'S COEFFICIENTS (Official WA 2025)
  -- ===========================================

  -- 60m (indoor only)
  m_60m_a NUMERIC := 68.62032200155772;
  m_60m_b NUMERIC := -1468.376079820242;
  m_60m_c NUMERIC := 7854.923996115336;

  -- 200m indoor/outdoor
  m_200m_indoor_a NUMERIC := 5.0428984333116205;
  m_200m_indoor_b NUMERIC := -363.0051678271411;
  m_200m_indoor_c NUMERIC := 6532.672628951492;
  m_200m_outdoor_a NUMERIC := 5.083329625804254;
  m_200m_outdoor_b NUMERIC := -360.8260380705033;
  m_200m_outdoor_c NUMERIC := 6403.154333221377;

  -- 400m indoor/outdoor
  m_400m_indoor_a NUMERIC := 0.9810285010226494;
  m_400m_indoor_b NUMERIC := -158.13093544779986;
  m_400m_indoor_c NUMERIC := 6372.245446830289;
  m_400m_outdoor_a NUMERIC := 1.0210130425695638;
  m_400m_outdoor_b NUMERIC := -161.3092238081408;
  m_400m_outdoor_c NUMERIC := 6371.289298935095;

  -- 600m indoor/outdoor
  m_600m_indoor_a NUMERIC := 0.3899861152610953;
  m_600m_indoor_b NUMERIC := -102.17335025475768;
  m_600m_indoor_c NUMERIC := 6692.146447579609;
  m_600m_outdoor_a NUMERIC := 0.3856992283143512;
  m_600m_outdoor_b NUMERIC := -99.89240864996827;
  m_600m_outdoor_c NUMERIC := 6467.788691627793;

  -- 800m indoor/outdoor
  m_800m_indoor_a NUMERIC := 0.19739256108073278;
  m_800m_indoor_b NUMERIC := -72.63927638712084;
  m_800m_indoor_c NUMERIC := 6682.6879602972185;
  m_800m_outdoor_a NUMERIC := 0.1980049254166545;
  m_800m_outdoor_b NUMERIC := -72.07136038821409;
  m_800m_outdoor_c NUMERIC := 6558.28160300618;

  -- 1000m indoor/outdoor
  m_1000m_indoor_a NUMERIC := 0.11389778654137217;
  m_1000m_indoor_b NUMERIC := -54.670029751952825;
  m_1000m_indoor_c NUMERIC := 6560.289996561711;
  m_1000m_outdoor_a NUMERIC := 0.11229987246056083;
  m_1000m_outdoor_b NUMERIC := -53.34129687676432;
  m_1000m_outdoor_c NUMERIC := 6334.142779359594;

  -- 1500m indoor/outdoor
  m_1500m_indoor_a NUMERIC := 0.041999988506264074;
  m_1500m_indoor_b NUMERIC := -32.423575703958704;
  m_1500m_indoor_c NUMERIC := 6257.669581143418;
  m_1500m_outdoor_a NUMERIC := 0.04065992529984008;
  m_1500m_outdoor_b NUMERIC := -31.307736299477256;
  m_1500m_outdoor_c NUMERIC := 6026.662254345021;

  -- Mile indoor/outdoor
  m_mile_indoor_a NUMERIC := 0.036900007414912395;
  m_mile_indoor_b NUMERIC := -30.626657725760197;
  m_mile_indoor_c NUMERIC := 6354.958031052956;
  m_mile_outdoor_a NUMERIC := 0.035099677603458446;
  m_mile_outdoor_b NUMERIC := -29.132456259137143;
  m_mile_outdoor_c NUMERIC := 6044.924547011615;

  -- 3000m indoor/outdoor
  m_3000m_indoor_a NUMERIC := 0.00832191917227365;
  m_3000m_indoor_b NUMERIC := -13.980775520668885;
  m_3000m_indoor_c NUMERIC := 5871.90250552597;
  m_3000m_outdoor_a NUMERIC := 0.008150049932713843;
  m_3000m_outdoor_b NUMERIC := -13.691983542337312;
  m_3000m_outdoor_c NUMERIC := 5750.59246378555;

  -- 5000m indoor/outdoor
  m_5000m_indoor_a NUMERIC := 0.002900003148620267;
  m_5000m_indoor_b NUMERIC := -8.351976844926412;
  m_5000m_indoor_c NUMERIC := 6013.40053571912;
  m_5000m_outdoor_a NUMERIC := 0.002777997945427213;
  m_5000m_outdoor_b NUMERIC := -8.000608112196687;
  m_5000m_outdoor_c NUMERIC := 5760.418712362531;

  -- 60m Hurdles (indoor only)
  m_60mh_a NUMERIC := 23.916231718984818;
  m_60mh_b NUMERIC := -698.1937268964539;
  m_60mh_c NUMERIC := 5095.479315056291;

  -- Field events (same indoor/outdoor)
  m_hj_a NUMERIC := 32.14570816360356;
  m_hj_b NUMERIC := 745.3746826150164;
  m_hj_c NUMERIC := -705.259733494051;

  m_pv_a NUMERIC := 3.0457199208785823;
  m_pv_b NUMERIC := 239.612026696057;
  m_pv_c NUMERIC := -280.5412229935755;

  m_lj_a NUMERIC := 1.931092872960562;
  m_lj_b NUMERIC := 186.73134733641928;
  m_lj_c NUMERIC := -479.70640445759636;

  m_tj_a NUMERIC := 0.4603666024030417;
  m_tj_b NUMERIC := 90.96978768056579;
  m_tj_c NUMERIC := -514.9946082626993;

  m_sp_a NUMERIC := 0.04234614355526389;
  m_sp_b NUMERIC := 57.99966265925241;
  m_sp_c NUMERIC := -55.823610246186945;

  -- Weight Throw (not in official WA tables, using derived coefficients)
  m_wt_a NUMERIC := 0.0028444950947790204;
  m_wt_b NUMERIC := 15.081627308136717;
  m_wt_c NUMERIC := -21.68901198504136;

  -- ===========================================
  -- WOMEN'S COEFFICIENTS (Official WA 2025)
  -- ===========================================

  -- 60m (indoor only)
  w_60m_a NUMERIC := 24.91177544269476;
  w_60m_b NUMERIC := -697.4127036580539;
  w_60m_c NUMERIC := 4880.84062414919;

  -- 200m indoor/outdoor
  w_200m_indoor_a NUMERIC := 1.9617476310046413;
  w_200m_indoor_b NUMERIC := -186.35304547847045;
  w_200m_indoor_c NUMERIC := 4425.540362004947;
  w_200m_outdoor_a NUMERIC := 2.2422237149162925;
  w_200m_outdoor_b NUMERIC := -204.01464451534775;
  w_200m_outdoor_c NUMERIC := 4640.727341804304;

  -- 400m indoor/outdoor
  w_400m_indoor_a NUMERIC := 0.32239778088712256;
  w_400m_indoor_b NUMERIC := -72.2140857003651;
  w_400m_indoor_c NUMERIC := 4043.8163995789655;
  w_400m_outdoor_a NUMERIC := 0.3350059758445596;
  w_400m_outdoor_b NUMERIC := -73.6974469594461;
  w_400m_outdoor_c NUMERIC := 4053.1545244171575;

  -- 600m indoor/outdoor
  w_600m_indoor_a NUMERIC := 0.10630096102938147;
  w_600m_indoor_b NUMERIC := -40.4675585171226;
  w_600m_indoor_c NUMERIC := 3851.3911703779886;
  w_600m_outdoor_a NUMERIC := 0.1290024817337887;
  w_600m_outdoor_b NUMERIC := -46.439367295225566;
  w_600m_outdoor_c NUMERIC := 4179.4139537496085;

  -- 800m indoor/outdoor
  w_800m_indoor_a NUMERIC := 0.05719995663858857;
  w_800m_indoor_b NUMERIC := -30.201001015322618;
  w_800m_indoor_c NUMERIC := 3986.4574604244845;
  w_800m_outdoor_a NUMERIC := 0.06879989341997295;
  w_800m_outdoor_b NUMERIC := -34.399261916380055;
  w_800m_outdoor_c NUMERIC := 4299.822125108796;

  -- 1000m indoor/outdoor
  w_1000m_indoor_a NUMERIC := 0.034730273669098644;
  w_1000m_indoor_b NUMERIC := -23.643965410011788;
  w_1000m_indoor_c NUMERIC := 4024.137096635415;
  w_1000m_outdoor_a NUMERIC := 0.038199708533426247;
  w_1000m_outdoor_b NUMERIC := -25.211487793783817;
  w_1000m_outdoor_c NUMERIC := 4159.840558573429;

  -- 1500m indoor/outdoor
  w_1500m_indoor_a NUMERIC := 0.013649954143477805;
  w_1500m_indoor_b NUMERIC := -14.741826462372728;
  w_1500m_indoor_c NUMERIC := 3980.259331609617;
  w_1500m_outdoor_a NUMERIC := 0.01339999627048627;
  w_1500m_outdoor_b NUMERIC := -14.471861176560651;
  w_1500m_outdoor_c NUMERIC := 3907.3655835949467;

  -- Mile indoor/outdoor
  w_mile_indoor_a NUMERIC := 0.011540015186639607;
  w_mile_indoor_b NUMERIC := -13.513232952897397;
  w_mile_indoor_c NUMERIC := 3955.963356088527;
  w_mile_outdoor_a NUMERIC := 0.011649998601839462;
  w_mile_outdoor_b NUMERIC := -13.513881163102496;
  w_mile_outdoor_c NUMERIC := 3918.992004961794;

  -- 3000m indoor/outdoor
  w_3000m_indoor_a NUMERIC := 0.002590000537161685;
  w_3000m_indoor_b NUMERIC := -6.215973858107134;
  w_3000m_indoor_c NUMERIC := 3729.5683351015323;
  w_3000m_outdoor_a NUMERIC := 0.0025389974609562604;
  w_3000m_outdoor_b NUMERIC := -6.09357042856243;
  w_3000m_outdoor_c NUMERIC := 3656.127933666052;

  -- 5000m indoor/outdoor
  w_5000m_indoor_a NUMERIC := 0.00082499992965758;
  w_5000m_indoor_b NUMERIC := -3.464991324219369;
  w_5000m_indoor_c NUMERIC := 3638.23229190876;
  w_5000m_outdoor_a NUMERIC := 0.0008079992470730324;
  w_5000m_outdoor_b NUMERIC := -3.3935897885437782;
  w_5000m_outdoor_c NUMERIC := 3563.2616780022654;

  -- 60m Hurdles (indoor only)
  w_60mh_a NUMERIC := 11.16828188896136;
  w_60mh_b NUMERIC := -406.39148481091615;
  w_60mh_c NUMERIC := 3696.9522386075114;

  -- Field events (same indoor/outdoor)
  w_hj_a NUMERIC := 39.557908744493034;
  w_hj_b NUMERIC := 831.3655724464043;
  w_hj_c NUMERIC := -601.5063267494843;

  w_pv_a NUMERIC := 3.9325797501069246;
  w_pv_b NUMERIC := 275.48968329946365;
  w_pv_c NUMERIC := -205.1216924619548;

  w_lj_a NUMERIC := 1.958114032649064;
  w_lj_b NUMERIC := 193.69548254413166;
  w_lj_c NUMERIC := -233.98988652729167;

  w_tj_a NUMERIC := 0.4296645887350792;
  w_tj_b NUMERIC := 90.3430418780863;
  w_tj_c NUMERIC := -231.6675825305283;

  w_sp_a NUMERIC := 0.046214387641356325;
  w_sp_b NUMERIC := 60.75503111383068;
  w_sp_c NUMERIC := -25.931941888942674;

  -- Weight Throw (not in official WA tables, using derived coefficients)
  w_wt_a NUMERIC := 0.0030967239667614166;
  w_wt_b NUMERIC := 15.730166876520684;
  w_wt_c NUMERIC := -22.699498543297523;

  -- ===========================================
  -- TIME BOUNDS (to filter injury times)
  -- ===========================================
  -- Men's max times
  max_m_60m NUMERIC := 12;
  max_m_200m NUMERIC := 35;
  max_m_400m NUMERIC := 75;
  max_m_600m NUMERIC := 120;
  max_m_800m NUMERIC := 180;
  max_m_1000m NUMERIC := 240;
  max_m_1500m NUMERIC := 330;
  max_m_mile NUMERIC := 360;
  max_m_3000m NUMERIC := 720;
  max_m_5000m NUMERIC := 1200;
  max_m_60mh NUMERIC := 15;

  -- Women's max times (slightly more generous)
  max_w_60m NUMERIC := 13;
  max_w_200m NUMERIC := 40;
  max_w_400m NUMERIC := 85;
  max_w_600m NUMERIC := 140;
  max_w_800m NUMERIC := 200;
  max_w_1000m NUMERIC := 270;
  max_w_1500m NUMERIC := 380;
  max_w_mile NUMERIC := 420;
  max_w_3000m NUMERIC := 840;
  max_w_5000m NUMERIC := 1380;
  max_w_60mh NUMERIC := 18;

  -- Field event minimums
  min_hj NUMERIC := 1.0;
  min_pv NUMERIC := 2.0;
  min_lj NUMERIC := 3.0;
  min_m_tj NUMERIC := 8.0;
  min_w_tj NUMERIC := 7.0;
  min_sp NUMERIC := 5.0;
  min_wt NUMERIC := 5.0;

BEGIN
  RETURN QUERY
  -- First, identify which meets are indoor (have 60m events)
  WITH indoor_meets AS (
    SELECT DISTINCT r.meet_name, r.date
    FROM results r
    WHERE r.date BETWEEN p_start_date AND p_end_date
      AND r.event_name ~* '^60\s*(Meters?|m|Hurdles?|Meter\s*Hurdles?|mH)'
  ),
  scored AS (
    SELECT
      r.athlete_id::INT,
      a.full_name::TEXT,
      a.gender::CHAR(1),
      r.event_name AS raw_event_name,
      -- Normalize event name for display
      CASE
        WHEN r.event_name ~* '^60\s*(Meters?|m)$' THEN '60 Meters'
        WHEN r.event_name ~* '^200\s*(Meters?|Meter\s*Dash|m|M)' THEN '200 Meters'
        WHEN r.event_name ~* '^400\s*(Meters?|Meter\s*Dash|m)' THEN '400 Meters'
        WHEN r.event_name ~* '^600\s*(Meters?|Meter|m|Yards?)' THEN '600 Meters'
        WHEN r.event_name ~* '^800\s*(Meters?|Meter\s*Run|m)' THEN '800 Meters'
        WHEN r.event_name ~* '^1000\s*(Meters?|m)' THEN '1000 Meters'
        WHEN r.event_name ~* '^1500\s*(Meters?|m)' THEN '1500 Meters'
        WHEN r.event_name ~* '(^Mile|^1\s*Mile)' THEN 'Mile'
        WHEN r.event_name ~* '^3000\s*(Meters?|m)' THEN '3000 Meters'
        WHEN r.event_name ~* '^5000\s*(Meters?|m)' THEN '5000 Meters'
        WHEN r.event_name ~* '^60\s*(Hurdles?|Meter\s*Hurdles?|mH|m\s*H)' THEN '60 Hurdles'
        WHEN r.event_name ~* '^High\s*Jump' THEN 'High Jump'
        WHEN r.event_name ~* '^Pole\s*Vault' THEN 'Pole Vault'
        WHEN r.event_name ~* '^Long\s*Jump' THEN 'Long Jump'
        WHEN r.event_name ~* '^Triple\s*Jump' THEN 'Triple Jump'
        WHEN r.event_name ~* '^Shot\s*Put' THEN 'Shot Put'
        WHEN r.event_name ~* '^Weight\s*Throw|^WT$' THEN 'Weight Throw'
        ELSE r.event_name
      END::TEXT AS normalized_event_name,
      r.mark_raw::TEXT,
      r.mark_seconds::NUMERIC,
      r.mark_meters::NUMERIC,
      r.date::DATE,
      r.meet_name::TEXT,
      r.meet_id::INT,
      r.place::SMALLINT,
      s.official_name::TEXT AS school_name,
      s.division::TEXT,
      (EXISTS (SELECT 1 FROM indoor_meets im WHERE im.meet_name = r.meet_name AND im.date = r.date)) AS is_indoor,
      r.mark_seconds AS ms,
      r.mark_meters AS mm
    FROM results r
    INNER JOIN athletes a ON r.athlete_id = a.athlete_id
    INNER JOIN schools s ON a.school_id = s.school_id
    WHERE r.date BETWEEN p_start_date AND p_end_date
      AND r.mark_raw IS NOT NULL
      AND (
        p_division IS NULL
        OR p_division = 'all'
        OR s.division ILIKE ANY(
          CASE p_division
            WHEN 'D1' THEN ARRAY['DI', 'D1', 'Division I', 'NCAA Division I']
            WHEN 'D2' THEN ARRAY['DII', 'D2', 'Division II', 'NCAA Division II']
            WHEN 'D3' THEN ARRAY['DIII', 'D3', 'Division III', 'NCAA Division III']
            WHEN 'NAIA' THEN ARRAY['NAIA']
            WHEN 'JUCO' THEN ARRAY['JUCO', 'NJCAA']
            ELSE ARRAY[p_division]
          END
        )
      )
      AND (p_gender IS NULL OR a.gender = p_gender)
  ),
  with_points AS (
    SELECT
      scored.*,
      GREATEST(0, ROUND(
        CASE
          -- MEN'S 60m (indoor only) with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^60\s*(Meters?|m)$'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_60m THEN
            m_60m_a * scored.ms * scored.ms + m_60m_b * scored.ms + m_60m_c

          -- MEN'S 200m with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^200\s*(Meters?|Meter\s*Dash|m|M)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_200m THEN
            CASE WHEN scored.is_indoor THEN
              m_200m_indoor_a * scored.ms * scored.ms + m_200m_indoor_b * scored.ms + m_200m_indoor_c
            ELSE
              m_200m_outdoor_a * scored.ms * scored.ms + m_200m_outdoor_b * scored.ms + m_200m_outdoor_c
            END

          -- MEN'S 400m with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^400\s*(Meters?|Meter\s*Dash|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_400m THEN
            CASE WHEN scored.is_indoor THEN
              m_400m_indoor_a * scored.ms * scored.ms + m_400m_indoor_b * scored.ms + m_400m_indoor_c
            ELSE
              m_400m_outdoor_a * scored.ms * scored.ms + m_400m_outdoor_b * scored.ms + m_400m_outdoor_c
            END

          -- MEN'S 600m with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^600\s*(Meters?|Meter|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_600m THEN
            CASE WHEN scored.is_indoor THEN
              m_600m_indoor_a * scored.ms * scored.ms + m_600m_indoor_b * scored.ms + m_600m_indoor_c
            ELSE
              m_600m_outdoor_a * scored.ms * scored.ms + m_600m_outdoor_b * scored.ms + m_600m_outdoor_c
            END

          -- MEN'S 800m with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^800\s*(Meters?|Meter\s*Run|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_800m THEN
            CASE WHEN scored.is_indoor THEN
              m_800m_indoor_a * scored.ms * scored.ms + m_800m_indoor_b * scored.ms + m_800m_indoor_c
            ELSE
              m_800m_outdoor_a * scored.ms * scored.ms + m_800m_outdoor_b * scored.ms + m_800m_outdoor_c
            END

          -- MEN'S 1000m with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^1000\s*(Meters?|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_1000m THEN
            CASE WHEN scored.is_indoor THEN
              m_1000m_indoor_a * scored.ms * scored.ms + m_1000m_indoor_b * scored.ms + m_1000m_indoor_c
            ELSE
              m_1000m_outdoor_a * scored.ms * scored.ms + m_1000m_outdoor_b * scored.ms + m_1000m_outdoor_c
            END

          -- MEN'S 1500m with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^1500\s*(Meters?|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_1500m THEN
            CASE WHEN scored.is_indoor THEN
              m_1500m_indoor_a * scored.ms * scored.ms + m_1500m_indoor_b * scored.ms + m_1500m_indoor_c
            ELSE
              m_1500m_outdoor_a * scored.ms * scored.ms + m_1500m_outdoor_b * scored.ms + m_1500m_outdoor_c
            END

          -- MEN'S Mile with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '(^Mile|^1\s*Mile)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_mile THEN
            CASE WHEN scored.is_indoor THEN
              m_mile_indoor_a * scored.ms * scored.ms + m_mile_indoor_b * scored.ms + m_mile_indoor_c
            ELSE
              m_mile_outdoor_a * scored.ms * scored.ms + m_mile_outdoor_b * scored.ms + m_mile_outdoor_c
            END

          -- MEN'S 3000m with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^3000\s*(Meters?|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_3000m THEN
            CASE WHEN scored.is_indoor THEN
              m_3000m_indoor_a * scored.ms * scored.ms + m_3000m_indoor_b * scored.ms + m_3000m_indoor_c
            ELSE
              m_3000m_outdoor_a * scored.ms * scored.ms + m_3000m_outdoor_b * scored.ms + m_3000m_outdoor_c
            END

          -- MEN'S 5000m with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^5000\s*(Meters?|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_5000m THEN
            CASE WHEN scored.is_indoor THEN
              m_5000m_indoor_a * scored.ms * scored.ms + m_5000m_indoor_b * scored.ms + m_5000m_indoor_c
            ELSE
              m_5000m_outdoor_a * scored.ms * scored.ms + m_5000m_outdoor_b * scored.ms + m_5000m_outdoor_c
            END

          -- MEN'S 60m Hurdles with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^60\s*(Hurdles?|Meter\s*Hurdles?|mH|m\s*H)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_60mh THEN
            m_60mh_a * scored.ms * scored.ms + m_60mh_b * scored.ms + m_60mh_c

          -- MEN'S field events with distance bounds
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^High\s*Jump'
               AND scored.mm IS NOT NULL AND scored.mm >= min_hj THEN
            m_hj_a * scored.mm * scored.mm + m_hj_b * scored.mm + m_hj_c
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^Pole\s*Vault'
               AND scored.mm IS NOT NULL AND scored.mm >= min_pv THEN
            m_pv_a * scored.mm * scored.mm + m_pv_b * scored.mm + m_pv_c
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^Long\s*Jump'
               AND scored.mm IS NOT NULL AND scored.mm >= min_lj THEN
            m_lj_a * scored.mm * scored.mm + m_lj_b * scored.mm + m_lj_c
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^Triple\s*Jump'
               AND scored.mm IS NOT NULL AND scored.mm >= min_m_tj THEN
            m_tj_a * scored.mm * scored.mm + m_tj_b * scored.mm + m_tj_c
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^Shot\s*Put'
               AND scored.mm IS NOT NULL AND scored.mm >= min_sp THEN
            m_sp_a * scored.mm * scored.mm + m_sp_b * scored.mm + m_sp_c
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^Weight\s*Throw|^WT$'
               AND scored.mm IS NOT NULL AND scored.mm >= min_wt THEN
            m_wt_a * scored.mm * scored.mm + m_wt_b * scored.mm + m_wt_c

          -- WOMEN'S 60m (indoor only) with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^60\s*(Meters?|m)$'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_60m THEN
            w_60m_a * scored.ms * scored.ms + w_60m_b * scored.ms + w_60m_c

          -- WOMEN'S 200m with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^200\s*(Meters?|Meter\s*Dash|m|M)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_200m THEN
            CASE WHEN scored.is_indoor THEN
              w_200m_indoor_a * scored.ms * scored.ms + w_200m_indoor_b * scored.ms + w_200m_indoor_c
            ELSE
              w_200m_outdoor_a * scored.ms * scored.ms + w_200m_outdoor_b * scored.ms + w_200m_outdoor_c
            END

          -- WOMEN'S 400m with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^400\s*(Meters?|Meter\s*Dash|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_400m THEN
            CASE WHEN scored.is_indoor THEN
              w_400m_indoor_a * scored.ms * scored.ms + w_400m_indoor_b * scored.ms + w_400m_indoor_c
            ELSE
              w_400m_outdoor_a * scored.ms * scored.ms + w_400m_outdoor_b * scored.ms + w_400m_outdoor_c
            END

          -- WOMEN'S 600m with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^600\s*(Meters?|Meter|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_600m THEN
            CASE WHEN scored.is_indoor THEN
              w_600m_indoor_a * scored.ms * scored.ms + w_600m_indoor_b * scored.ms + w_600m_indoor_c
            ELSE
              w_600m_outdoor_a * scored.ms * scored.ms + w_600m_outdoor_b * scored.ms + w_600m_outdoor_c
            END

          -- WOMEN'S 800m with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^800\s*(Meters?|Meter\s*Run|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_800m THEN
            CASE WHEN scored.is_indoor THEN
              w_800m_indoor_a * scored.ms * scored.ms + w_800m_indoor_b * scored.ms + w_800m_indoor_c
            ELSE
              w_800m_outdoor_a * scored.ms * scored.ms + w_800m_outdoor_b * scored.ms + w_800m_outdoor_c
            END

          -- WOMEN'S 1000m with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^1000\s*(Meters?|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_1000m THEN
            CASE WHEN scored.is_indoor THEN
              w_1000m_indoor_a * scored.ms * scored.ms + w_1000m_indoor_b * scored.ms + w_1000m_indoor_c
            ELSE
              w_1000m_outdoor_a * scored.ms * scored.ms + w_1000m_outdoor_b * scored.ms + w_1000m_outdoor_c
            END

          -- WOMEN'S 1500m with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^1500\s*(Meters?|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_1500m THEN
            CASE WHEN scored.is_indoor THEN
              w_1500m_indoor_a * scored.ms * scored.ms + w_1500m_indoor_b * scored.ms + w_1500m_indoor_c
            ELSE
              w_1500m_outdoor_a * scored.ms * scored.ms + w_1500m_outdoor_b * scored.ms + w_1500m_outdoor_c
            END

          -- WOMEN'S Mile with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '(^Mile|^1\s*Mile)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_mile THEN
            CASE WHEN scored.is_indoor THEN
              w_mile_indoor_a * scored.ms * scored.ms + w_mile_indoor_b * scored.ms + w_mile_indoor_c
            ELSE
              w_mile_outdoor_a * scored.ms * scored.ms + w_mile_outdoor_b * scored.ms + w_mile_outdoor_c
            END

          -- WOMEN'S 3000m with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^3000\s*(Meters?|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_3000m THEN
            CASE WHEN scored.is_indoor THEN
              w_3000m_indoor_a * scored.ms * scored.ms + w_3000m_indoor_b * scored.ms + w_3000m_indoor_c
            ELSE
              w_3000m_outdoor_a * scored.ms * scored.ms + w_3000m_outdoor_b * scored.ms + w_3000m_outdoor_c
            END

          -- WOMEN'S 5000m with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^5000\s*(Meters?|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_5000m THEN
            CASE WHEN scored.is_indoor THEN
              w_5000m_indoor_a * scored.ms * scored.ms + w_5000m_indoor_b * scored.ms + w_5000m_indoor_c
            ELSE
              w_5000m_outdoor_a * scored.ms * scored.ms + w_5000m_outdoor_b * scored.ms + w_5000m_outdoor_c
            END

          -- WOMEN'S 60m Hurdles with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^60\s*(Hurdles?|Meter\s*Hurdles?|mH|m\s*H)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_60mh THEN
            w_60mh_a * scored.ms * scored.ms + w_60mh_b * scored.ms + w_60mh_c

          -- WOMEN'S field events with distance bounds
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^High\s*Jump'
               AND scored.mm IS NOT NULL AND scored.mm >= min_hj THEN
            w_hj_a * scored.mm * scored.mm + w_hj_b * scored.mm + w_hj_c
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^Pole\s*Vault'
               AND scored.mm IS NOT NULL AND scored.mm >= min_pv THEN
            w_pv_a * scored.mm * scored.mm + w_pv_b * scored.mm + w_pv_c
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^Long\s*Jump'
               AND scored.mm IS NOT NULL AND scored.mm >= min_lj THEN
            w_lj_a * scored.mm * scored.mm + w_lj_b * scored.mm + w_lj_c
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^Triple\s*Jump'
               AND scored.mm IS NOT NULL AND scored.mm >= min_w_tj THEN
            w_tj_a * scored.mm * scored.mm + w_tj_b * scored.mm + w_tj_c
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^Shot\s*Put'
               AND scored.mm IS NOT NULL AND scored.mm >= min_sp THEN
            w_sp_a * scored.mm * scored.mm + w_sp_b * scored.mm + w_sp_c
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^Weight\s*Throw|^WT$'
               AND scored.mm IS NOT NULL AND scored.mm >= min_wt THEN
            w_wt_a * scored.mm * scored.mm + w_wt_b * scored.mm + w_wt_c

          ELSE NULL
        END
      ))::INT AS wa_points
    FROM scored
  ),
  ranked AS (
    SELECT
      with_points.athlete_id,
      with_points.full_name,
      with_points.gender,
      with_points.normalized_event_name AS event_name,
      with_points.mark_raw,
      with_points.ms::NUMERIC AS mark_seconds,
      with_points.mm::NUMERIC AS mark_meters,
      with_points.date,
      with_points.meet_name,
      with_points.meet_id,
      with_points.place,
      with_points.school_name,
      with_points.division,
      with_points.wa_points,
      ROW_NUMBER() OVER (PARTITION BY with_points.athlete_id ORDER BY with_points.wa_points DESC NULLS LAST) as rn
    FROM with_points
    WHERE with_points.wa_points IS NOT NULL
      AND with_points.wa_points > 0
      AND with_points.wa_points <= 1400
  )
  SELECT
    ranked.athlete_id,
    ranked.full_name,
    ranked.gender,
    ranked.event_name,
    ranked.mark_raw,
    ranked.mark_seconds,
    ranked.mark_meters,
    ranked.date,
    ranked.meet_name,
    ranked.meet_id,
    ranked.place,
    ranked.school_name,
    ranked.division,
    ranked.wa_points
  FROM ranked
  WHERE ranked.rn = 1
  ORDER BY ranked.wa_points DESC
  LIMIT p_limit;
END;
$_$;


ALTER FUNCTION public.get_top_performances(p_start_date date, p_end_date date, p_division text, p_gender character, p_limit integer) OWNER TO postgres;

--
-- Name: FUNCTION get_top_performances(p_start_date date, p_end_date date, p_division text, p_gender character, p_limit integer); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.get_top_performances(p_start_date date, p_end_date date, p_division text, p_gender character, p_limit integer) IS 'Gets top performances with Official WA 2025 coefficients + time bounds.
Features:
- Indoor/outdoor coefficients (based on 60m events in meet)
- Normalized event names (200 Meter Dash Invite → 200 Meters)
- Time bounds to filter injury times (51s 200m filtered out)
- Points capped at 1400

Time bounds: 60m(12/13s), 200m(35/40s), 400m(75/85s), etc.
Field minimums: HJ(1m), PV(2m), LJ(3m), etc.

Usage: SELECT * FROM get_top_performances(start_date, end_date, division, gender, limit)';


--
-- Name: get_weekly_performances(date, date, text, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_weekly_performances(p_start_date date, p_end_date date, p_division text DEFAULT NULL::text, p_limit integer DEFAULT 5000) RETURNS TABLE(athlete_id integer, full_name text, gender character, event_name text, mark_raw text, mark_seconds numeric, mark_meters numeric, date date, meet_name text, meet_id integer, place smallint, school_name text, division text)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.athlete_id::INT,
    a.full_name::TEXT,
    a.gender::CHAR(1),
    r.event_name::TEXT,
    r.mark_raw::TEXT,
    r.mark_seconds::NUMERIC,
    r.mark_meters::NUMERIC,
    r.date::DATE,
    r.meet_name::TEXT,
    r.meet_id::INT,
    r.place::SMALLINT,
    s.official_name::TEXT,
    s.division::TEXT
  FROM results r
  INNER JOIN athletes a ON r.athlete_id = a.athlete_id
  INNER JOIN schools s ON a.school_id = s.school_id
  WHERE r.date BETWEEN p_start_date AND p_end_date
    AND r.mark_raw IS NOT NULL
    AND (
      p_division IS NULL
      OR p_division = 'all'
      OR s.division ILIKE ANY(
        CASE p_division
          WHEN 'D1' THEN ARRAY['DI', 'D1', 'Division I', 'NCAA Division I']
          WHEN 'D2' THEN ARRAY['DII', 'D2', 'Division II', 'NCAA Division II']
          WHEN 'D3' THEN ARRAY['DIII', 'D3', 'Division III', 'NCAA Division III']
          WHEN 'NAIA' THEN ARRAY['NAIA']
          WHEN 'JUCO' THEN ARRAY['JUCO', 'NJCAA']
          ELSE ARRAY[p_division]
        END
      )
    )
  ORDER BY r.date DESC
  LIMIT p_limit;
END;
$$;


ALTER FUNCTION public.get_weekly_performances(p_start_date date, p_end_date date, p_division text, p_limit integer) OWNER TO postgres;

--
-- Name: FUNCTION get_weekly_performances(p_start_date date, p_end_date date, p_division text, p_limit integer); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.get_weekly_performances(p_start_date date, p_end_date date, p_division text, p_limit integer) IS 'Gets performances for a date range with athlete and school info joined.
Single call replaces 45+ client-side queries.
Usage: SELECT * FROM get_weekly_performances(start_date, end_date, division, limit)';


--
-- Name: register_push_token(text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.register_push_token(p_expo_push_token text, p_platform text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  token text := trim(p_expo_push_token);
  platform_name text := lower(nullif(trim(p_platform), ''));
BEGIN
  IF token IS NULL OR length(token) NOT BETWEEN 10 AND 512 THEN
    RAISE EXCEPTION 'Invalid Expo push token' USING ERRCODE = '22023';
  END IF;

  IF platform_name IS NOT NULL AND platform_name NOT IN ('android', 'ios', 'web') THEN
    RAISE EXCEPTION 'Invalid push-token platform' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.push_tokens (expo_push_token, platform, is_active)
  VALUES (token, platform_name, true)
  ON CONFLICT (expo_push_token) DO UPDATE
    SET platform = EXCLUDED.platform,
        is_active = true;
END;
$$;


ALTER FUNCTION public.register_push_token(p_expo_push_token text, p_platform text) OWNER TO postgres;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

--
-- Name: athletes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.athletes (
    athlete_id bigint NOT NULL,
    school_id bigint NOT NULL,
    full_name text NOT NULL,
    first_name text,
    last_name text,
    gender text,
    class_year text,
    grad_year integer,
    primary_events text,
    hometown text,
    high_school text,
    tfrrs_athlete_id text,
    tfrrs_profile_url text,
    athletic_net_url text,
    profile_image_url text,
    bio text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT athletes_gender_check CHECK ((gender = ANY (ARRAY['M'::text, 'F'::text])))
);


ALTER TABLE public.athletes OWNER TO postgres;

--
-- Name: TABLE athletes; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.athletes IS 'College track & field athletes';


--
-- Name: athletes_athlete_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.athletes_athlete_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.athletes_athlete_id_seq OWNER TO postgres;

--
-- Name: athletes_athlete_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.athletes_athlete_id_seq OWNED BY public.athletes.athlete_id;


--
-- Name: relay_athletes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.relay_athletes (
    relay_athlete_id integer NOT NULL,
    relay_result_id integer,
    athlete_id integer,
    tfrrs_athlete_id text,
    athlete_name text,
    leg_order integer,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.relay_athletes OWNER TO postgres;

--
-- Name: relay_athletes_relay_athlete_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.relay_athletes_relay_athlete_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.relay_athletes_relay_athlete_id_seq OWNER TO postgres;

--
-- Name: relay_athletes_relay_athlete_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.relay_athletes_relay_athlete_id_seq OWNED BY public.relay_athletes.relay_athlete_id;


--
-- Name: relay_results; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.relay_results (
    relay_result_id integer NOT NULL,
    team_id integer,
    event_name text NOT NULL,
    mark_raw text,
    mark_seconds numeric(10,2),
    place integer,
    meet_name text,
    meet_id integer,
    event_id integer,
    date date,
    round text,
    created_at timestamp with time zone DEFAULT now(),
    event_type_id integer
);


ALTER TABLE public.relay_results OWNER TO postgres;

--
-- Name: relay_results_relay_result_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.relay_results_relay_result_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.relay_results_relay_result_id_seq OWNER TO postgres;

--
-- Name: relay_results_relay_result_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.relay_results_relay_result_id_seq OWNED BY public.relay_results.relay_result_id;


--
-- Name: results; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.results (
    result_id bigint NOT NULL,
    athlete_id bigint NOT NULL,
    team_id bigint,
    event_name text NOT NULL,
    mark_raw text NOT NULL,
    mark_seconds double precision,
    mark_meters double precision,
    mark_feet text,
    wind text,
    round text,
    date date,
    season_code text,
    meet_name text,
    meet_location text,
    place integer,
    total_competitors integer,
    is_pr boolean DEFAULT false,
    is_season_best boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    meet_id integer,
    event_id integer,
    event_type_id integer,
    environment text,
    CONSTRAINT results_environment_check CHECK ((environment = ANY (ARRAY['indoor'::text, 'outdoor'::text, 'xc'::text])))
);


ALTER TABLE public.results OWNER TO postgres;

--
-- Name: TABLE results; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.results IS 'Meet results - 2.2M+ records of athlete performances';


--
-- Name: COLUMN results.mark_seconds; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.results.mark_seconds IS 'Converted time in seconds for time-based events';


--
-- Name: COLUMN results.mark_meters; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.results.mark_meters IS 'Converted distance in meters for distance throws/jumps';


--
-- Name: COLUMN results.season_code; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.results.season_code IS 'Format: YYYY_SEASON where SEASON is XC, IN, or OUT';


--
-- Name: results_result_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.results_result_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.results_result_id_seq OWNER TO postgres;

--
-- Name: results_result_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.results_result_id_seq OWNED BY public.results.result_id;


--
-- Name: athlete_aliases; Type: TABLE; Schema: ingest; Owner: postgres
--

CREATE TABLE ingest.athlete_aliases (
    athlete_alias_id bigint NOT NULL,
    source text NOT NULL,
    source_athlete_key text NOT NULL,
    source_athlete_name text,
    source_gender text NOT NULL,
    target_athlete_id bigint NOT NULL,
    match_method text DEFAULT 'verified_alias'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    verified_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT athlete_aliases_match_method_check CHECK ((match_method = ANY (ARRAY['exact_external_id'::text, 'verified_alias'::text, 'manual'::text]))),
    CONSTRAINT athlete_aliases_source_check CHECK ((source = ANY (ARRAY['tfrrs'::text, 'athletic_net'::text, 'ustfccca'::text, 'trackscoreboard'::text, 'milesplit'::text, 'pt_timing'::text, 'leonetiming'::text, 'manual'::text]))),
    CONSTRAINT athlete_aliases_source_gender_check CHECK ((source_gender = ANY (ARRAY['M'::text, 'F'::text]))),
    CONSTRAINT athlete_aliases_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))
);


ALTER TABLE ingest.athlete_aliases OWNER TO postgres;

--
-- Name: TABLE athlete_aliases; Type: COMMENT; Schema: ingest; Owner: postgres
--

COMMENT ON TABLE ingest.athlete_aliases IS 'Reviewed external athlete identities used by controlled ingestion without mutating public athlete profiles.';


--
-- Name: athlete_aliases_athlete_alias_id_seq; Type: SEQUENCE; Schema: ingest; Owner: postgres
--

ALTER TABLE ingest.athlete_aliases ALTER COLUMN athlete_alias_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ingest.athlete_aliases_athlete_alias_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: event_recovery_queue_job_id_seq; Type: SEQUENCE; Schema: ingest; Owner: postgres
--

ALTER TABLE ingest.event_recovery_queue ALTER COLUMN job_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ingest.event_recovery_queue_job_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: fact_cleanup_archive; Type: TABLE; Schema: ingest; Owner: postgres
--

CREATE TABLE ingest.fact_cleanup_archive (
    archive_id bigint NOT NULL,
    operation_key text NOT NULL,
    source_table text NOT NULL,
    source_pk text NOT NULL,
    row_data jsonb NOT NULL,
    archived_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE ingest.fact_cleanup_archive OWNER TO postgres;

--
-- Name: fact_cleanup_archive_archive_id_seq; Type: SEQUENCE; Schema: ingest; Owner: postgres
--

ALTER TABLE ingest.fact_cleanup_archive ALTER COLUMN archive_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ingest.fact_cleanup_archive_archive_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: observations; Type: TABLE; Schema: ingest; Owner: postgres
--

CREATE TABLE ingest.observations (
    observation_id bigint NOT NULL,
    run_id uuid NOT NULL,
    source_record_id bigint NOT NULL,
    source text NOT NULL,
    entity_type text NOT NULL,
    target_meet_id integer,
    target_athlete_id bigint,
    target_team_id bigint,
    event_type_id integer,
    raw_event_name text,
    measure text,
    mark_raw text,
    mark_seconds double precision,
    mark_meters double precision,
    points double precision,
    place integer,
    round text,
    result_date date,
    performance_key text,
    canonical_key text,
    decision text DEFAULT 'pending'::text NOT NULL,
    decision_reason text,
    confidence numeric(5,4),
    canonical_result_id bigint,
    canonical_relay_id integer,
    validation_errors jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT observations_check CHECK ((num_nonnulls(canonical_result_id, canonical_relay_id) <= 1)),
    CONSTRAINT observations_confidence_check CHECK (((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))),
    CONSTRAINT observations_decision_check CHECK ((decision = ANY (ARRAY['pending'::text, 'insert'::text, 'claim'::text, 'skip_duplicate'::text, 'quarantine'::text, 'error'::text]))),
    CONSTRAINT observations_entity_type_check CHECK ((entity_type = ANY (ARRAY['individual_result'::text, 'relay_result'::text, 'relay_leg'::text]))),
    CONSTRAINT observations_measure_check CHECK ((measure = ANY (ARRAY['time'::text, 'distance'::text, 'points'::text, 'unknown'::text]))),
    CONSTRAINT observations_source_check CHECK ((source = ANY (ARRAY['tfrrs'::text, 'athletic_net'::text, 'ustfccca'::text, 'trackscoreboard'::text, 'milesplit'::text, 'pt_timing'::text, 'leonetiming'::text, 'manual'::text])))
);


ALTER TABLE ingest.observations OWNER TO postgres;

--
-- Name: TABLE observations; Type: COMMENT; Schema: ingest; Owner: postgres
--

COMMENT ON TABLE ingest.observations IS 'One normalized source observation per run. This is the reviewable boundary before facts are written.';


--
-- Name: observations_observation_id_seq; Type: SEQUENCE; Schema: ingest; Owner: postgres
--

ALTER TABLE ingest.observations ALTER COLUMN observation_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ingest.observations_observation_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: quarantine; Type: TABLE; Schema: ingest; Owner: postgres
--

CREATE TABLE ingest.quarantine (
    quarantine_id bigint NOT NULL,
    observation_id bigint NOT NULL,
    reason_code text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    resolution_note text,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT quarantine_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text, 'rejected'::text])))
);


ALTER TABLE ingest.quarantine OWNER TO postgres;

--
-- Name: TABLE quarantine; Type: COMMENT; Schema: ingest; Owner: postgres
--

COMMENT ON TABLE ingest.quarantine IS 'Ambiguous or invalid source observations that must not be guessed into production facts.';


--
-- Name: quarantine_quarantine_id_seq; Type: SEQUENCE; Schema: ingest; Owner: postgres
--

ALTER TABLE ingest.quarantine ALTER COLUMN quarantine_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ingest.quarantine_quarantine_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: recovery_queue; Type: TABLE; Schema: ingest; Owner: postgres
--

CREATE TABLE ingest.recovery_queue (
    queue_id bigint NOT NULL,
    scope_key text NOT NULL,
    meet_id integer NOT NULL,
    coverage_status text NOT NULL,
    needs_individual boolean NOT NULL,
    needs_relays boolean NOT NULL,
    individual_fact_count bigint DEFAULT 0 NOT NULL,
    relay_fact_count bigint DEFAULT 0 NOT NULL,
    source_candidates jsonb DEFAULT '{}'::jsonb NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_run_id uuid,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    relay_coverage_status text DEFAULT 'unknown'::text NOT NULL,
    relay_checked_at timestamp with time zone,
    relay_probe_run_id uuid,
    quarantined_observation_count integer DEFAULT 0 NOT NULL,
    canonical_meet_id integer,
    canonical_match_method text,
    canonical_match_notes text,
    canonical_match_evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT recovery_queue_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT recovery_queue_canonical_meet_not_self CHECK (((canonical_meet_id IS NULL) OR (canonical_meet_id <> meet_id))),
    CONSTRAINT recovery_queue_coverage_status_check CHECK ((coverage_status = ANY (ARRAY['empty'::text, 'relay_only'::text, 'individual_only'::text, 'covered'::text]))),
    CONSTRAINT recovery_queue_priority_check CHECK ((priority >= 0)),
    CONSTRAINT recovery_queue_quarantined_observation_count_check CHECK ((quarantined_observation_count >= 0)),
    CONSTRAINT recovery_queue_relay_coverage_status_check CHECK ((relay_coverage_status = ANY (ARRAY['unknown'::text, 'present'::text, 'absent'::text]))),
    CONSTRAINT recovery_queue_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'in_progress'::text, 'complete'::text, 'partial'::text, 'blocked'::text, 'exhausted'::text])))
);


ALTER TABLE ingest.recovery_queue OWNER TO postgres;

--
-- Name: TABLE recovery_queue; Type: COMMENT; Schema: ingest; Owner: postgres
--

COMMENT ON TABLE ingest.recovery_queue IS 'Private, resumable inventory of meet-level recovery work. It never directly writes public facts.';


--
-- Name: COLUMN recovery_queue.canonical_meet_id; Type: COMMENT; Schema: ingest; Owner: postgres
--

COMMENT ON COLUMN ingest.recovery_queue.canonical_meet_id IS 'Verified public meet destination for an alternate source shell; NULL means the queue meet_id is canonical.';


--
-- Name: COLUMN recovery_queue.canonical_match_method; Type: COMMENT; Schema: ingest; Owner: postgres
--

COMMENT ON COLUMN ingest.recovery_queue.canonical_match_method IS 'Review method used to establish that this queue shell maps to canonical_meet_id.';


--
-- Name: COLUMN recovery_queue.canonical_match_notes; Type: COMMENT; Schema: ingest; Owner: postgres
--

COMMENT ON COLUMN ingest.recovery_queue.canonical_match_notes IS 'Human-readable evidence summary for the canonical meet identity decision.';


--
-- Name: COLUMN recovery_queue.canonical_match_evidence; Type: COMMENT; Schema: ingest; Owner: postgres
--

COMMENT ON COLUMN ingest.recovery_queue.canonical_match_evidence IS 'JSON array of source URLs or review evidence supporting the canonical meet identity decision.';


--
-- Name: recovery_queue_queue_id_seq; Type: SEQUENCE; Schema: ingest; Owner: postgres
--

ALTER TABLE ingest.recovery_queue ALTER COLUMN queue_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ingest.recovery_queue_queue_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: runs; Type: TABLE; Schema: ingest; Owner: postgres
--

CREATE TABLE ingest.runs (
    run_id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    mode text NOT NULL,
    status text DEFAULT 'created'::text NOT NULL,
    scope jsonb DEFAULT '{}'::jsonb NOT NULL,
    parser_version text NOT NULL,
    code_revision text,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT runs_mode_check CHECK ((mode = ANY (ARRAY['dry_run'::text, 'commit'::text]))),
    CONSTRAINT runs_source_check CHECK ((source = ANY (ARRAY['tfrrs'::text, 'athletic_net'::text, 'mixed'::text, 'ustfccca'::text, 'trackscoreboard'::text, 'milesplit'::text, 'pt_timing'::text, 'leonetiming'::text, 'manual'::text]))),
    CONSTRAINT runs_status_check CHECK ((status = ANY (ARRAY['created'::text, 'running'::text, 'succeeded'::text, 'partial'::text, 'failed'::text, 'aborted'::text])))
);


ALTER TABLE ingest.runs OWNER TO postgres;

--
-- Name: TABLE runs; Type: COMMENT; Schema: ingest; Owner: postgres
--

COMMENT ON TABLE ingest.runs IS 'One auditable execution of an importer or recovery job. A run is never silently successful.';


--
-- Name: source_links; Type: TABLE; Schema: ingest; Owner: postgres
--

CREATE TABLE ingest.source_links (
    source_record_id bigint NOT NULL,
    entity_type text NOT NULL,
    result_id bigint,
    relay_result_id integer,
    link_status text DEFAULT 'unlinked'::text NOT NULL,
    first_linked_at timestamp with time zone,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT source_links_check CHECK ((num_nonnulls(result_id, relay_result_id) <= 1)),
    CONSTRAINT source_links_entity_type_check CHECK ((entity_type = ANY (ARRAY['individual_result'::text, 'relay_result'::text, 'relay_leg'::text]))),
    CONSTRAINT source_links_link_status_check CHECK ((link_status = ANY (ARRAY['linked'::text, 'unlinked'::text, 'quarantined'::text]))),
    CONSTRAINT source_links_linked_target_ck CHECK (((link_status <> 'linked'::text) OR (num_nonnulls(result_id, relay_result_id) = 1)))
);


ALTER TABLE ingest.source_links OWNER TO postgres;

--
-- Name: TABLE source_links; Type: COMMENT; Schema: ingest; Owner: postgres
--

COMMENT ON TABLE ingest.source_links IS 'Provenance bridge: one stable source record can point to at most one canonical fact row.';


--
-- Name: source_records; Type: TABLE; Schema: ingest; Owner: postgres
--

CREATE TABLE ingest.source_records (
    source_record_id bigint NOT NULL,
    source text NOT NULL,
    source_record_key text NOT NULL,
    source_meet_key text,
    source_event_key text,
    source_url text,
    payload_hash text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT source_records_source_check CHECK ((source = ANY (ARRAY['tfrrs'::text, 'athletic_net'::text, 'ustfccca'::text, 'trackscoreboard'::text, 'milesplit'::text, 'pt_timing'::text, 'leonetiming'::text, 'manual'::text])))
);


ALTER TABLE ingest.source_records OWNER TO postgres;

--
-- Name: TABLE source_records; Type: COMMENT; Schema: ingest; Owner: postgres
--

COMMENT ON TABLE ingest.source_records IS 'Stable source identity and the latest compact source payload. Raw pages belong in durable object storage, not this table.';


--
-- Name: source_records_source_record_id_seq; Type: SEQUENCE; Schema: ingest; Owner: postgres
--

ALTER TABLE ingest.source_records ALTER COLUMN source_record_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ingest.source_records_source_record_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: team_aliases; Type: TABLE; Schema: ingest; Owner: postgres
--

CREATE TABLE ingest.team_aliases (
    team_alias_id bigint NOT NULL,
    source text NOT NULL,
    source_team_key text NOT NULL,
    source_team_name text,
    source_gender text NOT NULL,
    normalized_source_team_key text NOT NULL,
    normalized_source_team_name text,
    team_id bigint NOT NULL,
    match_method text DEFAULT 'verified_alias'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    verified_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT team_aliases_match_method_check CHECK ((match_method = ANY (ARRAY['exact_source_key'::text, 'verified_alias'::text, 'manual'::text]))),
    CONSTRAINT team_aliases_source_check CHECK ((source = ANY (ARRAY['tfrrs'::text, 'athletic_net'::text, 'ustfccca'::text, 'trackscoreboard'::text, 'milesplit'::text, 'pt_timing'::text, 'leonetiming'::text, 'manual'::text]))),
    CONSTRAINT team_aliases_source_gender_check CHECK ((source_gender = ANY (ARRAY['M'::text, 'F'::text]))),
    CONSTRAINT team_aliases_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))
);


ALTER TABLE ingest.team_aliases OWNER TO postgres;

--
-- Name: TABLE team_aliases; Type: COMMENT; Schema: ingest; Owner: postgres
--

COMMENT ON TABLE ingest.team_aliases IS 'Reviewed source-team aliases used to resolve scraper labels to canonical public.teams identities.';


--
-- Name: COLUMN team_aliases.source_team_key; Type: COMMENT; Schema: ingest; Owner: postgres
--

COMMENT ON COLUMN ingest.team_aliases.source_team_key IS 'Stable source identity when available, such as a TFRRS team slug.';


--
-- Name: COLUMN team_aliases.source_gender; Type: COMMENT; Schema: ingest; Owner: postgres
--

COMMENT ON COLUMN ingest.team_aliases.source_gender IS 'Gender of the source squad; required because public.teams has separate M/F rows.';


--
-- Name: team_aliases_team_alias_id_seq; Type: SEQUENCE; Schema: ingest; Owner: postgres
--

ALTER TABLE ingest.team_aliases ALTER COLUMN team_alias_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ingest.team_aliases_team_alias_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: athlete_prs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.athlete_prs (
    id integer NOT NULL,
    athlete_id integer NOT NULL,
    event_name character varying(100) NOT NULL,
    mark_raw character varying(50) NOT NULL,
    mark_seconds numeric(10,3),
    mark_meters numeric(10,3),
    set_at date,
    meet_name character varying(255),
    season character varying(20) DEFAULT 'all'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.athlete_prs OWNER TO postgres;

--
-- Name: athlete_prs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.athlete_prs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.athlete_prs_id_seq OWNER TO postgres;

--
-- Name: athlete_prs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.athlete_prs_id_seq OWNED BY public.athlete_prs.id;


--
-- Name: athlete_team_seasons; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.athlete_team_seasons (
    ats_id bigint NOT NULL,
    athlete_id bigint NOT NULL,
    team_id bigint NOT NULL,
    season_code text NOT NULL,
    year_in_school text,
    jersey_number text,
    status text DEFAULT 'active'::text,
    is_redshirt boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.athlete_team_seasons OWNER TO postgres;

--
-- Name: TABLE athlete_team_seasons; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.athlete_team_seasons IS 'Tracks which athletes were on which teams in which seasons';


--
-- Name: athlete_team_seasons_ats_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.athlete_team_seasons_ats_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.athlete_team_seasons_ats_id_seq OWNER TO postgres;

--
-- Name: athlete_team_seasons_ats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.athlete_team_seasons_ats_id_seq OWNED BY public.athlete_team_seasons.ats_id;


--
-- Name: conference_memberships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.conference_memberships (
    membership_id bigint NOT NULL,
    school_id bigint NOT NULL,
    conference_id bigint NOT NULL,
    start_year integer,
    end_year integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.conference_memberships OWNER TO postgres;

--
-- Name: conference_memberships_membership_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.conference_memberships_membership_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.conference_memberships_membership_id_seq OWNER TO postgres;

--
-- Name: conference_memberships_membership_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.conference_memberships_membership_id_seq OWNED BY public.conference_memberships.membership_id;


--
-- Name: conferences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.conferences (
    conference_id bigint NOT NULL,
    name text NOT NULL,
    abbreviation text,
    division text,
    region text,
    website text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    division_id integer
);


ALTER TABLE public.conferences OWNER TO postgres;

--
-- Name: conferences_conference_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.conferences_conference_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.conferences_conference_id_seq OWNER TO postgres;

--
-- Name: conferences_conference_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.conferences_conference_id_seq OWNED BY public.conferences.conference_id;


--
-- Name: divisions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.divisions (
    division_id integer NOT NULL,
    code text NOT NULL,
    display_name text NOT NULL,
    governing_body text NOT NULL,
    sort_order integer NOT NULL
);


ALTER TABLE public.divisions OWNER TO postgres;

--
-- Name: divisions_division_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.divisions_division_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.divisions_division_id_seq OWNER TO postgres;

--
-- Name: divisions_division_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.divisions_division_id_seq OWNED BY public.divisions.division_id;


--
-- Name: event_aliases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_aliases (
    raw_name text NOT NULL,
    event_type_id integer NOT NULL
);


ALTER TABLE public.event_aliases OWNER TO postgres;

--
-- Name: event_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_types (
    event_type_id integer NOT NULL,
    code text NOT NULL,
    category text,
    measure text,
    environment_scope text,
    CONSTRAINT event_types_environment_scope_check CHECK ((environment_scope = ANY (ARRAY['indoor_only'::text, 'outdoor_only'::text, 'xc'::text, 'both'::text])))
);


ALTER TABLE public.event_types OWNER TO postgres;

--
-- Name: event_types_event_type_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.event_types_event_type_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.event_types_event_type_id_seq OWNER TO postgres;

--
-- Name: event_types_event_type_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.event_types_event_type_id_seq OWNED BY public.event_types.event_type_id;


--
-- Name: external_ids; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.external_ids (
    external_id bigint NOT NULL,
    school_id bigint,
    athlete_id bigint,
    team_id bigint,
    conference_id bigint,
    source text NOT NULL,
    external_name text,
    external_key text,
    external_url text,
    verified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.external_ids OWNER TO postgres;

--
-- Name: external_ids_external_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.external_ids_external_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.external_ids_external_id_seq OWNER TO postgres;

--
-- Name: external_ids_external_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.external_ids_external_id_seq OWNED BY public.external_ids.external_id;


--
-- Name: live_results; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.live_results (
    live_result_id bigint NOT NULL,
    meet_url text NOT NULL,
    meet_name text,
    event_name text NOT NULL,
    participant_name text NOT NULL,
    place integer,
    mark_raw text NOT NULL,
    mark_seconds double precision,
    splits text[],
    scraped_at timestamp with time zone NOT NULL,
    date date,
    round text DEFAULT 'LIVE'::text,
    is_processed boolean DEFAULT false,
    athlete_id bigint,
    team_id bigint,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    team_name text,
    is_final boolean DEFAULT false,
    meet_id bigint,
    result_type text DEFAULT 'live'::text
);


ALTER TABLE public.live_results OWNER TO postgres;

--
-- Name: live_results_live_result_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.live_results_live_result_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.live_results_live_result_id_seq OWNER TO postgres;

--
-- Name: live_results_live_result_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.live_results_live_result_id_seq OWNED BY public.live_results.live_result_id;


--
-- Name: meets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.meets (
    meet_id integer NOT NULL,
    name text NOT NULL,
    date date NOT NULL,
    location text,
    meet_url text,
    status text DEFAULT 'upcoming'::text,
    level text,
    season text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    timing_platform text,
    source_url text,
    tfrrs_meet_id text,
    end_date date,
    tfrrs_url text,
    athletic_net_results_url text,
    wa_results_url text,
    results_status text DEFAULT 'pending'::text,
    results_last_checked_at timestamp with time zone,
    results_imported_at timestamp with time zone,
    results_error text,
    results_source text,
    CONSTRAINT meets_results_source_check CHECK ((results_source = ANY (ARRAY['athletic_net'::text, 'tfrrs'::text, 'ustfccca'::text, 'timing_site'::text, 'manual'::text, 'other'::text]))),
    CONSTRAINT meets_status_check CHECK ((status = ANY (ARRAY['upcoming'::text, 'live'::text, 'completed'::text])))
);


ALTER TABLE public.meets OWNER TO postgres;

--
-- Name: COLUMN meets.results_source; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.meets.results_source IS 'Which source the imported results came from (set by the results orchestrator). Pairs with results_status. Link columns: meet_url=live/timing link; athletic_net_results_url / tfrrs_url / wa_results_url = per-source RESULTS links.';


--
-- Name: meets_meet_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.meets_meet_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.meets_meet_id_seq OWNER TO postgres;

--
-- Name: meets_meet_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.meets_meet_id_seq OWNED BY public.meets.meet_id;


--
-- Name: push_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.push_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expo_push_token text NOT NULL,
    platform text,
    created_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true
);


ALTER TABLE public.push_tokens OWNER TO postgres;

--
-- Name: regions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.regions (
    region_id bigint NOT NULL,
    region_name text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    division_id integer
);


ALTER TABLE public.regions OWNER TO postgres;

--
-- Name: regions_region_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.regions_region_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.regions_region_id_seq OWNER TO postgres;

--
-- Name: regions_region_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.regions_region_id_seq OWNED BY public.regions.region_id;


--
-- Name: schools; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.schools (
    school_id bigint NOT NULL,
    official_name text NOT NULL,
    short_name text,
    city text,
    state text,
    division text,
    ncaa_region text,
    current_conference_id bigint,
    region_id bigint,
    is_active boolean DEFAULT true,
    logo_url text,
    logo_file_path text,
    logo_source text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    division_id integer
);


ALTER TABLE public.schools OWNER TO postgres;

--
-- Name: TABLE schools; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.schools IS 'NCAA/NAIA/NJCAA schools with track & field programs';


--
-- Name: schools_full; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.schools_full WITH (security_invoker='on') AS
 SELECT s.school_id,
    s.official_name,
    s.short_name,
    s.city,
    s.state,
    s.division,
    r.region_name,
    c.name AS conference_name,
    c.abbreviation AS conference_abbrev,
    s.logo_url,
    s.is_active
   FROM ((public.schools s
     LEFT JOIN public.regions r ON ((s.region_id = r.region_id)))
     LEFT JOIN public.conferences c ON ((s.current_conference_id = c.conference_id)));


ALTER VIEW public.schools_full OWNER TO postgres;

--
-- Name: schools_school_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.schools_school_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.schools_school_id_seq OWNER TO postgres;

--
-- Name: schools_school_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.schools_school_id_seq OWNED BY public.schools.school_id;


--
-- Name: teams; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teams (
    team_id bigint NOT NULL,
    school_id bigint NOT NULL,
    gender text NOT NULL,
    tfrrs_team_url text,
    athletic_net_url text,
    coach_name text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    team_name text,
    team_type text,
    CONSTRAINT teams_gender_check CHECK ((gender = ANY (ARRAY['M'::text, 'F'::text]))),
    CONSTRAINT teams_team_type_check CHECK (((team_type IS NULL) OR (team_type = ANY (ARRAY['collegiate'::text, 'club'::text, 'scholastic'::text, 'international'::text, 'open'::text, 'unattached'::text, 'other'::text]))))
);


ALTER TABLE public.teams OWNER TO postgres;

--
-- Name: TABLE teams; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.teams IS 'Mens and Womens teams per school';


--
-- Name: COLUMN teams.team_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.teams.team_name IS 'Explicit competition-affiliation label; NULL preserves the legacy school-derived display until reviewed.';


--
-- Name: COLUMN teams.team_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.teams.team_type IS 'Reviewed affiliation category: collegiate, club, scholastic, international, open, unattached, or other.';


--
-- Name: teams_summary; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.teams_summary AS
 SELECT t.team_id,
    COALESCE(t.team_name, s.official_name) AS school_name,
    s.division,
    t.gender,
    r.region_name,
    c.name AS conference_name,
    count(ats.athlete_id) AS athlete_count
   FROM ((((public.teams t
     JOIN public.schools s ON ((t.school_id = s.school_id)))
     LEFT JOIN public.regions r ON ((s.region_id = r.region_id)))
     LEFT JOIN public.conferences c ON ((s.current_conference_id = c.conference_id)))
     LEFT JOIN public.athlete_team_seasons ats ON ((t.team_id = ats.team_id)))
  GROUP BY t.team_id, COALESCE(t.team_name, s.official_name), s.division, t.gender, r.region_name, c.name;


ALTER VIEW public.teams_summary OWNER TO postgres;

--
-- Name: VIEW teams_summary; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.teams_summary IS 'Compatibility summary; school_name prefers reviewed teams.team_name and falls back to schools.official_name.';


--
-- Name: teams_team_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.teams_team_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.teams_team_id_seq OWNER TO postgres;

--
-- Name: teams_team_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.teams_team_id_seq OWNED BY public.teams.team_id;


--
-- Name: unmapped_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.unmapped_events (
    raw_name text NOT NULL,
    first_seen timestamp with time zone DEFAULT now(),
    seen_count integer DEFAULT 1
);


ALTER TABLE public.unmapped_events OWNER TO postgres;

--
-- Name: unprocessed_live_results; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.unprocessed_live_results WITH (security_invoker='on') AS
 SELECT live_result_id,
    meet_url,
    meet_name,
    event_name,
    participant_name,
    place,
    mark_raw,
    mark_seconds,
    splits,
    scraped_at,
    date,
    round,
    is_processed,
    athlete_id,
    team_id,
    created_at,
    updated_at
   FROM public.live_results
  WHERE (is_processed = false)
  ORDER BY scraped_at DESC;


ALTER VIEW public.unprocessed_live_results OWNER TO postgres;

--
-- Name: v_athlete_prs; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_athlete_prs AS
 WITH ranked AS (
         SELECT r.result_id,
            r.athlete_id,
            r.event_type_id,
            r.environment,
            r.mark_raw,
            r.mark_seconds,
            r.mark_meters,
                CASE et.measure
                    WHEN 'points'::text THEN (NULLIF("substring"(TRIM(BOTH FROM r.mark_raw), '^[0-9]{3,5}'::text), ''::text))::numeric
                    ELSE NULL::numeric
                END AS mark_points,
            r.date,
            r.meet_id,
            et.measure,
            row_number() OVER (PARTITION BY r.athlete_id, r.event_type_id, r.environment ORDER BY
                CASE et.measure
                    WHEN 'time'::text THEN r.mark_seconds
                    WHEN 'distance'::text THEN (- r.mark_meters)
                    WHEN 'points'::text THEN ((- (NULLIF("substring"(TRIM(BOTH FROM r.mark_raw), '^[0-9]{3,5}'::text), ''::text))::numeric))::double precision
                    ELSE NULL::double precision
                END, r.date, r.result_id) AS rn
           FROM (public.results r
             JOIN public.event_types et ON ((et.event_type_id = r.event_type_id)))
          WHERE ((r.athlete_id IS NOT NULL) AND (((et.measure = 'time'::text) AND (r.mark_seconds IS NOT NULL)) OR ((et.measure = 'distance'::text) AND (r.mark_meters IS NOT NULL)) OR ((et.measure = 'points'::text) AND (r.mark_seconds IS NULL) AND (r.mark_meters IS NULL) AND (r.mark_raw ~ '^\s*[0-9]{3,5}(\s|$)'::text))))
        )
 SELECT athlete_id,
    event_type_id,
    environment,
    mark_raw,
    mark_seconds,
    mark_meters,
    mark_points,
    date AS achieved_on,
    meet_id AS achieved_at_meet_id,
    result_id AS source_result_id
   FROM ranked
  WHERE (rn = 1);


ALTER VIEW public.v_athlete_prs OWNER TO postgres;

--
-- Name: waitlist; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.waitlist (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    feature character varying(100) DEFAULT 'community'::character varying,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.waitlist OWNER TO postgres;

--
-- Name: waitlist_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.waitlist_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.waitlist_id_seq OWNER TO postgres;

--
-- Name: waitlist_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.waitlist_id_seq OWNED BY public.waitlist.id;


--
-- Name: athlete_prs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.athlete_prs ALTER COLUMN id SET DEFAULT nextval('public.athlete_prs_id_seq'::regclass);


--
-- Name: athlete_team_seasons ats_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.athlete_team_seasons ALTER COLUMN ats_id SET DEFAULT nextval('public.athlete_team_seasons_ats_id_seq'::regclass);


--
-- Name: athletes athlete_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.athletes ALTER COLUMN athlete_id SET DEFAULT nextval('public.athletes_athlete_id_seq'::regclass);


--
-- Name: conference_memberships membership_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conference_memberships ALTER COLUMN membership_id SET DEFAULT nextval('public.conference_memberships_membership_id_seq'::regclass);


--
-- Name: conferences conference_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conferences ALTER COLUMN conference_id SET DEFAULT nextval('public.conferences_conference_id_seq'::regclass);


--
-- Name: divisions division_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.divisions ALTER COLUMN division_id SET DEFAULT nextval('public.divisions_division_id_seq'::regclass);


--
-- Name: event_types event_type_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_types ALTER COLUMN event_type_id SET DEFAULT nextval('public.event_types_event_type_id_seq'::regclass);


--
-- Name: external_ids external_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_ids ALTER COLUMN external_id SET DEFAULT nextval('public.external_ids_external_id_seq'::regclass);


--
-- Name: live_results live_result_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.live_results ALTER COLUMN live_result_id SET DEFAULT nextval('public.live_results_live_result_id_seq'::regclass);


--
-- Name: meets meet_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meets ALTER COLUMN meet_id SET DEFAULT nextval('public.meets_meet_id_seq'::regclass);


--
-- Name: regions region_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.regions ALTER COLUMN region_id SET DEFAULT nextval('public.regions_region_id_seq'::regclass);


--
-- Name: relay_athletes relay_athlete_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relay_athletes ALTER COLUMN relay_athlete_id SET DEFAULT nextval('public.relay_athletes_relay_athlete_id_seq'::regclass);


--
-- Name: relay_results relay_result_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relay_results ALTER COLUMN relay_result_id SET DEFAULT nextval('public.relay_results_relay_result_id_seq'::regclass);


--
-- Name: results result_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.results ALTER COLUMN result_id SET DEFAULT nextval('public.results_result_id_seq'::regclass);


--
-- Name: schools school_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schools ALTER COLUMN school_id SET DEFAULT nextval('public.schools_school_id_seq'::regclass);


--
-- Name: teams team_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams ALTER COLUMN team_id SET DEFAULT nextval('public.teams_team_id_seq'::regclass);


--
-- Name: waitlist id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waitlist ALTER COLUMN id SET DEFAULT nextval('public.waitlist_id_seq'::regclass);


--
-- Name: athlete_aliases athlete_aliases_pkey; Type: CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.athlete_aliases
    ADD CONSTRAINT athlete_aliases_pkey PRIMARY KEY (athlete_alias_id);


--
-- Name: athlete_aliases athlete_aliases_source_source_athlete_key_key; Type: CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.athlete_aliases
    ADD CONSTRAINT athlete_aliases_source_source_athlete_key_key UNIQUE (source, source_athlete_key);


--
-- Name: event_recovery_queue event_recovery_queue_pkey; Type: CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.event_recovery_queue
    ADD CONSTRAINT event_recovery_queue_pkey PRIMARY KEY (job_id);


--
-- Name: event_recovery_queue event_recovery_queue_scope_key_meet_id_event_type_id_key; Type: CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.event_recovery_queue
    ADD CONSTRAINT event_recovery_queue_scope_key_meet_id_event_type_id_key UNIQUE (scope_key, meet_id, event_type_id);


--
-- Name: fact_cleanup_archive fact_cleanup_archive_operation_key_source_table_source_pk_key; Type: CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.fact_cleanup_archive
    ADD CONSTRAINT fact_cleanup_archive_operation_key_source_table_source_pk_key UNIQUE (operation_key, source_table, source_pk);


--
-- Name: fact_cleanup_archive fact_cleanup_archive_pkey; Type: CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.fact_cleanup_archive
    ADD CONSTRAINT fact_cleanup_archive_pkey PRIMARY KEY (archive_id);


--
-- Name: observations observations_pkey; Type: CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.observations
    ADD CONSTRAINT observations_pkey PRIMARY KEY (observation_id);


--
-- Name: observations observations_run_id_source_record_id_key; Type: CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.observations
    ADD CONSTRAINT observations_run_id_source_record_id_key UNIQUE (run_id, source_record_id);


--
-- Name: quarantine quarantine_observation_id_key; Type: CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.quarantine
    ADD CONSTRAINT quarantine_observation_id_key UNIQUE (observation_id);


--
-- Name: quarantine quarantine_pkey; Type: CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.quarantine
    ADD CONSTRAINT quarantine_pkey PRIMARY KEY (quarantine_id);


--
-- Name: recovery_queue recovery_queue_pkey; Type: CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.recovery_queue
    ADD CONSTRAINT recovery_queue_pkey PRIMARY KEY (queue_id);


--
-- Name: recovery_queue recovery_queue_scope_key_meet_id_key; Type: CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.recovery_queue
    ADD CONSTRAINT recovery_queue_scope_key_meet_id_key UNIQUE (scope_key, meet_id);


--
-- Name: runs runs_pkey; Type: CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.runs
    ADD CONSTRAINT runs_pkey PRIMARY KEY (run_id);


--
-- Name: source_links source_links_pkey; Type: CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.source_links
    ADD CONSTRAINT source_links_pkey PRIMARY KEY (source_record_id);


--
-- Name: source_records source_records_pkey; Type: CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.source_records
    ADD CONSTRAINT source_records_pkey PRIMARY KEY (source_record_id);


--
-- Name: source_records source_records_source_source_record_key_key; Type: CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.source_records
    ADD CONSTRAINT source_records_source_source_record_key_key UNIQUE (source, source_record_key);


--
-- Name: team_aliases team_aliases_pkey; Type: CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.team_aliases
    ADD CONSTRAINT team_aliases_pkey PRIMARY KEY (team_alias_id);


--
-- Name: team_aliases team_aliases_source_normalized_source_team_key_source_gende_key; Type: CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.team_aliases
    ADD CONSTRAINT team_aliases_source_normalized_source_team_key_source_gende_key UNIQUE (source, normalized_source_team_key, source_gender);


--
-- Name: athlete_prs athlete_prs_athlete_id_event_name_season_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.athlete_prs
    ADD CONSTRAINT athlete_prs_athlete_id_event_name_season_key UNIQUE (athlete_id, event_name, season);


--
-- Name: athlete_prs athlete_prs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.athlete_prs
    ADD CONSTRAINT athlete_prs_pkey PRIMARY KEY (id);


--
-- Name: athlete_team_seasons athlete_team_seasons_athlete_id_team_id_season_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.athlete_team_seasons
    ADD CONSTRAINT athlete_team_seasons_athlete_id_team_id_season_code_key UNIQUE (athlete_id, team_id, season_code);


--
-- Name: athlete_team_seasons athlete_team_seasons_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.athlete_team_seasons
    ADD CONSTRAINT athlete_team_seasons_pkey PRIMARY KEY (ats_id);


--
-- Name: athletes athletes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.athletes
    ADD CONSTRAINT athletes_pkey PRIMARY KEY (athlete_id);


--
-- Name: conference_memberships conference_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conference_memberships
    ADD CONSTRAINT conference_memberships_pkey PRIMARY KEY (membership_id);


--
-- Name: conference_memberships conference_memberships_school_id_conference_id_start_year_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conference_memberships
    ADD CONSTRAINT conference_memberships_school_id_conference_id_start_year_key UNIQUE (school_id, conference_id, start_year);


--
-- Name: conferences conferences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conferences
    ADD CONSTRAINT conferences_pkey PRIMARY KEY (conference_id);


--
-- Name: divisions divisions_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_code_key UNIQUE (code);


--
-- Name: divisions divisions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_pkey PRIMARY KEY (division_id);


--
-- Name: event_aliases event_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_aliases
    ADD CONSTRAINT event_aliases_pkey PRIMARY KEY (raw_name);


--
-- Name: event_types event_types_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_types
    ADD CONSTRAINT event_types_code_key UNIQUE (code);


--
-- Name: event_types event_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_types
    ADD CONSTRAINT event_types_pkey PRIMARY KEY (event_type_id);


--
-- Name: external_ids external_ids_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_ids
    ADD CONSTRAINT external_ids_pkey PRIMARY KEY (external_id);


--
-- Name: external_ids external_ids_source_external_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_ids
    ADD CONSTRAINT external_ids_source_external_key_key UNIQUE (source, external_key);


--
-- Name: live_results live_results_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.live_results
    ADD CONSTRAINT live_results_pkey PRIMARY KEY (live_result_id);


--
-- Name: meets meets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meets
    ADD CONSTRAINT meets_pkey PRIMARY KEY (meet_id);


--
-- Name: push_tokens push_tokens_expo_push_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_expo_push_token_key UNIQUE (expo_push_token);


--
-- Name: push_tokens push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (id);


--
-- Name: regions regions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_pkey PRIMARY KEY (region_id);


--
-- Name: regions regions_region_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_region_name_key UNIQUE (region_name);


--
-- Name: relay_athletes relay_athletes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relay_athletes
    ADD CONSTRAINT relay_athletes_pkey PRIMARY KEY (relay_athlete_id);


--
-- Name: relay_results relay_results_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relay_results
    ADD CONSTRAINT relay_results_pkey PRIMARY KEY (relay_result_id);


--
-- Name: results results_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.results
    ADD CONSTRAINT results_pkey PRIMARY KEY (result_id);


--
-- Name: schools schools_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_pkey PRIMARY KEY (school_id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (team_id);


--
-- Name: teams teams_school_id_gender_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_school_id_gender_key UNIQUE (school_id, gender);


--
-- Name: unmapped_events unmapped_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.unmapped_events
    ADD CONSTRAINT unmapped_events_pkey PRIMARY KEY (raw_name);


--
-- Name: waitlist waitlist_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_email_key UNIQUE (email);


--
-- Name: waitlist waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_pkey PRIMARY KEY (id);


--
-- Name: ingest_athlete_aliases_target_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_athlete_aliases_target_idx ON ingest.athlete_aliases USING btree (target_athlete_id) WHERE (status = 'active'::text);


--
-- Name: ingest_event_recovery_queue_claim_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_event_recovery_queue_claim_idx ON ingest.event_recovery_queue USING btree (scope_key, status, next_attempt_at, priority, meet_id);


--
-- Name: ingest_event_recovery_queue_lease_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_event_recovery_queue_lease_idx ON ingest.event_recovery_queue USING btree (scope_key, status, leased_until) WHERE (status = 'in_progress'::text);


--
-- Name: ingest_observations_canonical_key_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_observations_canonical_key_idx ON ingest.observations USING btree (canonical_key) WHERE (canonical_key IS NOT NULL);


--
-- Name: ingest_observations_canonical_relay_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_observations_canonical_relay_idx ON ingest.observations USING btree (canonical_relay_id) WHERE (canonical_relay_id IS NOT NULL);


--
-- Name: ingest_observations_canonical_result_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_observations_canonical_result_idx ON ingest.observations USING btree (canonical_result_id) WHERE (canonical_result_id IS NOT NULL);


--
-- Name: ingest_observations_event_type_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_observations_event_type_idx ON ingest.observations USING btree (event_type_id) WHERE (event_type_id IS NOT NULL);


--
-- Name: ingest_observations_meet_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_observations_meet_idx ON ingest.observations USING btree (target_meet_id, entity_type, decision);


--
-- Name: ingest_observations_run_decision_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_observations_run_decision_idx ON ingest.observations USING btree (run_id, decision);


--
-- Name: ingest_observations_source_record_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_observations_source_record_idx ON ingest.observations USING btree (source_record_id);


--
-- Name: ingest_observations_target_athlete_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_observations_target_athlete_idx ON ingest.observations USING btree (target_athlete_id) WHERE (target_athlete_id IS NOT NULL);


--
-- Name: ingest_observations_target_team_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_observations_target_team_idx ON ingest.observations USING btree (target_team_id) WHERE (target_team_id IS NOT NULL);


--
-- Name: ingest_recovery_queue_canonical_meet_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_recovery_queue_canonical_meet_idx ON ingest.recovery_queue USING btree (canonical_meet_id) WHERE (canonical_meet_id IS NOT NULL);


--
-- Name: ingest_recovery_queue_last_run_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_recovery_queue_last_run_idx ON ingest.recovery_queue USING btree (last_run_id);


--
-- Name: ingest_recovery_queue_meet_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_recovery_queue_meet_idx ON ingest.recovery_queue USING btree (meet_id, scope_key);


--
-- Name: ingest_recovery_queue_status_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_recovery_queue_status_idx ON ingest.recovery_queue USING btree (scope_key, status, priority, meet_id);


--
-- Name: ingest_runs_status_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_runs_status_idx ON ingest.runs USING btree (status, created_at DESC);


--
-- Name: ingest_source_links_relay_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_source_links_relay_idx ON ingest.source_links USING btree (relay_result_id) WHERE (relay_result_id IS NOT NULL);


--
-- Name: ingest_source_links_result_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_source_links_result_idx ON ingest.source_links USING btree (result_id) WHERE (result_id IS NOT NULL);


--
-- Name: ingest_source_records_meet_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_source_records_meet_idx ON ingest.source_records USING btree (source, source_meet_key);


--
-- Name: ingest_team_aliases_name_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_team_aliases_name_idx ON ingest.team_aliases USING btree (source, normalized_source_team_name, source_gender) WHERE ((status = 'active'::text) AND (normalized_source_team_name IS NOT NULL));


--
-- Name: ingest_team_aliases_team_idx; Type: INDEX; Schema: ingest; Owner: postgres
--

CREATE INDEX ingest_team_aliases_team_idx ON ingest.team_aliases USING btree (team_id) WHERE (status = 'active'::text);


--
-- Name: conferences_normalized_name_uidx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX conferences_normalized_name_uidx ON public.conferences USING btree (lower(btrim(name)));


--
-- Name: idx_athlete_prs_athlete_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_athlete_prs_athlete_id ON public.athlete_prs USING btree (athlete_id);


--
-- Name: idx_athlete_prs_event_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_athlete_prs_event_name ON public.athlete_prs USING btree (event_name);


--
-- Name: idx_athlete_team_seasons_athlete; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_athlete_team_seasons_athlete ON public.athlete_team_seasons USING btree (athlete_id);


--
-- Name: idx_athlete_team_seasons_season; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_athlete_team_seasons_season ON public.athlete_team_seasons USING btree (season_code);


--
-- Name: idx_athlete_team_seasons_team; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_athlete_team_seasons_team ON public.athlete_team_seasons USING btree (team_id);


--
-- Name: idx_athletes_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_athletes_active ON public.athletes USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_athletes_full_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_athletes_full_name ON public.athletes USING btree (full_name);


--
-- Name: idx_athletes_gender; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_athletes_gender ON public.athletes USING btree (gender);


--
-- Name: idx_athletes_school_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_athletes_school_id ON public.athletes USING btree (school_id);


--
-- Name: idx_athletes_tfrrs; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_athletes_tfrrs ON public.athletes USING btree (tfrrs_athlete_id);


--
-- Name: idx_conference_memberships_conference_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_conference_memberships_conference_id ON public.conference_memberships USING btree (conference_id);


--
-- Name: idx_conferences_division; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_conferences_division ON public.conferences USING btree (division);


--
-- Name: idx_conferences_division_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_conferences_division_id ON public.conferences USING btree (division_id);


--
-- Name: idx_external_ids_conference_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_external_ids_conference_id ON public.external_ids USING btree (conference_id);


--
-- Name: idx_live_results_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_live_results_date ON public.live_results USING btree (date);


--
-- Name: idx_live_results_event; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_live_results_event ON public.live_results USING btree (event_name);


--
-- Name: idx_live_results_final; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_live_results_final ON public.live_results USING btree (is_final);


--
-- Name: idx_live_results_meet_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_live_results_meet_id ON public.live_results USING btree (meet_id);


--
-- Name: idx_live_results_meet_url; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_live_results_meet_url ON public.live_results USING btree (meet_url);


--
-- Name: idx_live_results_processed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_live_results_processed ON public.live_results USING btree (is_processed) WHERE (is_processed = false);


--
-- Name: idx_live_results_scraped_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_live_results_scraped_at ON public.live_results USING btree (scraped_at DESC);


--
-- Name: idx_live_results_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_live_results_type ON public.live_results USING btree (result_type);


--
-- Name: idx_meets_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meets_date ON public.meets USING btree (date);


--
-- Name: idx_meets_results_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meets_results_status ON public.meets USING btree (results_status);


--
-- Name: idx_meets_season; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meets_season ON public.meets USING btree (season);


--
-- Name: idx_meets_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meets_status ON public.meets USING btree (status);


--
-- Name: idx_meets_tfrrs_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meets_tfrrs_id ON public.meets USING btree (tfrrs_meet_id) WHERE (tfrrs_meet_id IS NOT NULL);


--
-- Name: idx_meets_tfrrs_url; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meets_tfrrs_url ON public.meets USING btree (tfrrs_url) WHERE (tfrrs_url IS NOT NULL);


--
-- Name: idx_meets_timing_platform; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meets_timing_platform ON public.meets USING btree (timing_platform);


--
-- Name: idx_push_tokens_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_push_tokens_active ON public.push_tokens USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_relay_athletes_athlete_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_relay_athletes_athlete_id ON public.relay_athletes USING btree (athlete_id);


--
-- Name: idx_relay_athletes_relay_result_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_relay_athletes_relay_result_id ON public.relay_athletes USING btree (relay_result_id);


--
-- Name: idx_relay_results_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_relay_results_date ON public.relay_results USING btree (date);


--
-- Name: idx_relay_results_meet_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_relay_results_meet_id ON public.relay_results USING btree (meet_id);


--
-- Name: idx_relay_results_team_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_relay_results_team_id ON public.relay_results USING btree (team_id);


--
-- Name: idx_results_athlete_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_results_athlete_date ON public.results USING btree (athlete_id, date DESC);


--
-- Name: idx_results_athlete_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_results_athlete_id ON public.results USING btree (athlete_id);


--
-- Name: idx_results_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_results_date ON public.results USING btree (date);


--
-- Name: idx_results_date_athlete; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_results_date_athlete ON public.results USING btree (date, athlete_id);


--
-- Name: idx_results_event; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_results_event ON public.results USING btree (event_name);


--
-- Name: idx_results_event_type_athlete_meet; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_results_event_type_athlete_meet ON public.results USING btree (event_type_id, athlete_id, meet_id);


--
-- Name: idx_results_meet_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_results_meet_id ON public.results USING btree (meet_id);


--
-- Name: idx_results_meet_name_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_results_meet_name_date ON public.results USING btree (meet_name, date);


--
-- Name: idx_results_round; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_results_round ON public.results USING btree (round);


--
-- Name: idx_results_team_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_results_team_date ON public.results USING btree (team_id, date DESC);


--
-- Name: idx_results_team_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_results_team_id ON public.results USING btree (team_id);


--
-- Name: idx_schools_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_schools_active ON public.schools USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_schools_conference; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_schools_conference ON public.schools USING btree (current_conference_id);


--
-- Name: idx_schools_division; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_schools_division ON public.schools USING btree (division);


--
-- Name: idx_schools_division_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_schools_division_id ON public.schools USING btree (division_id);


--
-- Name: idx_schools_region; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_schools_region ON public.schools USING btree (region_id);


--
-- Name: idx_schools_state; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_schools_state ON public.schools USING btree (state);


--
-- Name: idx_teams_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_teams_active ON public.teams USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_teams_gender; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_teams_gender ON public.teams USING btree (gender);


--
-- Name: idx_teams_school; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_teams_school ON public.teams USING btree (school_id);


--
-- Name: relay_no_dup_normmark; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX relay_no_dup_normmark ON public.relay_results USING btree (meet_id, event_type_id, team_id, place, lower(regexp_replace(mark_raw, '[ah]$'::text, ''::text)), round) NULLS NOT DISTINCT WHERE ((mark_raw ~ '[0-9]'::text) AND (team_id IS NOT NULL) AND (meet_id IS NOT NULL));


--
-- Name: relay_results_no_exact_duplicate; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX relay_results_no_exact_duplicate ON public.relay_results USING btree (meet_id, event_type_id, team_id, place, mark_raw, round) NULLS NOT DISTINCT WHERE ((mark_raw ~ '[0-9]'::text) AND (team_id IS NOT NULL) AND (meet_id IS NOT NULL));


--
-- Name: results_no_dup_normmark; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX results_no_dup_normmark ON public.results USING btree (athlete_id, meet_id, event_type_id, lower(regexp_replace(mark_raw, '[ah]$'::text, ''::text)), place, round) NULLS NOT DISTINCT WHERE (meet_id IS NOT NULL);


--
-- Name: results_no_exact_duplicate; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX results_no_exact_duplicate ON public.results USING btree (athlete_id, meet_id, event_type_id, mark_raw, place, round) NULLS NOT DISTINCT WHERE (meet_id IS NOT NULL);


--
-- Name: recovery_queue ingest_recovery_queue_clear_error_on_complete; Type: TRIGGER; Schema: ingest; Owner: postgres
--

CREATE TRIGGER ingest_recovery_queue_clear_error_on_complete BEFORE INSERT OR UPDATE ON ingest.recovery_queue FOR EACH ROW EXECUTE FUNCTION ingest.clear_recovery_queue_error_on_complete();


--
-- Name: athletes update_athletes_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_athletes_updated_at BEFORE UPDATE ON public.athletes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: conferences update_conferences_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_conferences_updated_at BEFORE UPDATE ON public.conferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: external_ids update_external_ids_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_external_ids_updated_at BEFORE UPDATE ON public.external_ids FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: meets update_meets_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_meets_updated_at BEFORE UPDATE ON public.meets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: schools update_schools_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: teams update_teams_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: athlete_aliases athlete_aliases_target_athlete_id_fkey; Type: FK CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.athlete_aliases
    ADD CONSTRAINT athlete_aliases_target_athlete_id_fkey FOREIGN KEY (target_athlete_id) REFERENCES public.athletes(athlete_id) ON DELETE RESTRICT;


--
-- Name: event_recovery_queue event_recovery_queue_event_type_id_fkey; Type: FK CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.event_recovery_queue
    ADD CONSTRAINT event_recovery_queue_event_type_id_fkey FOREIGN KEY (event_type_id) REFERENCES public.event_types(event_type_id) ON DELETE RESTRICT;


--
-- Name: event_recovery_queue event_recovery_queue_last_run_id_fkey; Type: FK CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.event_recovery_queue
    ADD CONSTRAINT event_recovery_queue_last_run_id_fkey FOREIGN KEY (last_run_id) REFERENCES ingest.runs(run_id) ON DELETE SET NULL;


--
-- Name: event_recovery_queue event_recovery_queue_meet_id_fkey; Type: FK CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.event_recovery_queue
    ADD CONSTRAINT event_recovery_queue_meet_id_fkey FOREIGN KEY (meet_id) REFERENCES public.meets(meet_id) ON DELETE RESTRICT;


--
-- Name: observations observations_canonical_relay_id_fkey; Type: FK CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.observations
    ADD CONSTRAINT observations_canonical_relay_id_fkey FOREIGN KEY (canonical_relay_id) REFERENCES public.relay_results(relay_result_id) ON DELETE RESTRICT;


--
-- Name: observations observations_canonical_result_id_fkey; Type: FK CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.observations
    ADD CONSTRAINT observations_canonical_result_id_fkey FOREIGN KEY (canonical_result_id) REFERENCES public.results(result_id) ON DELETE RESTRICT;


--
-- Name: observations observations_event_type_id_fkey; Type: FK CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.observations
    ADD CONSTRAINT observations_event_type_id_fkey FOREIGN KEY (event_type_id) REFERENCES public.event_types(event_type_id) ON DELETE RESTRICT;


--
-- Name: observations observations_run_id_fkey; Type: FK CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.observations
    ADD CONSTRAINT observations_run_id_fkey FOREIGN KEY (run_id) REFERENCES ingest.runs(run_id) ON DELETE RESTRICT;


--
-- Name: observations observations_source_record_id_fkey; Type: FK CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.observations
    ADD CONSTRAINT observations_source_record_id_fkey FOREIGN KEY (source_record_id) REFERENCES ingest.source_records(source_record_id) ON DELETE RESTRICT;


--
-- Name: observations observations_target_athlete_id_fkey; Type: FK CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.observations
    ADD CONSTRAINT observations_target_athlete_id_fkey FOREIGN KEY (target_athlete_id) REFERENCES public.athletes(athlete_id) ON DELETE RESTRICT;


--
-- Name: observations observations_target_meet_id_fkey; Type: FK CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.observations
    ADD CONSTRAINT observations_target_meet_id_fkey FOREIGN KEY (target_meet_id) REFERENCES public.meets(meet_id) ON DELETE RESTRICT;


--
-- Name: observations observations_target_team_id_fkey; Type: FK CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.observations
    ADD CONSTRAINT observations_target_team_id_fkey FOREIGN KEY (target_team_id) REFERENCES public.teams(team_id) ON DELETE RESTRICT;


--
-- Name: quarantine quarantine_observation_id_fkey; Type: FK CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.quarantine
    ADD CONSTRAINT quarantine_observation_id_fkey FOREIGN KEY (observation_id) REFERENCES ingest.observations(observation_id) ON DELETE RESTRICT;


--
-- Name: recovery_queue recovery_queue_canonical_meet_id_fkey; Type: FK CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.recovery_queue
    ADD CONSTRAINT recovery_queue_canonical_meet_id_fkey FOREIGN KEY (canonical_meet_id) REFERENCES public.meets(meet_id) ON DELETE RESTRICT;


--
-- Name: recovery_queue recovery_queue_last_run_id_fkey; Type: FK CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.recovery_queue
    ADD CONSTRAINT recovery_queue_last_run_id_fkey FOREIGN KEY (last_run_id) REFERENCES ingest.runs(run_id) ON DELETE SET NULL;


--
-- Name: recovery_queue recovery_queue_meet_id_fkey; Type: FK CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.recovery_queue
    ADD CONSTRAINT recovery_queue_meet_id_fkey FOREIGN KEY (meet_id) REFERENCES public.meets(meet_id) ON DELETE RESTRICT;


--
-- Name: recovery_queue recovery_queue_relay_probe_run_id_fkey; Type: FK CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.recovery_queue
    ADD CONSTRAINT recovery_queue_relay_probe_run_id_fkey FOREIGN KEY (relay_probe_run_id) REFERENCES ingest.runs(run_id) ON DELETE SET NULL;


--
-- Name: source_links source_links_relay_result_id_fkey; Type: FK CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.source_links
    ADD CONSTRAINT source_links_relay_result_id_fkey FOREIGN KEY (relay_result_id) REFERENCES public.relay_results(relay_result_id) ON DELETE RESTRICT;


--
-- Name: source_links source_links_result_id_fkey; Type: FK CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.source_links
    ADD CONSTRAINT source_links_result_id_fkey FOREIGN KEY (result_id) REFERENCES public.results(result_id) ON DELETE RESTRICT;


--
-- Name: source_links source_links_source_record_id_fkey; Type: FK CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.source_links
    ADD CONSTRAINT source_links_source_record_id_fkey FOREIGN KEY (source_record_id) REFERENCES ingest.source_records(source_record_id) ON DELETE RESTRICT;


--
-- Name: team_aliases team_aliases_team_id_fkey; Type: FK CONSTRAINT; Schema: ingest; Owner: postgres
--

ALTER TABLE ONLY ingest.team_aliases
    ADD CONSTRAINT team_aliases_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(team_id) ON DELETE RESTRICT;


--
-- Name: athlete_prs athlete_prs_athlete_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.athlete_prs
    ADD CONSTRAINT athlete_prs_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES public.athletes(athlete_id);


--
-- Name: athlete_team_seasons athlete_team_seasons_athlete_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.athlete_team_seasons
    ADD CONSTRAINT athlete_team_seasons_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES public.athletes(athlete_id) ON DELETE CASCADE;


--
-- Name: athlete_team_seasons athlete_team_seasons_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.athlete_team_seasons
    ADD CONSTRAINT athlete_team_seasons_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(team_id) ON DELETE CASCADE;


--
-- Name: athletes athletes_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.athletes
    ADD CONSTRAINT athletes_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(school_id) ON DELETE CASCADE;


--
-- Name: conference_memberships conference_memberships_conference_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conference_memberships
    ADD CONSTRAINT conference_memberships_conference_id_fkey FOREIGN KEY (conference_id) REFERENCES public.conferences(conference_id) ON DELETE CASCADE;


--
-- Name: conference_memberships conference_memberships_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conference_memberships
    ADD CONSTRAINT conference_memberships_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(school_id) ON DELETE CASCADE;


--
-- Name: conferences conferences_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conferences
    ADD CONSTRAINT conferences_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(division_id);


--
-- Name: event_aliases event_aliases_event_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_aliases
    ADD CONSTRAINT event_aliases_event_type_id_fkey FOREIGN KEY (event_type_id) REFERENCES public.event_types(event_type_id);


--
-- Name: external_ids external_ids_athlete_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_ids
    ADD CONSTRAINT external_ids_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES public.athletes(athlete_id) ON DELETE CASCADE;


--
-- Name: external_ids external_ids_conference_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_ids
    ADD CONSTRAINT external_ids_conference_id_fkey FOREIGN KEY (conference_id) REFERENCES public.conferences(conference_id) ON DELETE CASCADE;


--
-- Name: external_ids external_ids_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_ids
    ADD CONSTRAINT external_ids_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(school_id) ON DELETE CASCADE;


--
-- Name: external_ids external_ids_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_ids
    ADD CONSTRAINT external_ids_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(team_id) ON DELETE CASCADE;


--
-- Name: live_results live_results_athlete_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.live_results
    ADD CONSTRAINT live_results_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES public.athletes(athlete_id) ON DELETE SET NULL;


--
-- Name: live_results live_results_meet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.live_results
    ADD CONSTRAINT live_results_meet_id_fkey FOREIGN KEY (meet_id) REFERENCES public.meets(meet_id) ON DELETE SET NULL;


--
-- Name: live_results live_results_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.live_results
    ADD CONSTRAINT live_results_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(team_id) ON DELETE SET NULL;


--
-- Name: regions regions_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(division_id);


--
-- Name: relay_athletes relay_athletes_athlete_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relay_athletes
    ADD CONSTRAINT relay_athletes_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES public.athletes(athlete_id);


--
-- Name: relay_athletes relay_athletes_relay_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relay_athletes
    ADD CONSTRAINT relay_athletes_relay_result_id_fkey FOREIGN KEY (relay_result_id) REFERENCES public.relay_results(relay_result_id) ON DELETE CASCADE;


--
-- Name: relay_results relay_results_event_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relay_results
    ADD CONSTRAINT relay_results_event_type_id_fkey FOREIGN KEY (event_type_id) REFERENCES public.event_types(event_type_id);


--
-- Name: relay_results relay_results_meet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relay_results
    ADD CONSTRAINT relay_results_meet_id_fkey FOREIGN KEY (meet_id) REFERENCES public.meets(meet_id);


--
-- Name: relay_results relay_results_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relay_results
    ADD CONSTRAINT relay_results_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(team_id);


--
-- Name: results results_athlete_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.results
    ADD CONSTRAINT results_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES public.athletes(athlete_id) ON DELETE CASCADE;


--
-- Name: results results_event_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.results
    ADD CONSTRAINT results_event_type_id_fkey FOREIGN KEY (event_type_id) REFERENCES public.event_types(event_type_id);


--
-- Name: results results_meet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.results
    ADD CONSTRAINT results_meet_id_fkey FOREIGN KEY (meet_id) REFERENCES public.meets(meet_id);


--
-- Name: results results_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.results
    ADD CONSTRAINT results_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(team_id) ON DELETE SET NULL;


--
-- Name: schools schools_current_conference_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_current_conference_id_fkey FOREIGN KEY (current_conference_id) REFERENCES public.conferences(conference_id);


--
-- Name: schools schools_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(division_id);


--
-- Name: schools schools_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.regions(region_id);


--
-- Name: teams teams_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(school_id) ON DELETE CASCADE;


--
-- Name: athlete_aliases; Type: ROW SECURITY; Schema: ingest; Owner: postgres
--

ALTER TABLE ingest.athlete_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: event_recovery_queue; Type: ROW SECURITY; Schema: ingest; Owner: postgres
--

ALTER TABLE ingest.event_recovery_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: fact_cleanup_archive; Type: ROW SECURITY; Schema: ingest; Owner: postgres
--

ALTER TABLE ingest.fact_cleanup_archive ENABLE ROW LEVEL SECURITY;

--
-- Name: observations; Type: ROW SECURITY; Schema: ingest; Owner: postgres
--

ALTER TABLE ingest.observations ENABLE ROW LEVEL SECURITY;

--
-- Name: quarantine; Type: ROW SECURITY; Schema: ingest; Owner: postgres
--

ALTER TABLE ingest.quarantine ENABLE ROW LEVEL SECURITY;

--
-- Name: recovery_queue; Type: ROW SECURITY; Schema: ingest; Owner: postgres
--

ALTER TABLE ingest.recovery_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: runs; Type: ROW SECURITY; Schema: ingest; Owner: postgres
--

ALTER TABLE ingest.runs ENABLE ROW LEVEL SECURITY;

--
-- Name: source_links; Type: ROW SECURITY; Schema: ingest; Owner: postgres
--

ALTER TABLE ingest.source_links ENABLE ROW LEVEL SECURITY;

--
-- Name: source_records; Type: ROW SECURITY; Schema: ingest; Owner: postgres
--

ALTER TABLE ingest.source_records ENABLE ROW LEVEL SECURITY;

--
-- Name: team_aliases; Type: ROW SECURITY; Schema: ingest; Owner: postgres
--

ALTER TABLE ingest.team_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: athlete_prs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.athlete_prs ENABLE ROW LEVEL SECURITY;

--
-- Name: athlete_prs athlete_prs_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY athlete_prs_public_read ON public.athlete_prs FOR SELECT TO authenticated, anon USING (true);


--
-- Name: athlete_prs athlete_prs_service_write; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY athlete_prs_service_write ON public.athlete_prs TO service_role USING (true) WITH CHECK (true);


--
-- Name: athlete_team_seasons; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.athlete_team_seasons ENABLE ROW LEVEL SECURITY;

--
-- Name: athlete_team_seasons athlete_team_seasons_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY athlete_team_seasons_public_read ON public.athlete_team_seasons FOR SELECT TO authenticated, anon USING (true);


--
-- Name: athletes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.athletes ENABLE ROW LEVEL SECURITY;

--
-- Name: athletes athletes_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY athletes_public_read ON public.athletes FOR SELECT TO authenticated, anon USING (true);


--
-- Name: conference_memberships; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.conference_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: conference_memberships conference_memberships_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY conference_memberships_public_read ON public.conference_memberships FOR SELECT TO authenticated, anon USING (true);


--
-- Name: conferences; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.conferences ENABLE ROW LEVEL SECURITY;

--
-- Name: conferences conferences_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY conferences_public_read ON public.conferences FOR SELECT TO authenticated, anon USING (true);


--
-- Name: divisions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;

--
-- Name: divisions divisions_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY divisions_public_read ON public.divisions FOR SELECT TO authenticated, anon USING (true);


--
-- Name: event_aliases; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.event_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: event_aliases event_aliases_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY event_aliases_public_read ON public.event_aliases FOR SELECT TO authenticated, anon USING (true);


--
-- Name: event_types; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.event_types ENABLE ROW LEVEL SECURITY;

--
-- Name: event_types event_types_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY event_types_public_read ON public.event_types FOR SELECT TO authenticated, anon USING (true);


--
-- Name: external_ids; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.external_ids ENABLE ROW LEVEL SECURITY;

--
-- Name: external_ids external_ids_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY external_ids_public_read ON public.external_ids FOR SELECT TO authenticated, anon USING (true);


--
-- Name: live_results; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.live_results ENABLE ROW LEVEL SECURITY;

--
-- Name: live_results live_results_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY live_results_public_read ON public.live_results FOR SELECT TO authenticated, anon USING (true);


--
-- Name: meets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.meets ENABLE ROW LEVEL SECURITY;

--
-- Name: meets meets_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY meets_public_read ON public.meets FOR SELECT TO authenticated, anon USING (true);


--
-- Name: push_tokens; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: push_tokens push_tokens_service_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY push_tokens_service_read ON public.push_tokens FOR SELECT TO service_role USING (true);


--
-- Name: push_tokens push_tokens_service_write; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY push_tokens_service_write ON public.push_tokens TO service_role USING (true) WITH CHECK (true);


--
-- Name: regions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

--
-- Name: regions regions_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY regions_public_read ON public.regions FOR SELECT TO authenticated, anon USING (true);


--
-- Name: relay_athletes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.relay_athletes ENABLE ROW LEVEL SECURITY;

--
-- Name: relay_athletes relay_athletes_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY relay_athletes_public_read ON public.relay_athletes FOR SELECT TO authenticated, anon USING (true);


--
-- Name: relay_results; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.relay_results ENABLE ROW LEVEL SECURITY;

--
-- Name: relay_results relay_results_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY relay_results_public_read ON public.relay_results FOR SELECT TO authenticated, anon USING (true);


--
-- Name: results; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

--
-- Name: results results_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY results_public_read ON public.results FOR SELECT TO authenticated, anon USING (true);


--
-- Name: schools; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

--
-- Name: schools schools_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY schools_public_read ON public.schools FOR SELECT TO authenticated, anon USING (true);


--
-- Name: teams; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

--
-- Name: teams teams_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY teams_public_read ON public.teams FOR SELECT TO authenticated, anon USING (true);


--
-- Name: unmapped_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.unmapped_events ENABLE ROW LEVEL SECURITY;

--
-- Name: unmapped_events unmapped_events_service_write; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY unmapped_events_service_write ON public.unmapped_events TO service_role USING (true) WITH CHECK (true);


--
-- Name: waitlist; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

--
-- Name: waitlist waitlist_public_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY waitlist_public_insert ON public.waitlist FOR INSERT TO authenticated, anon WITH CHECK (((email IS NOT NULL) AND ((length(TRIM(BOTH FROM email)) >= 3) AND (length(TRIM(BOTH FROM email)) <= 320)) AND (POSITION(('@'::text) IN (TRIM(BOTH FROM email))) > 1) AND (feature IS NOT NULL) AND ((length(TRIM(BOTH FROM feature)) >= 1) AND (length(TRIM(BOTH FROM feature)) <= 100))));


--
-- Name: TABLE event_recovery_queue; Type: ACL; Schema: ingest; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ingest.event_recovery_queue TO service_role;


--
-- Name: FUNCTION claim_4x100_recovery_job(p_scope_key text, p_lease_minutes integer, p_retry_failed boolean); Type: ACL; Schema: ingest; Owner: postgres
--

REVOKE ALL ON FUNCTION ingest.claim_4x100_recovery_job(p_scope_key text, p_lease_minutes integer, p_retry_failed boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION ingest.claim_4x100_recovery_job(p_scope_key text, p_lease_minutes integer, p_retry_failed boolean) TO service_role;


--
-- Name: FUNCTION claim_4x100_recovery_job(p_scope_key text, p_lease_minutes integer, p_retry_failed boolean, p_source text, p_meet_id integer); Type: ACL; Schema: ingest; Owner: postgres
--

REVOKE ALL ON FUNCTION ingest.claim_4x100_recovery_job(p_scope_key text, p_lease_minutes integer, p_retry_failed boolean, p_source text, p_meet_id integer) FROM PUBLIC;
GRANT ALL ON FUNCTION ingest.claim_4x100_recovery_job(p_scope_key text, p_lease_minutes integer, p_retry_failed boolean, p_source text, p_meet_id integer) TO service_role;


--
-- Name: FUNCTION claim_4x100_recovery_job(p_scope_key text, p_lease_minutes integer, p_retry_failed boolean, p_source text, p_meet_id integer, p_max_attempts integer); Type: ACL; Schema: ingest; Owner: postgres
--

REVOKE ALL ON FUNCTION ingest.claim_4x100_recovery_job(p_scope_key text, p_lease_minutes integer, p_retry_failed boolean, p_source text, p_meet_id integer, p_max_attempts integer) FROM PUBLIC;
GRANT ALL ON FUNCTION ingest.claim_4x100_recovery_job(p_scope_key text, p_lease_minutes integer, p_retry_failed boolean, p_source text, p_meet_id integer, p_max_attempts integer) TO service_role;


--
-- Name: FUNCTION clear_recovery_queue_error_on_complete(); Type: ACL; Schema: ingest; Owner: postgres
--

REVOKE ALL ON FUNCTION ingest.clear_recovery_queue_error_on_complete() FROM PUBLIC;
GRANT ALL ON FUNCTION ingest.clear_recovery_queue_error_on_complete() TO service_role;


--
-- Name: FUNCTION finish_4x100_recovery_job(p_job_id bigint, p_lease_token uuid, p_status text, p_run_id uuid, p_source text, p_source_status text, p_parent_count integer, p_numeric_parent_count integer, p_leg_count integer, p_error text, p_retry_after_minutes integer); Type: ACL; Schema: ingest; Owner: postgres
--

REVOKE ALL ON FUNCTION ingest.finish_4x100_recovery_job(p_job_id bigint, p_lease_token uuid, p_status text, p_run_id uuid, p_source text, p_source_status text, p_parent_count integer, p_numeric_parent_count integer, p_leg_count integer, p_error text, p_retry_after_minutes integer) FROM PUBLIC;
GRANT ALL ON FUNCTION ingest.finish_4x100_recovery_job(p_job_id bigint, p_lease_token uuid, p_status text, p_run_id uuid, p_source text, p_source_status text, p_parent_count integer, p_numeric_parent_count integer, p_leg_count integer, p_error text, p_retry_after_minutes integer) TO service_role;


--
-- Name: FUNCTION reconcile_recovery_queue_relay_probe(p_run_id uuid); Type: ACL; Schema: ingest; Owner: postgres
--

REVOKE ALL ON FUNCTION ingest.reconcile_recovery_queue_relay_probe(p_run_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION ingest.reconcile_recovery_queue_relay_probe(p_run_id uuid) TO service_role;


--
-- Name: FUNCTION record_4x100_recovery_run(p_job_id bigint, p_lease_token uuid, p_run_id uuid, p_source text, p_source_status text, p_parent_count integer, p_numeric_parent_count integer, p_leg_count integer, p_error text); Type: ACL; Schema: ingest; Owner: postgres
--

REVOKE ALL ON FUNCTION ingest.record_4x100_recovery_run(p_job_id bigint, p_lease_token uuid, p_run_id uuid, p_source text, p_source_status text, p_parent_count integer, p_numeric_parent_count integer, p_leg_count integer, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION ingest.record_4x100_recovery_run(p_job_id bigint, p_lease_token uuid, p_run_id uuid, p_source text, p_source_status text, p_parent_count integer, p_numeric_parent_count integer, p_leg_count integer, p_error text) TO service_role;


--
-- Name: FUNCTION refresh_4x100_recovery_queue(p_scope_key text, p_start_date date, p_end_date date); Type: ACL; Schema: ingest; Owner: postgres
--

REVOKE ALL ON FUNCTION ingest.refresh_4x100_recovery_queue(p_scope_key text, p_start_date date, p_end_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION ingest.refresh_4x100_recovery_queue(p_scope_key text, p_start_date date, p_end_date date) TO service_role;


--
-- Name: FUNCTION refresh_4x100_recovery_queue(p_scope_key text, p_start_date date, p_end_date date, p_season text); Type: ACL; Schema: ingest; Owner: postgres
--

REVOKE ALL ON FUNCTION ingest.refresh_4x100_recovery_queue(p_scope_key text, p_start_date date, p_end_date date, p_season text) FROM PUBLIC;
GRANT ALL ON FUNCTION ingest.refresh_4x100_recovery_queue(p_scope_key text, p_start_date date, p_end_date date, p_season text) TO service_role;


--
-- Name: FUNCTION refresh_4x100_recovery_queue_base(p_scope_key text, p_start_date date, p_end_date date, p_season text); Type: ACL; Schema: ingest; Owner: postgres
--

REVOKE ALL ON FUNCTION ingest.refresh_4x100_recovery_queue_base(p_scope_key text, p_start_date date, p_end_date date, p_season text) FROM PUBLIC;
GRANT ALL ON FUNCTION ingest.refresh_4x100_recovery_queue_base(p_scope_key text, p_start_date date, p_end_date date, p_season text) TO service_role;


--
-- Name: FUNCTION refresh_4x100_recovery_queue_host_routing_base(p_scope_key text, p_start_date date, p_end_date date, p_season text); Type: ACL; Schema: ingest; Owner: postgres
--

REVOKE ALL ON FUNCTION ingest.refresh_4x100_recovery_queue_host_routing_base(p_scope_key text, p_start_date date, p_end_date date, p_season text) FROM PUBLIC;
GRANT ALL ON FUNCTION ingest.refresh_4x100_recovery_queue_host_routing_base(p_scope_key text, p_start_date date, p_end_date date, p_season text) TO service_role;


--
-- Name: FUNCTION refresh_recovery_queue(p_scope_key text, p_start_date date, p_end_date date); Type: ACL; Schema: ingest; Owner: postgres
--

REVOKE ALL ON FUNCTION ingest.refresh_recovery_queue(p_scope_key text, p_start_date date, p_end_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION ingest.refresh_recovery_queue(p_scope_key text, p_start_date date, p_end_date date) TO service_role;


--
-- Name: FUNCTION detect_timing_platform(url text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.detect_timing_platform(url text) TO anon;
GRANT ALL ON FUNCTION public.detect_timing_platform(url text) TO authenticated;
GRANT ALL ON FUNCTION public.detect_timing_platform(url text) TO service_role;


--
-- Name: FUNCTION get_top_performances(p_start_date date, p_end_date date, p_division text, p_gender character, p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_top_performances(p_start_date date, p_end_date date, p_division text, p_gender character, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_top_performances(p_start_date date, p_end_date date, p_division text, p_gender character, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_top_performances(p_start_date date, p_end_date date, p_division text, p_gender character, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_weekly_performances(p_start_date date, p_end_date date, p_division text, p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_weekly_performances(p_start_date date, p_end_date date, p_division text, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_weekly_performances(p_start_date date, p_end_date date, p_division text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_weekly_performances(p_start_date date, p_end_date date, p_division text, p_limit integer) TO service_role;


--
-- Name: FUNCTION register_push_token(p_expo_push_token text, p_platform text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.register_push_token(p_expo_push_token text, p_platform text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.register_push_token(p_expo_push_token text, p_platform text) TO anon;
GRANT ALL ON FUNCTION public.register_push_token(p_expo_push_token text, p_platform text) TO authenticated;
GRANT ALL ON FUNCTION public.register_push_token(p_expo_push_token text, p_platform text) TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: TABLE athletes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.athletes TO service_role;
GRANT SELECT ON TABLE public.athletes TO anon;
GRANT SELECT ON TABLE public.athletes TO authenticated;


--
-- Name: SEQUENCE athletes_athlete_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.athletes_athlete_id_seq TO service_role;


--
-- Name: TABLE relay_athletes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.relay_athletes TO service_role;
GRANT SELECT ON TABLE public.relay_athletes TO anon;
GRANT SELECT ON TABLE public.relay_athletes TO authenticated;


--
-- Name: SEQUENCE relay_athletes_relay_athlete_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.relay_athletes_relay_athlete_id_seq TO service_role;


--
-- Name: TABLE relay_results; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.relay_results TO service_role;
GRANT SELECT ON TABLE public.relay_results TO anon;
GRANT SELECT ON TABLE public.relay_results TO authenticated;


--
-- Name: SEQUENCE relay_results_relay_result_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.relay_results_relay_result_id_seq TO service_role;


--
-- Name: TABLE results; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.results TO service_role;
GRANT SELECT ON TABLE public.results TO anon;
GRANT SELECT ON TABLE public.results TO authenticated;


--
-- Name: SEQUENCE results_result_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.results_result_id_seq TO service_role;


--
-- Name: TABLE athlete_aliases; Type: ACL; Schema: ingest; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ingest.athlete_aliases TO service_role;


--
-- Name: SEQUENCE athlete_aliases_athlete_alias_id_seq; Type: ACL; Schema: ingest; Owner: postgres
--

GRANT SELECT,USAGE ON SEQUENCE ingest.athlete_aliases_athlete_alias_id_seq TO service_role;


--
-- Name: SEQUENCE event_recovery_queue_job_id_seq; Type: ACL; Schema: ingest; Owner: postgres
--

GRANT SELECT,USAGE ON SEQUENCE ingest.event_recovery_queue_job_id_seq TO service_role;


--
-- Name: TABLE fact_cleanup_archive; Type: ACL; Schema: ingest; Owner: postgres
--

GRANT SELECT,INSERT ON TABLE ingest.fact_cleanup_archive TO service_role;


--
-- Name: SEQUENCE fact_cleanup_archive_archive_id_seq; Type: ACL; Schema: ingest; Owner: postgres
--

GRANT SELECT,USAGE ON SEQUENCE ingest.fact_cleanup_archive_archive_id_seq TO service_role;


--
-- Name: TABLE observations; Type: ACL; Schema: ingest; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ingest.observations TO service_role;


--
-- Name: SEQUENCE observations_observation_id_seq; Type: ACL; Schema: ingest; Owner: postgres
--

GRANT SELECT,USAGE ON SEQUENCE ingest.observations_observation_id_seq TO service_role;


--
-- Name: TABLE quarantine; Type: ACL; Schema: ingest; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ingest.quarantine TO service_role;


--
-- Name: SEQUENCE quarantine_quarantine_id_seq; Type: ACL; Schema: ingest; Owner: postgres
--

GRANT SELECT,USAGE ON SEQUENCE ingest.quarantine_quarantine_id_seq TO service_role;


--
-- Name: TABLE recovery_queue; Type: ACL; Schema: ingest; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ingest.recovery_queue TO service_role;


--
-- Name: SEQUENCE recovery_queue_queue_id_seq; Type: ACL; Schema: ingest; Owner: postgres
--

GRANT SELECT,USAGE ON SEQUENCE ingest.recovery_queue_queue_id_seq TO service_role;


--
-- Name: TABLE runs; Type: ACL; Schema: ingest; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ingest.runs TO service_role;


--
-- Name: TABLE source_links; Type: ACL; Schema: ingest; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ingest.source_links TO service_role;


--
-- Name: TABLE source_records; Type: ACL; Schema: ingest; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ingest.source_records TO service_role;


--
-- Name: SEQUENCE source_records_source_record_id_seq; Type: ACL; Schema: ingest; Owner: postgres
--

GRANT SELECT,USAGE ON SEQUENCE ingest.source_records_source_record_id_seq TO service_role;


--
-- Name: TABLE team_aliases; Type: ACL; Schema: ingest; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ingest.team_aliases TO service_role;


--
-- Name: SEQUENCE team_aliases_team_alias_id_seq; Type: ACL; Schema: ingest; Owner: postgres
--

GRANT SELECT,USAGE ON SEQUENCE ingest.team_aliases_team_alias_id_seq TO service_role;


--
-- Name: TABLE athlete_prs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.athlete_prs TO service_role;
GRANT SELECT ON TABLE public.athlete_prs TO anon;
GRANT SELECT ON TABLE public.athlete_prs TO authenticated;


--
-- Name: SEQUENCE athlete_prs_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.athlete_prs_id_seq TO service_role;


--
-- Name: TABLE athlete_team_seasons; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.athlete_team_seasons TO service_role;
GRANT SELECT ON TABLE public.athlete_team_seasons TO anon;
GRANT SELECT ON TABLE public.athlete_team_seasons TO authenticated;


--
-- Name: SEQUENCE athlete_team_seasons_ats_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.athlete_team_seasons_ats_id_seq TO service_role;


--
-- Name: TABLE conference_memberships; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.conference_memberships TO service_role;
GRANT SELECT ON TABLE public.conference_memberships TO anon;
GRANT SELECT ON TABLE public.conference_memberships TO authenticated;


--
-- Name: SEQUENCE conference_memberships_membership_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.conference_memberships_membership_id_seq TO service_role;


--
-- Name: TABLE conferences; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.conferences TO service_role;
GRANT SELECT ON TABLE public.conferences TO anon;
GRANT SELECT ON TABLE public.conferences TO authenticated;


--
-- Name: SEQUENCE conferences_conference_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.conferences_conference_id_seq TO service_role;


--
-- Name: TABLE divisions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.divisions TO service_role;
GRANT SELECT ON TABLE public.divisions TO anon;
GRANT SELECT ON TABLE public.divisions TO authenticated;


--
-- Name: SEQUENCE divisions_division_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.divisions_division_id_seq TO service_role;


--
-- Name: TABLE event_aliases; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.event_aliases TO service_role;
GRANT SELECT ON TABLE public.event_aliases TO anon;
GRANT SELECT ON TABLE public.event_aliases TO authenticated;


--
-- Name: TABLE event_types; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.event_types TO service_role;
GRANT SELECT ON TABLE public.event_types TO anon;
GRANT SELECT ON TABLE public.event_types TO authenticated;


--
-- Name: SEQUENCE event_types_event_type_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.event_types_event_type_id_seq TO service_role;


--
-- Name: TABLE external_ids; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.external_ids TO service_role;
GRANT SELECT ON TABLE public.external_ids TO anon;
GRANT SELECT ON TABLE public.external_ids TO authenticated;


--
-- Name: SEQUENCE external_ids_external_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.external_ids_external_id_seq TO service_role;


--
-- Name: TABLE live_results; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.live_results TO service_role;
GRANT SELECT ON TABLE public.live_results TO anon;
GRANT SELECT ON TABLE public.live_results TO authenticated;


--
-- Name: SEQUENCE live_results_live_result_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.live_results_live_result_id_seq TO service_role;


--
-- Name: TABLE meets; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.meets TO service_role;
GRANT SELECT ON TABLE public.meets TO anon;
GRANT SELECT ON TABLE public.meets TO authenticated;


--
-- Name: SEQUENCE meets_meet_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.meets_meet_id_seq TO service_role;


--
-- Name: TABLE push_tokens; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.push_tokens TO service_role;


--
-- Name: TABLE regions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.regions TO service_role;
GRANT SELECT ON TABLE public.regions TO anon;
GRANT SELECT ON TABLE public.regions TO authenticated;


--
-- Name: SEQUENCE regions_region_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.regions_region_id_seq TO service_role;


--
-- Name: TABLE schools; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.schools TO service_role;
GRANT SELECT ON TABLE public.schools TO anon;
GRANT SELECT ON TABLE public.schools TO authenticated;


--
-- Name: TABLE schools_full; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.schools_full TO service_role;


--
-- Name: SEQUENCE schools_school_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.schools_school_id_seq TO service_role;


--
-- Name: TABLE teams; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.teams TO service_role;
GRANT SELECT ON TABLE public.teams TO anon;
GRANT SELECT ON TABLE public.teams TO authenticated;


--
-- Name: TABLE teams_summary; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.teams_summary TO service_role;


--
-- Name: SEQUENCE teams_team_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.teams_team_id_seq TO service_role;


--
-- Name: TABLE unmapped_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.unmapped_events TO service_role;


--
-- Name: TABLE unprocessed_live_results; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.unprocessed_live_results TO service_role;


--
-- Name: TABLE v_athlete_prs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.v_athlete_prs TO service_role;
GRANT SELECT ON TABLE public.v_athlete_prs TO anon;
GRANT SELECT ON TABLE public.v_athlete_prs TO authenticated;


--
-- Name: TABLE waitlist; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.waitlist TO service_role;
GRANT INSERT ON TABLE public.waitlist TO anon;
GRANT INSERT ON TABLE public.waitlist TO authenticated;


--
-- Name: SEQUENCE waitlist_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.waitlist_id_seq TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict TIHJDIEzhaHiz17Kk6SgZd9hHRuzpS0GHvhDhDhKDoaoBVhplBs4PupcGJrB6r1
