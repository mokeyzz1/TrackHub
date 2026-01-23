-- Live Meet Results Table
-- For storing real-time results from live meets before they're fully processed
-- This table allows null athlete_id since we might not have athlete records yet

CREATE TABLE live_results (
    live_result_id BIGSERIAL PRIMARY KEY,
    meet_url TEXT NOT NULL,
    meet_name TEXT,
    event_name TEXT NOT NULL,
    participant_name TEXT NOT NULL, -- Team or athlete name from live page
    place INTEGER,
    mark_raw TEXT NOT NULL,
    mark_seconds DOUBLE PRECISION,
    splits TEXT[], -- Array of split times
    scraped_at TIMESTAMP WITH TIME ZONE NOT NULL,
    date DATE,
    round TEXT DEFAULT 'LIVE',
    is_processed BOOLEAN DEFAULT FALSE, -- Flag for when we've matched to real athletes
    athlete_id BIGINT REFERENCES athletes(athlete_id) ON DELETE SET NULL, -- Optional
    team_id BIGINT REFERENCES teams(team_id) ON DELETE SET NULL, -- Optional
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for live_results
CREATE INDEX idx_live_results_meet_url ON live_results(meet_url);
CREATE INDEX idx_live_results_event ON live_results(event_name);
CREATE INDEX idx_live_results_date ON live_results(date);
CREATE INDEX idx_live_results_scraped_at ON live_results(scraped_at DESC);
CREATE INDEX idx_live_results_processed ON live_results(is_processed) WHERE is_processed = FALSE;

-- View for unprocessed live results
CREATE VIEW unprocessed_live_results AS
SELECT * FROM live_results
WHERE is_processed = FALSE
ORDER BY scraped_at DESC;
