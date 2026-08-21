-- Relay coverage is not inferable from public relay row count alone. A multi-event meet can
-- legitimately publish no relay events, while a full meet with a broken relay parser can also
-- have zero relay rows. Keep source coverage evidence separate from fact coverage.

ALTER TABLE ingest.recovery_queue
  ADD COLUMN IF NOT EXISTS relay_coverage_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS relay_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS relay_probe_run_id uuid REFERENCES ingest.runs(run_id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'ingest.recovery_queue'::regclass
      AND conname = 'recovery_queue_relay_coverage_status_check'
  ) THEN
    ALTER TABLE ingest.recovery_queue
      ADD CONSTRAINT recovery_queue_relay_coverage_status_check
      CHECK (relay_coverage_status IN ('unknown', 'present', 'absent'));
  END IF;
END
$$;

UPDATE ingest.recovery_queue
   SET relay_coverage_status = 'present'
 WHERE relay_fact_count > 0
   AND relay_coverage_status = 'unknown';

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
           COALESCE(q.relay_coverage_status, 'unknown') AS relay_coverage_status
    FROM public.meets m
    LEFT JOIN ingest.recovery_queue q
      ON q.scope_key = p_scope_key AND q.meet_id = m.meet_id
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
     relay_coverage_status, updated_at)
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
           WHEN NOT s.next_needs_individual AND NOT s.next_needs_relays THEN 'complete'
           WHEN NOT s.has_supported_source THEN 'blocked'
           ELSE 'queued'
         END,
         s.relay_coverage_status,
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
        status = CASE
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

-- A successful relay-only dry run can prove the source has relay coverage or prove that it has
-- individual data but no relay events. The latter is a valid complete state for multis and
-- similar meets, not a missing-data error.
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
         last_error = CASE WHEN relay_observations = 0 THEN NULL ELSE q.last_error END,
         status = CASE
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
