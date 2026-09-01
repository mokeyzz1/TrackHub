-- A source URL discovered after a no-source block is a new recovery route. Give that route a
-- fresh attempt budget while preserving the old queue attempts in private metadata. This prevents
-- a job that never scraped the newly discovered URL from being exhausted before it starts.

ALTER FUNCTION ingest.refresh_4x100_recovery_queue(text, date, date, text)
  RENAME TO refresh_4x100_recovery_queue_host_routing_base;

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
       'meet_url_route', jsonb_build_object(
         'status', 'routed',
         'routed_at', now(),
         'previous_attempts', q.attempts
       ),
       'tfrrs_url', CASE WHEN u.provider = 'tfrrs' THEN u.meet_url END,
       'athletic_net_results_url', CASE WHEN u.provider = 'athletic_net' THEN u.meet_url END
     )),
         status = CASE WHEN q.status = 'blocked' THEN 'queued' ELSE q.status END,
         attempts = CASE WHEN q.status = 'blocked' THEN 0 ELSE q.attempts END,
         last_error = CASE WHEN q.status = 'blocked' THEN NULL ELSE q.last_error END,
         next_attempt_at = CASE WHEN q.status = 'blocked' THEN now() ELSE q.next_attempt_at END,
         updated_at = now()
    FROM supported_urls u
   WHERE q.job_id = u.job_id;

  GET DIAGNOSTICS routed_rows = ROW_COUNT;

  -- Repair rows queued by the earlier routing migration and immediately rejected by the old
  -- attempt guard. They have no staged run and therefore no public fact risk.
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

REVOKE ALL ON FUNCTION ingest.refresh_4x100_recovery_queue_host_routing_base(text, date, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ingest.refresh_4x100_recovery_queue(text, date, date, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION ingest.refresh_4x100_recovery_queue(text, date, date, text) TO service_role;
  END IF;
END
$$;
