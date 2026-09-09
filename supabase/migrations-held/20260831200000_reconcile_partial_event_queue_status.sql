-- Keep event-recovery bookkeeping honest after a partial promotion.
-- This changes queue status only; public result facts are not modified.
WITH open_quarantine AS (
  SELECT
    o.target_meet_id AS meet_id,
    count(*)::int AS quarantine_count
  FROM ingest.quarantine q
  JOIN ingest.observations o
    ON o.observation_id = q.observation_id
  WHERE q.status = 'open'
  GROUP BY o.target_meet_id
)
UPDATE ingest.event_recovery_queue AS eq
SET
  status = 'needs_review',
  last_error = 'source_observations_quarantined=' || open_quarantine.quarantine_count::text,
  updated_at = now()
FROM open_quarantine
WHERE eq.scope_key = 'outdoor-2026-4x100'
  AND eq.event_code = '4x100m'
  AND eq.status = 'complete'
  AND eq.last_run_id IS NOT NULL
  AND eq.meet_id = open_quarantine.meet_id;
