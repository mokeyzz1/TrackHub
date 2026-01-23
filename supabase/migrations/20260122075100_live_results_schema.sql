-- Live Results Scraper - Schema Updates

-- 1. UPDATE MEETS TABLE
ALTER TABLE meets ADD COLUMN IF NOT EXISTS timing_platform TEXT;
ALTER TABLE meets ADD COLUMN IF NOT EXISTS source_url TEXT;
CREATE INDEX IF NOT EXISTS idx_meets_timing_platform ON meets(timing_platform);

-- 2. CREATE MEET_ENTRIES TABLE
CREATE TABLE IF NOT EXISTS meet_entries (
    entry_id BIGSERIAL PRIMARY KEY,
    meet_id BIGINT REFERENCES meets(meet_id) ON DELETE CASCADE,
    event_name TEXT NOT NULL,
    athlete_name TEXT NOT NULL,
    team_name TEXT,
    seed_time TEXT,
    seed_mark TEXT,
    athlete_id BIGINT REFERENCES athletes(athlete_id) ON DELETE SET NULL,
    team_id BIGINT REFERENCES teams(team_id) ON DELETE SET NULL,
    match_confidence DECIMAL(3,2),
    heat INTEGER,
    lane INTEGER,
    scraped_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(meet_id, event_name, athlete_name)
);
CREATE INDEX IF NOT EXISTS idx_meet_entries_meet_id ON meet_entries(meet_id);
CREATE INDEX IF NOT EXISTS idx_meet_entries_athlete_id ON meet_entries(athlete_id);
CREATE INDEX IF NOT EXISTS idx_meet_entries_event ON meet_entries(event_name);

-- 3. UPDATE LIVE_RESULTS TABLE
ALTER TABLE live_results ADD COLUMN IF NOT EXISTS meet_id BIGINT REFERENCES meets(meet_id) ON DELETE SET NULL;
ALTER TABLE live_results ADD COLUMN IF NOT EXISTS entry_id BIGINT REFERENCES meet_entries(entry_id) ON DELETE SET NULL;
ALTER TABLE live_results ADD COLUMN IF NOT EXISTS result_type TEXT DEFAULT 'live';
CREATE INDEX IF NOT EXISTS idx_live_results_meet_id ON live_results(meet_id);
CREATE INDEX IF NOT EXISTS idx_live_results_entry_id ON live_results(entry_id);
CREATE INDEX IF NOT EXISTS idx_live_results_type ON live_results(result_type);

-- 4. HELPER FUNCTION: Detect timing platform from URL
CREATE OR REPLACE FUNCTION detect_timing_platform(url TEXT)
RETURNS TEXT AS $$
BEGIN
    IF url IS NULL THEN RETURN NULL;
    ELSIF url LIKE '%athletic.net%' OR url LIKE '%jdlfasttrack%' OR url LIKE '%blacksquirrel%' THEN RETURN 'athletic_net';
    ELSIF url LIKE '%milesplit%' THEN RETURN 'milesplit';
    ELSIF url LIKE '%pttiming%' THEN RETURN 'pt_timing';
    ELSIF url LIKE '%finishtiming%' OR url LIKE '%finishlynx%' THEN RETURN 'finish_timing';
    ELSIF url LIKE '%tfrrs%' THEN RETURN 'tfrrs';
    ELSE RETURN 'other';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 5. UPDATE EXISTING MEETS WITH TIMING PLATFORM
UPDATE meets SET timing_platform = detect_timing_platform(meet_url) WHERE timing_platform IS NULL AND meet_url IS NOT NULL;
