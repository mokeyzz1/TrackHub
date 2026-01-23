-- Add meet and event tables for proper heat sheet and results tracking

-- Meets table
CREATE TABLE meets (
    meet_id BIGSERIAL PRIMARY KEY,
    meet_name TEXT NOT NULL,
    start_date DATE,
    end_date DATE,
    location TEXT,
    host_school_id BIGINT REFERENCES schools(school_id),
    meet_type TEXT, -- 'invitational', 'conference', 'regional', 'national'
    division TEXT,
    gender TEXT CHECK (gender IN ('M', 'F', 'Mixed')),
    surface TEXT, -- 'indoor', 'outdoor'
    live_results_url TEXT,
    tfrrs_meet_id TEXT,
    athletic_net_meet_id TEXT,
    is_live BOOLEAN DEFAULT FALSE,
    is_completed BOOLEAN DEFAULT FALSE,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Events table (specific events within a meet)
CREATE TABLE meet_events (
    event_id BIGSERIAL PRIMARY KEY,
    meet_id BIGINT NOT NULL REFERENCES meets(meet_id) ON DELETE CASCADE,
    event_name TEXT NOT NULL, -- '100m', '200m', '400m', 'High Jump', etc.
    event_type TEXT, -- 'track', 'field', 'relay'
    gender TEXT NOT NULL CHECK (gender IN ('M', 'F')),
    division TEXT, -- 'varsity', 'jv', 'frosh'
    round TEXT, -- 'prelim', 'semi', 'final', 'qualifying'
    scheduled_time TIMESTAMP WITH TIME ZONE,
    actual_start_time TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'scheduled', -- 'scheduled', 'in_progress', 'completed', 'cancelled'
    wind_conditions TEXT,
    temperature TEXT,
    live_results_url TEXT,
    heat_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Heats table (individual heats within an event)
CREATE TABLE event_heats (
    heat_id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES meet_events(event_id) ON DELETE CASCADE,
    heat_number INTEGER NOT NULL,
    heat_type TEXT DEFAULT 'timed', -- 'timed', 'seeded', 'open'
    lane_count INTEGER DEFAULT 8,
    scheduled_time TIMESTAMP WITH TIME ZONE,
    actual_start_time TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'scheduled', -- 'scheduled', 'in_progress', 'completed'
    wind_reading TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, heat_number)
);

-- Heat entries (athletes in specific heats/lanes)
CREATE TABLE heat_entries (
    entry_id BIGSERIAL PRIMARY KEY,
    heat_id BIGINT NOT NULL REFERENCES event_heats(heat_id) ON DELETE CASCADE,
    athlete_id BIGINT NOT NULL REFERENCES athletes(athlete_id) ON DELETE CASCADE,
    team_id BIGINT REFERENCES teams(team_id) ON DELETE SET NULL,
    lane_number INTEGER,
    seed_time TEXT, -- qualifying/seed time
    seed_mark TEXT, -- for field events
    bib_number TEXT,
    status TEXT DEFAULT 'entered', -- 'entered', 'scratched', 'dns', 'dnf', 'dq'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(heat_id, lane_number)
);

-- Event results (final results with heat/lane info)
CREATE TABLE event_results (
    result_id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES meet_events(event_id) ON DELETE CASCADE,
    heat_id BIGINT REFERENCES event_heats(heat_id) ON DELETE SET NULL,
    athlete_id BIGINT NOT NULL REFERENCES athletes(athlete_id) ON DELETE CASCADE,
    team_id BIGINT REFERENCES teams(team_id) ON DELETE SET NULL,
    lane_number INTEGER,
    place INTEGER,
    finish_time TEXT, -- actual finish time/mark
    finish_time_seconds DOUBLE PRECISION, -- converted to seconds for sorting
    finish_mark TEXT, -- for field events
    finish_mark_meters DOUBLE PRECISION, -- converted to meters
    wind TEXT,
    points INTEGER, -- team points awarded
    is_pr BOOLEAN DEFAULT FALSE,
    is_sb BOOLEAN DEFAULT FALSE, -- season best
    is_pb BOOLEAN DEFAULT FALSE, -- personal best
    is_meet_record BOOLEAN DEFAULT FALSE,
    is_facility_record BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'official', -- 'official', 'unofficial', 'dq', 'dns', 'dnf'
    reaction_time TEXT, -- for sprint events
    splits JSONB, -- lap splits or attempt details
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_meets_date ON meets(start_date);
CREATE INDEX idx_meets_live ON meets(is_live) WHERE is_live = TRUE;
CREATE INDEX idx_meets_host_school ON meets(host_school_id);

CREATE INDEX idx_meet_events_meet ON meet_events(meet_id);
CREATE INDEX idx_meet_events_name ON meet_events(event_name);
CREATE INDEX idx_meet_events_status ON meet_events(status);
CREATE INDEX idx_meet_events_gender ON meet_events(gender);

CREATE INDEX idx_event_heats_event ON event_heats(event_id);
CREATE INDEX idx_event_heats_number ON event_heats(heat_number);

CREATE INDEX idx_heat_entries_heat ON heat_entries(heat_id);
CREATE INDEX idx_heat_entries_athlete ON heat_entries(athlete_id);
CREATE INDEX idx_heat_entries_lane ON heat_entries(lane_number);

CREATE INDEX idx_event_results_event ON event_results(event_id);
CREATE INDEX idx_event_results_athlete ON event_results(athlete_id);
CREATE INDEX idx_event_results_place ON event_results(place);
CREATE INDEX idx_event_results_heat ON event_results(heat_id);

-- Views for easy querying
CREATE VIEW event_heat_sheets AS
SELECT 
    e.event_id,
    e.meet_id,
    e.event_name,
    e.gender,
    e.round,
    e.status as event_status,
    h.heat_id,
    h.heat_number,
    h.status as heat_status,
    he.entry_id,
    he.lane_number,
    he.seed_time,
    he.bib_number,
    a.athlete_id,
    a.full_name as athlete_name,
    a.class_year,
    s.school_name,
    s.short_name as school_abbreviation,
    t.gender as team_gender
FROM meet_events e
JOIN event_heats h ON e.event_id = h.event_id
JOIN heat_entries he ON h.heat_id = he.heat_id
JOIN athletes a ON he.athlete_id = a.athlete_id
LEFT JOIN teams t ON he.team_id = t.team_id
LEFT JOIN schools s ON a.school_id = s.school_id
ORDER BY e.event_id, h.heat_number, he.lane_number;

-- View for event results with all details
CREATE VIEW event_results_full AS
SELECT 
    er.result_id,
    er.event_id,
    er.place,
    er.finish_time,
    er.finish_mark,
    er.wind,
    er.points,
    er.lane_number,
    er.status,
    e.event_name,
    e.gender,
    e.round,
    m.meet_name,
    m.start_date as meet_date,
    a.athlete_id,
    a.full_name as athlete_name,
    a.class_year,
    s.school_name,
    s.short_name as school_abbreviation,
    h.heat_number
FROM event_results er
JOIN meet_events e ON er.event_id = e.event_id
JOIN meets m ON e.meet_id = m.meet_id
JOIN athletes a ON er.athlete_id = a.athlete_id
LEFT JOIN schools s ON a.school_id = s.school_id
LEFT JOIN event_heats h ON er.heat_id = h.heat_id
ORDER BY er.event_id, er.place NULLS LAST;
