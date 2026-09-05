-- Recompute the recovery queue's quarantine count from currently open records.
-- A resolved quarantine must not leave a meet permanently marked partial after a queue refresh.

CREATE OR REPLACE FUNCTION ingest.refresh_recovery_queue(
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
             WHEN m.tfrrs_url ~* '(tfrrs\\.org|tfrrs)' THEN m.tfrrs_url
             WHEN m.tfrrs_url IS NULL AND m.meet_url ~* '(tfrrs\\.org|tfrrs)' THEN m.meet_url
           END AS tfrrs_url,
           CASE
             WHEN m.athletic_net_results_url ~* '(athletic\\.net|anet\\.live)' THEN m.athletic_net_results_url
             WHEN m.athletic_net_results_url IS NULL AND m.meet_url ~* '(athletic\\.net|anet\\.live)' THEN m.meet_url
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

REVOKE ALL ON FUNCTION ingest.refresh_recovery_queue(text, date, date) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION ingest.refresh_recovery_queue(text, date, date) TO service_role;
  END IF;
END
$$;
