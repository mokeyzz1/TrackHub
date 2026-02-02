-- Create athlete_prs table
CREATE TABLE IF NOT EXISTS athlete_prs (
  id SERIAL PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES athletes(athlete_id),
  event_name VARCHAR(100) NOT NULL,
  mark_raw VARCHAR(50) NOT NULL,
  mark_seconds DECIMAL(10, 3),
  mark_meters DECIMAL(10, 3),
  set_at DATE,
  meet_name VARCHAR(255),
  season VARCHAR(20) DEFAULT 'all',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One PR per athlete per event per season
  UNIQUE(athlete_id, event_name, season)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_athlete_prs_athlete_id ON athlete_prs(athlete_id);
CREATE INDEX IF NOT EXISTS idx_athlete_prs_event_name ON athlete_prs(event_name);

-- Enable RLS
ALTER TABLE athlete_prs ENABLE ROW LEVEL SECURITY;

-- Allow read access
CREATE POLICY "Allow public read access" ON athlete_prs
  FOR SELECT USING (true);

-- Allow service role full access
CREATE POLICY "Allow service role full access" ON athlete_prs
  FOR ALL USING (true);
