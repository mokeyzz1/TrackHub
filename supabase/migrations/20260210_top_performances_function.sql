-- Function to get top performances efficiently
-- Replaces 45+ client round trips with 1 database call
-- Run: SELECT * FROM get_weekly_performances('2026-02-01', '2026-02-08', 'D1', 1000)

DROP FUNCTION IF EXISTS get_weekly_performances;

CREATE OR REPLACE FUNCTION get_weekly_performances(
  p_start_date DATE,
  p_end_date DATE,
  p_division TEXT DEFAULT NULL,
  p_limit INT DEFAULT 5000
)
RETURNS TABLE (
  athlete_id INT,
  full_name TEXT,
  gender CHAR(1),
  event_name TEXT,
  mark_raw TEXT,
  mark_seconds NUMERIC,
  mark_meters NUMERIC,
  date DATE,
  meet_name TEXT,
  meet_id INT,
  place SMALLINT,
  school_name TEXT,
  division TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.athlete_id::INT,
    a.full_name::TEXT,
    a.gender::CHAR(1),
    r.event_name::TEXT,
    r.mark_raw::TEXT,
    r.mark_seconds::NUMERIC,
    r.mark_meters::NUMERIC,
    r.date::DATE,
    r.meet_name::TEXT,
    r.meet_id::INT,
    r.place::SMALLINT,
    s.official_name::TEXT,
    s.division::TEXT
  FROM results r
  INNER JOIN athletes a ON r.athlete_id = a.athlete_id
  INNER JOIN schools s ON a.school_id = s.school_id
  WHERE r.date BETWEEN p_start_date AND p_end_date
    AND r.mark_raw IS NOT NULL
    AND (
      p_division IS NULL
      OR p_division = 'all'
      OR s.division ILIKE ANY(
        CASE p_division
          WHEN 'D1' THEN ARRAY['DI', 'D1', 'Division I', 'NCAA Division I']
          WHEN 'D2' THEN ARRAY['DII', 'D2', 'Division II', 'NCAA Division II']
          WHEN 'D3' THEN ARRAY['DIII', 'D3', 'Division III', 'NCAA Division III']
          WHEN 'NAIA' THEN ARRAY['NAIA']
          WHEN 'JUCO' THEN ARRAY['JUCO', 'NJCAA']
          ELSE ARRAY[p_division]
        END
      )
    )
  ORDER BY r.date DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION get_weekly_performances TO anon, authenticated, service_role;

COMMENT ON FUNCTION get_weekly_performances IS
'Gets performances for a date range with athlete and school info joined.
Single call replaces 45+ client-side queries.
Usage: SELECT * FROM get_weekly_performances(start_date, end_date, division, limit)';
