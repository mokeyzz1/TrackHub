-- Consolidate the dedicated Outdoor 2026 4x100 audit into the existing event queue.
-- The existing queue already owns meet/event job identity, leasing, retries, and scopes.
-- Reconciliation output is kept under source_candidates->reconciliation so this migration
-- does not create another lifecycle table or touch public result facts.

WITH action_rows AS (
  SELECT a.job_id,
         jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'action_id', a.action_id,
             'action_type', a.action_type,
             'source_record_key', a.source_record_key,
             'local_relay_result_id', a.local_relay_result_id,
             'source_payload', a.source_payload,
             'reason', a.reason,
             'confidence', a.confidence,
             'status', a.status,
             'reviewed_at', a.reviewed_at,
             'applied_at', a.applied_at
           )) ORDER BY a.action_id
         ) AS actions
    FROM ingest.relay_4x100_reconciliation_actions a
   GROUP BY a.job_id
),
source_jobs AS (
  SELECT j.*,
         COALESCE(ar.actions, '[]'::jsonb) AS actions,
         CASE j.status
           WHEN 'matched' THEN 'complete'
           WHEN 'not_contested' THEN 'complete'
           WHEN 'blocked' THEN 'blocked'
           WHEN 'failed' THEN 'exhausted'
           ELSE 'needs_review'
         END AS queue_status
    FROM ingest.relay_4x100_reconciliation_jobs j
    LEFT JOIN action_rows ar ON ar.job_id = j.job_id
   WHERE j.scope_key = 'outdoor-2026-4x100-source-reconciliation-v1'
)
INSERT INTO ingest.event_recovery_queue AS q
  (scope_key, meet_id, event_type_id, event_code, status, priority,
   source_candidates, attempts, next_attempt_at, last_source, last_source_status,
   last_error, updated_at)
SELECT s.scope_key,
       s.meet_id,
       s.event_type_id,
       '4x100m',
       s.queue_status,
       s.priority,
       jsonb_strip_nulls(jsonb_build_object(
         'tfrrs_url', s.source_url,
         'reconciliation', jsonb_build_object(
           'scope_key', s.scope_key,
           'status', s.status,
           'queue_status', s.queue_status,
           'source', s.source,
           'source_url', s.source_url,
           'source_meet_key', s.source_meet_key,
           'relationship_kind', s.relationship_kind,
           'canonical_meet_id', s.canonical_meet_id,
           'source_event_status', s.source_event_status,
           'source_event_count', s.source_event_count,
           'source_result_count', s.source_result_count,
           'local_result_count', s.local_result_count,
           'matched_result_count', s.matched_result_count,
           'missing_result_count', s.missing_result_count,
           'extra_result_count', s.extra_result_count,
           'invalid_team_result_count', s.invalid_team_result_count,
           'unresolved_source_team_count', s.unresolved_source_team_count,
           'diff', s.diff,
           'actions', s.actions,
           'verified_at', s.verified_at
         )
       )),
       s.attempts,
       s.next_attempt_at,
       'tfrrs',
       s.source_event_status,
       s.last_error,
       s.updated_at
  FROM source_jobs s
ON CONFLICT (scope_key, meet_id, event_type_id) DO UPDATE
  SET status = EXCLUDED.status,
      priority = EXCLUDED.priority,
      source_candidates = EXCLUDED.source_candidates,
      attempts = EXCLUDED.attempts,
      next_attempt_at = EXCLUDED.next_attempt_at,
      last_source = EXCLUDED.last_source,
      last_source_status = EXCLUDED.last_source_status,
      last_error = EXCLUDED.last_error,
      updated_at = EXCLUDED.updated_at;

DO $$
DECLARE
  expected_count integer;
  actual_count integer;
BEGIN
  SELECT count(*) INTO expected_count
    FROM ingest.relay_4x100_reconciliation_jobs
   WHERE scope_key = 'outdoor-2026-4x100-source-reconciliation-v1';
  SELECT count(*) INTO actual_count
    FROM ingest.event_recovery_queue
   WHERE scope_key = 'outdoor-2026-4x100-source-reconciliation-v1';
  IF expected_count <> actual_count THEN
    RAISE EXCEPTION 'reconciliation consolidation count mismatch: expected %, got %', expected_count, actual_count;
  END IF;
END
$$;

COMMENT ON COLUMN ingest.event_recovery_queue.source_candidates IS
  'Verified source URLs and adapter evidence. Reconciliation workflows may store their source-vs-local report under the reconciliation key.';

DROP TABLE ingest.relay_4x100_reconciliation_actions;
DROP TABLE ingest.relay_4x100_reconciliation_jobs;
