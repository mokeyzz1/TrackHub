-- A source listing can be a verified alternate shell for a canonical public meet.
-- Keep the queue's discovered/source meet id for audit, but send observations to the explicit
-- canonical destination so a second source cannot create a duplicate public meet's results.

ALTER TABLE ingest.recovery_queue
  ADD COLUMN IF NOT EXISTS canonical_meet_id integer
  REFERENCES public.meets(meet_id) ON DELETE RESTRICT;

ALTER TABLE ingest.recovery_queue
  ADD COLUMN IF NOT EXISTS canonical_match_method text,
  ADD COLUMN IF NOT EXISTS canonical_match_notes text,
  ADD COLUMN IF NOT EXISTS canonical_match_evidence jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'ingest.recovery_queue'::regclass
      AND conname = 'recovery_queue_canonical_meet_not_self'
  ) THEN
    ALTER TABLE ingest.recovery_queue
      ADD CONSTRAINT recovery_queue_canonical_meet_not_self
      CHECK (canonical_meet_id IS NULL OR canonical_meet_id <> meet_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS ingest_recovery_queue_canonical_meet_idx
  ON ingest.recovery_queue (canonical_meet_id)
  WHERE canonical_meet_id IS NOT NULL;

COMMENT ON COLUMN ingest.recovery_queue.canonical_meet_id IS
  'Verified public meet destination for an alternate source shell; NULL means the queue meet_id is canonical.';

COMMENT ON COLUMN ingest.recovery_queue.canonical_match_method IS
  'Review method used to establish that this queue shell maps to canonical_meet_id.';

COMMENT ON COLUMN ingest.recovery_queue.canonical_match_notes IS
  'Human-readable evidence summary for the canonical meet identity decision.';

COMMENT ON COLUMN ingest.recovery_queue.canonical_match_evidence IS
  'JSON array of source URLs or review evidence supporting the canonical meet identity decision.';
