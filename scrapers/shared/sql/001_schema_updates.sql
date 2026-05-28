-- Live Results Scraper - Schema Updates
-- Run these in Supabase SQL Editor

-- ============================================
-- 1. UPDATE MEETS TABLE
-- ============================================

-- Add timing_platform to identify which scraper to use
ALTER TABLE meets ADD COLUMN IF NOT EXISTS timing_platform TEXT;
-- Values: 'athletic_net', 'milesplit', 'pt_timing', 'finish_timing', 'other'

-- Add source_url for the original USTFCCCA page (separate from timing URL)
ALTER TABLE meets ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Index for finding meets by platform
CREATE INDEX IF NOT EXISTS idx_meets_timing_platform ON meets(timing_platform);

-- ============================================
-- 2. CREATE MEET_ENTRIES TABLE
-- ============================================
-- Stores athlete entries BEFORE the meet starts
-- This is where we do athlete matching (name -> athlete_id)

CREATE TABLE IF NOT EXISTS meet_entries (
    entry_id BIGSERIAL PRIMARY KEY,
    meet_id BIGINT REFERENCES meets(meet_id) ON DELETE CASCADE,
    event_name TEXT NOT NULL,

    -- Raw scraped data
    athlete_name TEXT NOT NULL,
    team_name TEXT,
    seed_time TEXT,
    seed_mark TEXT,

    -- Matched data (filled by athlete matcher)
    athlete_id BIGINT REFERENCES athletes(athlete_id) ON DELETE SET NULL,
    team_id BIGINT REFERENCES teams(team_id) ON DELETE SET NULL,
    match_confidence DECIMAL(3,2), -- 0.00 to 1.00

    -- Heat/lane info if available
    heat INTEGER,
    lane INTEGER,

    -- Timestamps
    scraped_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Prevent duplicate entries
    UNIQUE(meet_id, event_name, athlete_name)
);

-- Indexes for meet_entries
CREATE INDEX IF NOT EXISTS idx_meet_entries_meet_id ON meet_entries(meet_id);
CREATE INDEX IF NOT EXISTS idx_meet_entries_athlete_id ON meet_entries(athlete_id);
CREATE INDEX IF NOT EXISTS idx_meet_entries_event ON meet_entries(event_name);

-- ============================================
-- 3. UPDATE LIVE_RESULTS TABLE
-- ============================================

-- Add meet_id foreign key (currently links via meet_url string)
ALTER TABLE live_results ADD COLUMN IF NOT EXISTS meet_id BIGINT REFERENCES meets(meet_id) ON DELETE SET NULL;

-- Add entry_id to link back to entries (for athlete matching)
ALTER TABLE live_results ADD COLUMN IF NOT EXISTS entry_id BIGINT REFERENCES meet_entries(entry_id) ON DELETE SET NULL;

-- Add result_type to distinguish entries/live/final
ALTER TABLE live_results ADD COLUMN IF NOT EXISTS result_type TEXT DEFAULT 'live';
-- Values: 'live', 'final'

-- Index for meet_id lookups
CREATE INDEX IF NOT EXISTS idx_live_results_meet_id ON live_results(meet_id);
CREATE INDEX IF NOT EXISTS idx_live_results_entry_id ON live_results(entry_id);
CREATE INDEX IF NOT EXISTS idx_live_results_type ON live_results(result_type);

-- ============================================
-- 4. HELPER FUNCTION: Detect timing platform from URL
-- ============================================

CREATE OR REPLACE FUNCTION detect_timing_platform(url TEXT)
RETURNS TEXT AS $$
BEGIN
    IF url IS NULL THEN
        RETURN NULL;
    ELSIF url LIKE '%athletic.net%' OR url LIKE '%jdlfasttrack%' OR url LIKE '%blacksquirrel%' THEN
        RETURN 'athletic_net';
    ELSIF url LIKE '%milesplit%' THEN
        RETURN 'milesplit';
    ELSIF url LIKE '%pttiming%' THEN
        RETURN 'pt_timing';
    ELSIF url LIKE '%finishtiming%' OR url LIKE '%finishlynx%' THEN
        RETURN 'finish_timing';
    ELSIF url LIKE '%tfrrs%' THEN
        RETURN 'tfrrs';
    ELSIF url LIKE '%flashresults%' THEN
        RETURN 'flashresults';
    ELSIF url LIKE '%rosterathletics%' THEN
        RETURN 'rosterathletics';
    ELSIF url LIKE '%xpresstiming%' THEN
        RETURN 'xpresstiming';
    ELSIF url LIKE '%halfmiletiming%' THEN
        RETURN 'halfmiletiming';
    ELSIF url LIKE '%windsortiming%' THEN
        RETURN 'windsortiming';
    ELSIF url LIKE '%leonetiming%' THEN
        RETURN 'leonetiming';
    ELSIF url LIKE '%wayzatatiming%' THEN
        RETURN 'wayzatatiming';
    ELSIF url LIKE '%deltatiming%' THEN
        RETURN 'deltatiming';
    ELSIF url LIKE '%lexicontiming%' THEN
        RETURN 'lexicontiming';
    ELSIF url LIKE '%herostiming%' THEN
        RETURN 'herostiming';
    ELSIF url LIKE '%omegatiming%' THEN
        RETURN 'omegatiming';
    ELSIF url LIKE '%domtel-sport%' THEN
        RETURN 'domtel';
    ELSIF url LIKE '%liveres.%' THEN
        RETURN 'live_results';
    ELSIF url LIKE '%timing%' THEN
        RETURN 'other_timing';
    ELSE
        RETURN 'other';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. UPDATE EXISTING MEETS WITH TIMING PLATFORM
-- ============================================

UPDATE meets
SET timing_platform = detect_timing_platform(meet_url)
WHERE timing_platform IS NULL AND meet_url IS NOT NULL;

-- ============================================
-- SUMMARY
-- ============================================
--
-- meets table:
--   + timing_platform (athletic_net, milesplit, etc.)
--   + source_url (original USTFCCCA link)
--
-- meet_entries table (NEW):
--   - entry_id, meet_id, event_name
--   - athlete_name, team_name, seed_time
--   - athlete_id (matched), team_id (matched)
--   - heat, lane
--
-- live_results table:
--   + meet_id (foreign key)
--   + entry_id (link to matched entry)
--   + result_type (live/final)
--
