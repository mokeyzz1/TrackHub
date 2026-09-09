-- Dedicated private state for the TFRRS Outdoor 2026 4x100 reconciliation worker.
--
-- This is intentionally separate from ingest.event_recovery_queue. That older queue answers
-- "does this meet have a numeric 4x100 row?" and therefore cannot detect partially imported,
-- wrong, or orphan-team rows. These tables store source-vs-database reconciliation state and a
-- reviewable repair plan. Neither table directly authorizes a public fact write.

CREATE TABLE IF NOT EXISTS ingest.relay_4x100_reconciliation_jobs (
  job_id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope_key                    text NOT NULL,
  meet_id                      integer NOT NULL REFERENCES public.meets(meet_id) ON DELETE RESTRICT,
  event_type_id                integer NOT NULL REFERENCES public.event_types(event_type_id) ON DELETE RESTRICT,
  source                       text NOT NULL DEFAULT 'tfrrs' CHECK (source = 'tfrrs'),
  source_url                   text,
  source_meet_key              text,
  relationship_kind           text NOT NULL DEFAULT 'canonical'
                              CHECK (relationship_kind IN (
                                'canonical', 'combined_child_candidate', 'combined_child',
                                'multi_only', 'preliminary', 'duplicate', 'unknown'
                              )),
  canonical_meet_id            integer REFERENCES public.meets(meet_id) ON DELETE RESTRICT,
  source_event_status          text NOT NULL DEFAULT 'unknown'
                              CHECK (source_event_status IN (
                                'unknown', 'present', 'not_contested', 'unavailable'
                              )),
  status                       text NOT NULL DEFAULT 'queued'
                              CHECK (status IN (
                                'queued', 'in_progress', 'matched', 'repair_ready', 'needs_review',
                                'not_contested', 'child', 'blocked', 'failed'
                              )),
  priority                     integer NOT NULL DEFAULT 100 CHECK (priority >= 0),
  source_event_count           integer NOT NULL DEFAULT 0 CHECK (source_event_count >= 0),
  source_result_count          integer NOT NULL DEFAULT 0 CHECK (source_result_count >= 0),
  local_result_count           integer NOT NULL DEFAULT 0 CHECK (local_result_count >= 0),
  matched_result_count         integer NOT NULL DEFAULT 0 CHECK (matched_result_count >= 0),
  missing_result_count         integer NOT NULL DEFAULT 0 CHECK (missing_result_count >= 0),
  extra_result_count           integer NOT NULL DEFAULT 0 CHECK (extra_result_count >= 0),
  invalid_team_result_count    integer NOT NULL DEFAULT 0 CHECK (invalid_team_result_count >= 0),
  unresolved_source_team_count integer NOT NULL DEFAULT 0 CHECK (unresolved_source_team_count >= 0),
  diff                         jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts                     integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at              timestamptz NOT NULL DEFAULT now(),
  lease_token                  uuid,
  leased_until                 timestamptz,
  last_run_id                  uuid REFERENCES ingest.runs(run_id) ON DELETE SET NULL,
  last_error                   text,
  verified_at                  timestamptz,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_key, meet_id, event_type_id),
  CHECK (canonical_meet_id IS NULL OR canonical_meet_id <> meet_id),
  CHECK (
    relationship_kind NOT IN ('combined_child', 'duplicate')
    OR canonical_meet_id IS NOT NULL
  )
);

COMMENT ON TABLE ingest.relay_4x100_reconciliation_jobs IS
  'Private TFRRS source-vs-database reconciliation jobs for 4x100 results; never writes public facts directly.';

COMMENT ON COLUMN ingest.relay_4x100_reconciliation_jobs.diff IS
  'Compact source-vs-local comparison: matches, missing source facts, extra local facts, and identity failures.';

CREATE INDEX IF NOT EXISTS relay_4x100_reconciliation_claim_idx
  ON ingest.relay_4x100_reconciliation_jobs
    (scope_key, status, next_attempt_at, priority, meet_id)
  WHERE status IN ('queued', 'failed');

