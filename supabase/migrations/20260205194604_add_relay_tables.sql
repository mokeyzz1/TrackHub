-- Relay results table (team-level result)
CREATE TABLE IF NOT EXISTS relay_results (
  relay_result_id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(team_id),
  event_name TEXT NOT NULL,
  mark_raw TEXT,
  mark_seconds NUMERIC(10,2),
  place INTEGER,
  meet_name TEXT,
  meet_id INTEGER,
  event_id INTEGER,
  date DATE,
  round TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Relay athletes junction table (links athletes to relay results)
CREATE TABLE IF NOT EXISTS relay_athletes (
  relay_athlete_id SERIAL PRIMARY KEY,
  relay_result_id INTEGER REFERENCES relay_results(relay_result_id) ON DELETE CASCADE,
  athlete_id INTEGER REFERENCES athletes(athlete_id),
  tfrrs_athlete_id TEXT,  -- Store even if athlete not in our DB
  athlete_name TEXT,      -- Store name for display
  leg_order INTEGER,      -- 1, 2, 3, 4 for position in relay
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_relay_results_team_id ON relay_results(team_id);
CREATE INDEX IF NOT EXISTS idx_relay_results_meet_id ON relay_results(meet_id);
CREATE INDEX IF NOT EXISTS idx_relay_results_date ON relay_results(date);
CREATE INDEX IF NOT EXISTS idx_relay_athletes_relay_result_id ON relay_athletes(relay_result_id);
CREATE INDEX IF NOT EXISTS idx_relay_athletes_athlete_id ON relay_athletes(athlete_id);
