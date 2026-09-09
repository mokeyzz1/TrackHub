-- Resumable recovery inventory.
-- This table describes work; it does not authorize a fact write. Source observations still have to
-- pass through ingest.observations and canonical_fact_writer.js.

CREATE TABLE IF NOT EXISTS ingest.recovery_queue (
  queue_id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope_key             text NOT NULL,
  meet_id               integer NOT NULL REFERENCES public.meets(meet_id) ON DELETE RESTRICT,
  coverage_status       text NOT NULL CHECK (coverage_status IN ('empty', 'relay_only', 'individual_only', 'covered')),
  needs_individual      boolean NOT NULL,
  needs_relays          boolean NOT NULL,
  individual_fact_count bigint NOT NULL DEFAULT 0,
  relay_fact_count      bigint NOT NULL DEFAULT 0,
  source_candidates     jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority              integer NOT NULL DEFAULT 100 CHECK (priority >= 0),
  status                text NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued', 'in_progress', 'complete', 'partial', 'blocked', 'exhausted')),
  attempts              integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_run_id           uuid REFERENCES ingest.runs(run_id) ON DELETE SET NULL,
  last_error            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_key, meet_id)
);

COMMENT ON TABLE ingest.recovery_queue IS
  'Private, resumable inventory of meet-level recovery work. It never directly writes public facts.';

CREATE INDEX IF NOT EXISTS ingest_recovery_queue_status_idx
  ON ingest.recovery_queue (scope_key, status, priority, meet_id);

CREATE INDEX IF NOT EXISTS ingest_recovery_queue_meet_idx
  ON ingest.recovery_queue (meet_id, scope_key);

ALTER TABLE ingest.recovery_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ingest.recovery_queue FROM PUBLIC;
REVOKE ALL ON SEQUENCE ingest.recovery_queue_queue_id_seq FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ingest.recovery_queue TO service_role;
    GRANT USAGE, SELECT ON SEQUENCE ingest.recovery_queue_queue_id_seq TO service_role;
  END IF;
END
$$;

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

  WITH target_meets AS (
    SELECT m.meet_id,
           m.tfrrs_url,
           m.athletic_net_results_url,
           m.wa_results_url,
           m.meet_url,
           COALESCE(i.individual_fact_count, 0)::bigint AS individual_fact_count,
           COALESCE(r.relay_fact_count, 0)::bigint AS relay_fact_count
    FROM public.meets m
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
           (t.relay_fact_count = 0) AS next_needs_relays,
           jsonb_build_object(
             'tfrrs_url', t.tfrrs_url,
             'athletic_net_results_url', t.athletic_net_results_url,
             'wa_results_url', t.wa_results_url,
             'meet_url', t.meet_url
           ) AS next_source_candidates
    FROM target_meets t
  )
  INSERT INTO ingest.recovery_queue AS q
    (scope_key, meet_id, coverage_status, needs_individual, needs_relays,
     individual_fact_count, relay_fact_count, source_candidates, priority, status, updated_at)
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
           WHEN s.next_coverage_status = 'covered' THEN 'complete'
           WHEN (s.tfrrs_url IS NULL AND s.athletic_net_results_url IS NULL AND s.wa_results_url IS NULL AND s.meet_url IS NULL)
             THEN 'blocked'
           ELSE 'queued'
         END,
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
        status = CASE
          WHEN EXCLUDED.coverage_status = 'covered' THEN 'complete'
          WHEN q.status = 'blocked'
               AND (EXCLUDED.source_candidates->>'tfrrs_url' IS NOT NULL
                    OR EXCLUDED.source_candidates->>'athletic_net_results_url' IS NOT NULL
                    OR EXCLUDED.source_candidates->>'wa_results_url' IS NOT NULL
                    OR EXCLUDED.source_candidates->>'meet_url' IS NOT NULL) THEN 'queued'
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