CREATE INDEX IF NOT EXISTS relay_4x100_reconciliation_lease_idx
  ON ingest.relay_4x100_reconciliation_jobs (scope_key, leased_until)
  WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS relay_4x100_reconciliation_outcome_idx
  ON ingest.relay_4x100_reconciliation_jobs (scope_key, source_event_status, status);

-- PostgreSQL does not index foreign keys automatically. Keep lifecycle checks, joins, and
-- restricted deletes bounded even after the audit history grows across seasons.
CREATE INDEX IF NOT EXISTS relay_4x100_reconciliation_meet_fk_idx
  ON ingest.relay_4x100_reconciliation_jobs (meet_id);

CREATE INDEX IF NOT EXISTS relay_4x100_reconciliation_event_fk_idx
  ON ingest.relay_4x100_reconciliation_jobs (event_type_id);

CREATE INDEX IF NOT EXISTS relay_4x100_reconciliation_canonical_meet_fk_idx
  ON ingest.relay_4x100_reconciliation_jobs (canonical_meet_id)
  WHERE canonical_meet_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS relay_4x100_reconciliation_run_fk_idx
  ON ingest.relay_4x100_reconciliation_jobs (last_run_id)
  WHERE last_run_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ingest.relay_4x100_reconciliation_actions (
  action_id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id                       bigint NOT NULL
                               REFERENCES ingest.relay_4x100_reconciliation_jobs(job_id)
                               ON DELETE RESTRICT,
  action_type                  text NOT NULL CHECK (action_type IN (
                                 'insert_missing', 'relink_team', 'supersede_local', 'manual_review'
                               )),
  source_record_key            text,
  local_relay_result_id        integer REFERENCES public.relay_results(relay_result_id) ON DELETE RESTRICT,
  source_payload               jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason                       text NOT NULL,
  confidence                   numeric(5, 4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  status                       text NOT NULL DEFAULT 'planned'
                               CHECK (status IN ('planned', 'approved', 'applied', 'rejected')),
  applied_run_id               uuid REFERENCES ingest.runs(run_id) ON DELETE SET NULL,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  reviewed_at                  timestamptz,
  applied_at                   timestamptz
);

COMMENT ON TABLE ingest.relay_4x100_reconciliation_actions IS
  'Reviewable repair plan. A separate guarded promotion step is required before any public result changes.';

CREATE UNIQUE INDEX IF NOT EXISTS relay_4x100_reconciliation_action_identity_idx
  ON ingest.relay_4x100_reconciliation_actions (
    job_id,
    action_type,
    COALESCE(source_record_key, ''),
    COALESCE(local_relay_result_id, 0)
  );

CREATE INDEX IF NOT EXISTS relay_4x100_reconciliation_action_review_idx
  ON ingest.relay_4x100_reconciliation_actions (status, job_id);

CREATE INDEX IF NOT EXISTS relay_4x100_reconciliation_action_local_relay_fk_idx
  ON ingest.relay_4x100_reconciliation_actions (local_relay_result_id)
  WHERE local_relay_result_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS relay_4x100_reconciliation_action_run_fk_idx
  ON ingest.relay_4x100_reconciliation_actions (applied_run_id)
  WHERE applied_run_id IS NOT NULL;

ALTER TABLE ingest.relay_4x100_reconciliation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest.relay_4x100_reconciliation_actions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ingest.relay_4x100_reconciliation_jobs FROM PUBLIC;
REVOKE ALL ON ingest.relay_4x100_reconciliation_actions FROM PUBLIC;
REVOKE ALL ON SEQUENCE ingest.relay_4x100_reconciliation_jobs_job_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE ingest.relay_4x100_reconciliation_actions_action_id_seq FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ingest.relay_4x100_reconciliation_jobs TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ingest.relay_4x100_reconciliation_actions TO service_role;
    GRANT USAGE, SELECT ON SEQUENCE ingest.relay_4x100_reconciliation_jobs_job_id_seq TO service_role;
    GRANT USAGE, SELECT ON SEQUENCE ingest.relay_4x100_reconciliation_actions_action_id_seq TO service_role;
  END IF;
END
$$;
