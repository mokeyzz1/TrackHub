-- Keep a season-scoped 4x100 recovery run from claiming a meet outside its
-- declared season. The legacy three-argument function remains available for
-- callers that intentionally refresh all seasons; the worker passes the new
-- season argument whenever it runs a seasonal scope.

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
             WHEN m.athletic_net_results_url ~* '(athletic\\.net|athletic\\.live|anet\\.live|mastiming\\.net)' THEN m.athletic_net_results_url
             WHEN m.meet_url ~* '(athletic\\.net|athletic\\.live|anet\\.live|mastiming\\.net)' THEN m.meet_url
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
        END,
        updated_at = now();

  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  -- A prior unscoped refresh may have populated this same scope with a meet
  -- from another season. Do not let the seasonal worker claim it. Completed
  -- jobs are preserved for audit; they are never silently rewritten here.
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
