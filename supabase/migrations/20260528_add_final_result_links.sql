ALTER TABLE meets ADD COLUMN IF NOT EXISTS tfrrs_url TEXT;
ALTER TABLE meets ADD COLUMN IF NOT EXISTS athletic_net_results_url TEXT;
ALTER TABLE meets ADD COLUMN IF NOT EXISTS wa_results_url TEXT;
ALTER TABLE meets ADD COLUMN IF NOT EXISTS results_status TEXT DEFAULT 'pending';
ALTER TABLE meets ADD COLUMN IF NOT EXISTS results_last_checked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE meets ADD COLUMN IF NOT EXISTS results_imported_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE meets ADD COLUMN IF NOT EXISTS results_error TEXT;

CREATE INDEX IF NOT EXISTS idx_meets_tfrrs_url ON meets(tfrrs_url) WHERE tfrrs_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meets_results_status ON meets(results_status);
