-- The previous route migration preserved meet_url metadata, but its regular-expression source
-- expressions were not reliable for every PostgreSQL string/regex mode. Keep that migration's
-- refresh as a private base, then repair candidates with explicit host parsing. This also makes
-- the behavior auditable: a meet_url is promoted to an importer candidate only for a known
-- TFRRS or supported Athletic-family host.

ALTER FUNCTION ingest.refresh_4x100_recovery_queue(text, date, date, text)
  RENAME TO refresh_4x100_recovery_queue_base;

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

REVOKE ALL ON FUNCTION ingest.refresh_4x100_recovery_queue_base(text, date, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ingest.refresh_4x100_recovery_queue(text, date, date, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION ingest.refresh_4x100_recovery_queue(text, date, date, text) TO service_role;
  END IF;
END
$$;
