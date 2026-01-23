-- Add status field to meets table
ALTER TABLE meets ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'upcoming';

-- Add team_name and is_final to live_results table
ALTER TABLE live_results ADD COLUMN IF NOT EXISTS team_name TEXT;
ALTER TABLE live_results ADD COLUMN IF NOT EXISTS is_final BOOLEAN DEFAULT FALSE;

-- Create index on meet status for faster queries
CREATE INDEX IF NOT EXISTS idx_meets_status ON meets(status);
CREATE INDEX IF NOT EXISTS idx_live_results_final ON live_results(is_final);
