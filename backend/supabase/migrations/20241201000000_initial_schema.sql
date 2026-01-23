-- Track Hub - Initial Schema Migration
-- Migrating from SQLite to PostgreSQL for Supabase

-- Enable UUID extension for potential future use
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Regions table
CREATE TABLE regions (
    region_id BIGSERIAL PRIMARY KEY,
    region_name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Conferences table
CREATE TABLE conferences (
    conference_id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    abbreviation TEXT,
    division TEXT,
    region TEXT,
    website TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Schools table
CREATE TABLE schools (
    school_id BIGSERIAL PRIMARY KEY,
    official_name TEXT NOT NULL,
    short_name TEXT,
    city TEXT,
    state TEXT,
    division TEXT,
    ncaa_region TEXT,
    current_conference_id BIGINT REFERENCES conferences(conference_id),
    region_id BIGINT REFERENCES regions(region_id),
    is_active BOOLEAN DEFAULT TRUE,
    logo_url TEXT,
    logo_file_path TEXT,
    logo_source TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Conference memberships (historical tracking)
CREATE TABLE conference_memberships (
    membership_id BIGSERIAL PRIMARY KEY,
    school_id BIGINT NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    conference_id BIGINT NOT NULL REFERENCES conferences(conference_id) ON DELETE CASCADE,
    start_year INTEGER,
    end_year INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(school_id, conference_id, start_year)
);

-- Teams table (Men's/Women's teams per school)
CREATE TABLE teams (
    team_id BIGSERIAL PRIMARY KEY,
    school_id BIGINT NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    gender TEXT NOT NULL CHECK (gender IN ('M', 'F')),
    tfrrs_team_url TEXT,
    athletic_net_url TEXT,
    coach_name TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(school_id, gender)
);

-- Athletes table
CREATE TABLE athletes (
    athlete_id BIGSERIAL PRIMARY KEY,
    school_id BIGINT NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    gender TEXT CHECK (gender IN ('M', 'F')),
    class_year TEXT,
    grad_year INTEGER,
    primary_events TEXT,
    hometown TEXT,
    high_school TEXT,
    tfrrs_athlete_id TEXT,
    tfrrs_profile_url TEXT,
    athletic_net_url TEXT,
    profile_image_url TEXT,
    bio TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Athlete-Team-Season junction (roster tracking)
CREATE TABLE athlete_team_seasons (
    ats_id BIGSERIAL PRIMARY KEY,
    athlete_id BIGINT NOT NULL REFERENCES athletes(athlete_id) ON DELETE CASCADE,
    team_id BIGINT NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    season_code TEXT NOT NULL,
    year_in_school TEXT,
    jersey_number TEXT,
    status TEXT DEFAULT 'active',
    is_redshirt BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(athlete_id, team_id, season_code)
);

-- Results table (2.2M+ records)
CREATE TABLE results (
    result_id BIGSERIAL PRIMARY KEY,
    athlete_id BIGINT NOT NULL REFERENCES athletes(athlete_id) ON DELETE CASCADE,
    team_id BIGINT REFERENCES teams(team_id) ON DELETE SET NULL,
    event_name TEXT NOT NULL,
    mark_raw TEXT NOT NULL,
    mark_seconds DOUBLE PRECISION,
    mark_meters DOUBLE PRECISION,
    mark_feet TEXT,
    wind TEXT,
    round TEXT,
    date DATE,
    season_code TEXT,
    meet_name TEXT,
    meet_location TEXT,
    place INTEGER,
    total_competitors INTEGER,
    is_pr BOOLEAN DEFAULT FALSE,
    is_season_best BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- External IDs (cross-references to other platforms)
CREATE TABLE external_ids (
    external_id BIGSERIAL PRIMARY KEY,
    school_id BIGINT REFERENCES schools(school_id) ON DELETE CASCADE,
    athlete_id BIGINT REFERENCES athletes(athlete_id) ON DELETE CASCADE,
    team_id BIGINT REFERENCES teams(team_id) ON DELETE CASCADE,
    conference_id BIGINT REFERENCES conferences(conference_id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    external_name TEXT,
    external_key TEXT,
    external_url TEXT,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source, external_key)
);

-- =============================================================================
-- INDEXES for performance
-- =============================================================================

-- Schools indexes
CREATE INDEX idx_schools_division ON schools(division);
CREATE INDEX idx_schools_state ON schools(state);
CREATE INDEX idx_schools_region ON schools(region_id);
CREATE INDEX idx_schools_conference ON schools(current_conference_id);
CREATE INDEX idx_schools_active ON schools(is_active) WHERE is_active = TRUE;

-- Conferences indexes
CREATE INDEX idx_conferences_division ON conferences(division);

-- Teams indexes
CREATE INDEX idx_teams_school ON teams(school_id);
CREATE INDEX idx_teams_gender ON teams(gender);
CREATE INDEX idx_teams_active ON teams(is_active) WHERE is_active = TRUE;

-- Athletes indexes
CREATE INDEX idx_athletes_school ON athletes(school_id);
CREATE INDEX idx_athletes_tfrrs ON athletes(tfrrs_athlete_id);
CREATE INDEX idx_athletes_gender ON athletes(gender);
CREATE INDEX idx_athletes_active ON athletes(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_athletes_full_name ON athletes(full_name);

-- Athlete-Team-Season indexes
CREATE INDEX idx_athlete_team_seasons_athlete ON athlete_team_seasons(athlete_id);
CREATE INDEX idx_athlete_team_seasons_team ON athlete_team_seasons(team_id);
CREATE INDEX idx_athlete_team_seasons_season ON athlete_team_seasons(season_code);

-- Results indexes (critical for performance with 2.2M+ records)
CREATE INDEX idx_results_athlete ON results(athlete_id);
CREATE INDEX idx_results_event ON results(event_name);
CREATE INDEX idx_results_season ON results(season_code);
CREATE INDEX idx_results_date ON results(date);
CREATE INDEX idx_results_round ON results(round);
CREATE INDEX idx_results_meet_name ON results(meet_name);
-- Composite index for common queries
CREATE INDEX idx_results_athlete_event ON results(athlete_id, event_name);
CREATE INDEX idx_results_athlete_date ON results(athlete_id, date DESC);

-- External IDs indexes
CREATE INDEX idx_external_ids_source ON external_ids(source);
CREATE INDEX idx_external_ids_key ON external_ids(external_key);

-- =============================================================================
-- VIEWS for convenience
-- =============================================================================

-- Schools with full conference/region info
CREATE VIEW schools_full AS
SELECT
    s.school_id,
    s.official_name,
    s.short_name,
    s.city,
    s.state,
    s.division,
    r.region_name,
    c.name as conference_name,
    c.abbreviation as conference_abbrev,
    s.logo_url,
    s.is_active
FROM schools s
LEFT JOIN regions r ON s.region_id = r.region_id
LEFT JOIN conferences c ON s.current_conference_id = c.conference_id;

-- Teams with summary info
CREATE VIEW teams_summary AS
SELECT
    t.team_id,
    s.official_name as school_name,
    s.division,
    t.gender,
    r.region_name,
    c.name as conference_name,
    COUNT(ats.athlete_id) as athlete_count
FROM teams t
JOIN schools s ON t.school_id = s.school_id
LEFT JOIN regions r ON s.region_id = r.region_id
LEFT JOIN conferences c ON s.current_conference_id = c.conference_id
LEFT JOIN athlete_team_seasons ats ON t.team_id = ats.team_id
GROUP BY t.team_id, s.official_name, s.division, t.gender, r.region_name, c.name;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE conference_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE athlete_team_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_ids ENABLE ROW LEVEL SECURITY;

-- Public read access policies (no authentication required for reading)
CREATE POLICY "Public read access" ON regions FOR SELECT USING (true);
CREATE POLICY "Public read access" ON conferences FOR SELECT USING (true);
CREATE POLICY "Public read access" ON schools FOR SELECT USING (true);
CREATE POLICY "Public read access" ON conference_memberships FOR SELECT USING (true);
CREATE POLICY "Public read access" ON teams FOR SELECT USING (true);
CREATE POLICY "Public read access" ON athletes FOR SELECT USING (true);
CREATE POLICY "Public read access" ON athlete_team_seasons FOR SELECT USING (true);
CREATE POLICY "Public read access" ON results FOR SELECT USING (true);
CREATE POLICY "Public read access" ON external_ids FOR SELECT USING (true);

-- Only service role can write (via Edge Functions)
-- No public insert/update/delete policies = only service role can write

-- =============================================================================
-- FUNCTIONS AND TRIGGERS
-- =============================================================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON schools
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conferences_updated_at BEFORE UPDATE ON conferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_athletes_updated_at BEFORE UPDATE ON athletes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_external_ids_updated_at BEFORE UPDATE ON external_ids
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE schools IS 'NCAA/NAIA/NJCAA schools with track & field programs';
COMMENT ON TABLE athletes IS 'College track & field athletes';
COMMENT ON TABLE results IS 'Meet results - 2.2M+ records of athlete performances';
COMMENT ON TABLE teams IS 'Mens and Womens teams per school';
COMMENT ON TABLE athlete_team_seasons IS 'Tracks which athletes were on which teams in which seasons';
COMMENT ON COLUMN results.mark_seconds IS 'Converted time in seconds for time-based events';
COMMENT ON COLUMN results.mark_meters IS 'Converted distance in meters for distance throws/jumps';
COMMENT ON COLUMN results.season_code IS 'Format: YYYY_SEASON where SEASON is XC, IN, or OUT';
