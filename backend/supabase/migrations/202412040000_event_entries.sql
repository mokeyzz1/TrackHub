-- Event Entries table (heat sheets, lane assignments, seed times)
CREATE TABLE IF NOT EXISTS event_entries (
  entry_id BIGSERIAL PRIMARY KEY,
  event_id BIGINT REFERENCES events(event_id) ON DELETE CASCADE,
  athlete_name TEXT NOT NULL,
  team_name TEXT,
  heat_number INTEGER,
  lane_number INTEGER,
  seed_time TEXT,
  seed_mark TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_event_entries_event_id ON event_entries(event_id);
CREATE INDEX IF NOT EXISTS idx_event_entries_heat ON event_entries(heat_number);
