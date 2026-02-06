-- Add tfrrs_meet_id column to meets table for linking with TFRRS results
ALTER TABLE meets ADD COLUMN IF NOT EXISTS tfrrs_meet_id TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_meets_tfrrs_id ON meets(tfrrs_meet_id) WHERE tfrrs_meet_id IS NOT NULL;
