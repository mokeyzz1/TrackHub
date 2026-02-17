-- Add indexes to speed up get_top_performances function
-- These indexes help with the common query patterns used in the function

-- Index on results.date for date range filtering
CREATE INDEX IF NOT EXISTS idx_results_date ON results(date);

-- Composite index for indoor meet detection (meet_name + date + event_name pattern)
CREATE INDEX IF NOT EXISTS idx_results_meet_date ON results(meet_name, date);

-- Index on results.athlete_id for join performance
CREATE INDEX IF NOT EXISTS idx_results_athlete_id ON results(athlete_id);

-- Index on athletes for school join
CREATE INDEX IF NOT EXISTS idx_athletes_school_id ON athletes(school_id);

-- Index on athletes.gender for filtering
CREATE INDEX IF NOT EXISTS idx_athletes_gender ON athletes(gender);

-- Index on schools.division for filtering
CREATE INDEX IF NOT EXISTS idx_schools_division ON schools(division);

-- Composite index on results for common query patterns
CREATE INDEX IF NOT EXISTS idx_results_date_athlete ON results(date, athlete_id);

-- Analyze tables to update statistics
ANALYZE results;
ANALYZE athletes;
ANALYZE schools;
