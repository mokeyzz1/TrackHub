-- Create meets and events tables for live tracking

-- Meets table to store information about track meets
CREATE TABLE meets (
  meet_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  location TEXT,
  meet_url TEXT,  -- URL for live results if available
  status TEXT CHECK (status IN ('upcoming', 'live', 'completed')) DEFAULT 'upcoming',
  level TEXT,  -- high_school, middle_school, college, etc.
  season TEXT,  -- indoor, outdoor, cross_country
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Events table to store specific events within a meet
CREATE TABLE events (
  event_id SERIAL PRIMARY KEY,
  meet_id INTEGER NOT NULL REFERENCES meets(meet_id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  event_type TEXT,  -- track, field, combined
  gender TEXT CHECK (gender IN ('M', 'F', 'Mixed')),
  status TEXT CHECK (status IN ('scheduled', 'in_progress', 'completed')) DEFAULT 'scheduled',
  scheduled_time TIMESTAMP WITH TIME ZONE,
  actual_start_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes
CREATE INDEX idx_meets_date ON meets(date);
CREATE INDEX idx_meets_status ON meets(status);
CREATE INDEX idx_events_meet_id ON events(meet_id);
CREATE INDEX idx_events_status ON events(status);

-- Enable Row Level Security
ALTER TABLE meets ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Create policies to allow public read access
CREATE POLICY "Allow public read access to meets"
  ON meets FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access to events"
  ON events FOR SELECT
  USING (true);

-- Add updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_meets_updated_at
    BEFORE UPDATE ON meets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
