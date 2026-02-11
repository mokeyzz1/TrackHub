-- Function to get top performances with WA scoring built-in
-- Calculates World Athletics points and returns ranked results
-- Run this in Supabase SQL Editor

DROP FUNCTION IF EXISTS get_top_performances;

CREATE OR REPLACE FUNCTION get_top_performances(
  p_start_date DATE,
  p_end_date DATE,
  p_division TEXT DEFAULT NULL,
  p_gender CHAR(1) DEFAULT NULL,
  p_limit INT DEFAULT 100
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
  division TEXT,
  wa_points INT
) AS $$
DECLARE
  -- WA coefficients for common indoor events
  -- Format: [a, b, c] where points = a*x^2 + b*x + c
  -- Men's coefficients
  m_60m_a NUMERIC := 68.62032200155772;
  m_60m_b NUMERIC := -1468.376079820242;
  m_60m_c NUMERIC := 7854.923996115336;

  m_200m_a NUMERIC := 5.083329625804254;
  m_200m_b NUMERIC := -360.8260380705033;
  m_200m_c NUMERIC := 6403.154333221377;

  m_400m_a NUMERIC := 1.0210130425695638;
  m_400m_b NUMERIC := -161.3092238081408;
  m_400m_c NUMERIC := 6371.289298935095;

  m_600m_a NUMERIC := 0.3856992283143512;
  m_600m_b NUMERIC := -99.89240864996827;
  m_600m_c NUMERIC := 6467.788691627793;

  m_800m_a NUMERIC := 0.1980049254166545;
  m_800m_b NUMERIC := -72.07136038821409;
  m_800m_c NUMERIC := 6558.28160300618;

  m_1000m_a NUMERIC := 0.11229987246056083;
  m_1000m_b NUMERIC := -53.34129687676432;
  m_1000m_c NUMERIC := 6334.142779359594;

  m_mile_a NUMERIC := 0.035099677603458446;
  m_mile_b NUMERIC := -29.132456259137143;
  m_mile_c NUMERIC := 6044.924547011615;

  m_3000m_a NUMERIC := 0.008150049932713843;
  m_3000m_b NUMERIC := -13.691983542337312;
  m_3000m_c NUMERIC := 5750.59246378555;

  m_5000m_a NUMERIC := 0.002777997945427213;
  m_5000m_b NUMERIC := -8.000608112196687;
  m_5000m_c NUMERIC := 5760.418712362531;

  m_60mh_a NUMERIC := 23.916231718984818;
  m_60mh_b NUMERIC := -698.1937268964539;
  m_60mh_c NUMERIC := 5095.479315056291;

  m_hj_a NUMERIC := 32.14570816360356;
  m_hj_b NUMERIC := 745.3746826150164;
  m_hj_c NUMERIC := -705.259733494051;

  m_pv_a NUMERIC := 3.0457199208785823;
  m_pv_b NUMERIC := 239.612026696057;
  m_pv_c NUMERIC := -280.5412229935755;

  m_lj_a NUMERIC := 1.931092872960562;
  m_lj_b NUMERIC := 186.73134733641928;
  m_lj_c NUMERIC := -479.70640445759636;

  m_tj_a NUMERIC := 0.4603666024030417;
  m_tj_b NUMERIC := 90.96978768056579;
  m_tj_c NUMERIC := -514.9946082626993;

  m_sp_a NUMERIC := 0.04234614355526389;
  m_sp_b NUMERIC := 57.99966265925241;
  m_sp_c NUMERIC := -55.823610246186945;

  m_wt_a NUMERIC := 0.0028444950947790204;
  m_wt_b NUMERIC := 15.081627308136717;
  m_wt_c NUMERIC := -21.68901198504136;

  -- Women's coefficients
  w_60m_a NUMERIC := 24.91177544269476;
  w_60m_b NUMERIC := -697.4127036580539;
  w_60m_c NUMERIC := 4880.84062414919;

  w_200m_a NUMERIC := 2.2422237149162925;
  w_200m_b NUMERIC := -204.01464451534775;
  w_200m_c NUMERIC := 4640.727341804304;

  w_400m_a NUMERIC := 0.3350059758445596;
  w_400m_b NUMERIC := -73.6974469594461;
  w_400m_c NUMERIC := 4053.1545244171575;

  w_600m_a NUMERIC := 0.1290024817337887;
  w_600m_b NUMERIC := -46.439367295225566;
  w_600m_c NUMERIC := 4179.4139537496085;

  w_800m_a NUMERIC := 0.06879989341997295;
  w_800m_b NUMERIC := -34.399261916380055;
  w_800m_c NUMERIC := 4299.822125108796;

  w_1000m_a NUMERIC := 0.038199708533426247;
  w_1000m_b NUMERIC := -25.211487793783817;
  w_1000m_c NUMERIC := 4159.840558573429;

  w_mile_a NUMERIC := 0.011649998601839462;
  w_mile_b NUMERIC := -13.513881163102496;
  w_mile_c NUMERIC := 3918.992004961794;

  w_3000m_a NUMERIC := 0.0025389974609562604;
  w_3000m_b NUMERIC := -6.09357042856243;
  w_3000m_c NUMERIC := 3656.127933666052;

  w_5000m_a NUMERIC := 8.079992470730324E-4;
  w_5000m_b NUMERIC := -3.3935897885437782;
  w_5000m_c NUMERIC := 3563.2616780022654;

  w_60mh_a NUMERIC := 11.16828188896136;
  w_60mh_b NUMERIC := -406.39148481091615;
  w_60mh_c NUMERIC := 3696.9522386075114;

  w_hj_a NUMERIC := 39.557908744493034;
  w_hj_b NUMERIC := 831.3655724464043;
  w_hj_c NUMERIC := -601.5063267494843;

  w_pv_a NUMERIC := 3.9325797501069246;
  w_pv_b NUMERIC := 275.48968329946365;
  w_pv_c NUMERIC := -205.1216924619548;

  w_lj_a NUMERIC := 1.958114032649064;
  w_lj_b NUMERIC := 193.69548254413166;
  w_lj_c NUMERIC := -233.98988652729167;

  w_tj_a NUMERIC := 0.4296645887350792;
  w_tj_b NUMERIC := 90.3430418780863;
  w_tj_c NUMERIC := -231.6675825305283;

  w_sp_a NUMERIC := 0.046214387641356325;
  w_sp_b NUMERIC := 60.75503111383068;
  w_sp_c NUMERIC := -25.931941888942674;

  w_wt_a NUMERIC := 0.0030967239667614166;
  w_wt_b NUMERIC := 15.730166876520684;
  w_wt_c NUMERIC := -22.699498543297523;

BEGIN
  RETURN QUERY
  WITH scored AS (
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
      s.official_name::TEXT AS school_name,
      s.division::TEXT,
      -- Calculate WA points based on event and gender
      GREATEST(0, ROUND(
        CASE
          -- MEN'S TRACK EVENTS (use mark_seconds)
          WHEN a.gender = 'M' AND r.event_name IN ('60 Meters', '60m') AND r.mark_seconds IS NOT NULL THEN
            m_60m_a * r.mark_seconds * r.mark_seconds + m_60m_b * r.mark_seconds + m_60m_c
          WHEN a.gender = 'M' AND r.event_name IN ('200 Meters', '200m') AND r.mark_seconds IS NOT NULL THEN
            m_200m_a * r.mark_seconds * r.mark_seconds + m_200m_b * r.mark_seconds + m_200m_c
          WHEN a.gender = 'M' AND r.event_name IN ('400 Meters', '400m') AND r.mark_seconds IS NOT NULL THEN
            m_400m_a * r.mark_seconds * r.mark_seconds + m_400m_b * r.mark_seconds + m_400m_c
          WHEN a.gender = 'M' AND r.event_name IN ('600 Meters', '600m') AND r.mark_seconds IS NOT NULL THEN
            m_600m_a * r.mark_seconds * r.mark_seconds + m_600m_b * r.mark_seconds + m_600m_c
          WHEN a.gender = 'M' AND r.event_name IN ('800 Meters', '800m') AND r.mark_seconds IS NOT NULL THEN
            m_800m_a * r.mark_seconds * r.mark_seconds + m_800m_b * r.mark_seconds + m_800m_c
          WHEN a.gender = 'M' AND r.event_name IN ('1000 Meters', '1000m') AND r.mark_seconds IS NOT NULL THEN
            m_1000m_a * r.mark_seconds * r.mark_seconds + m_1000m_b * r.mark_seconds + m_1000m_c
          WHEN a.gender = 'M' AND r.event_name IN ('Mile', '1 Mile') AND r.mark_seconds IS NOT NULL THEN
            m_mile_a * r.mark_seconds * r.mark_seconds + m_mile_b * r.mark_seconds + m_mile_c
          WHEN a.gender = 'M' AND r.event_name IN ('3000 Meters', '3000m') AND r.mark_seconds IS NOT NULL THEN
            m_3000m_a * r.mark_seconds * r.mark_seconds + m_3000m_b * r.mark_seconds + m_3000m_c
          WHEN a.gender = 'M' AND r.event_name IN ('5000 Meters', '5000m') AND r.mark_seconds IS NOT NULL THEN
            m_5000m_a * r.mark_seconds * r.mark_seconds + m_5000m_b * r.mark_seconds + m_5000m_c
          WHEN a.gender = 'M' AND r.event_name IN ('60 Hurdles', '60 Meter Hurdles', '60mH') AND r.mark_seconds IS NOT NULL THEN
            m_60mh_a * r.mark_seconds * r.mark_seconds + m_60mh_b * r.mark_seconds + m_60mh_c

          -- MEN'S FIELD EVENTS (use mark_meters)
          WHEN a.gender = 'M' AND r.event_name = 'High Jump' AND r.mark_meters IS NOT NULL THEN
            m_hj_a * r.mark_meters * r.mark_meters + m_hj_b * r.mark_meters + m_hj_c
          WHEN a.gender = 'M' AND r.event_name = 'Pole Vault' AND r.mark_meters IS NOT NULL THEN
            m_pv_a * r.mark_meters * r.mark_meters + m_pv_b * r.mark_meters + m_pv_c
          WHEN a.gender = 'M' AND r.event_name = 'Long Jump' AND r.mark_meters IS NOT NULL THEN
            m_lj_a * r.mark_meters * r.mark_meters + m_lj_b * r.mark_meters + m_lj_c
          WHEN a.gender = 'M' AND r.event_name = 'Triple Jump' AND r.mark_meters IS NOT NULL THEN
            m_tj_a * r.mark_meters * r.mark_meters + m_tj_b * r.mark_meters + m_tj_c
          WHEN a.gender = 'M' AND r.event_name = 'Shot Put' AND r.mark_meters IS NOT NULL THEN
            m_sp_a * r.mark_meters * r.mark_meters + m_sp_b * r.mark_meters + m_sp_c
          WHEN a.gender = 'M' AND r.event_name = 'Weight Throw' AND r.mark_meters IS NOT NULL THEN
            m_wt_a * r.mark_meters * r.mark_meters + m_wt_b * r.mark_meters + m_wt_c

          -- WOMEN'S TRACK EVENTS
          WHEN a.gender = 'F' AND r.event_name IN ('60 Meters', '60m') AND r.mark_seconds IS NOT NULL THEN
            w_60m_a * r.mark_seconds * r.mark_seconds + w_60m_b * r.mark_seconds + w_60m_c
          WHEN a.gender = 'F' AND r.event_name IN ('200 Meters', '200m') AND r.mark_seconds IS NOT NULL THEN
            w_200m_a * r.mark_seconds * r.mark_seconds + w_200m_b * r.mark_seconds + w_200m_c
          WHEN a.gender = 'F' AND r.event_name IN ('400 Meters', '400m') AND r.mark_seconds IS NOT NULL THEN
            w_400m_a * r.mark_seconds * r.mark_seconds + w_400m_b * r.mark_seconds + w_400m_c
          WHEN a.gender = 'F' AND r.event_name IN ('600 Meters', '600m') AND r.mark_seconds IS NOT NULL THEN
            w_600m_a * r.mark_seconds * r.mark_seconds + w_600m_b * r.mark_seconds + w_600m_c
          WHEN a.gender = 'F' AND r.event_name IN ('800 Meters', '800m') AND r.mark_seconds IS NOT NULL THEN
            w_800m_a * r.mark_seconds * r.mark_seconds + w_800m_b * r.mark_seconds + w_800m_c
          WHEN a.gender = 'F' AND r.event_name IN ('1000 Meters', '1000m') AND r.mark_seconds IS NOT NULL THEN
            w_1000m_a * r.mark_seconds * r.mark_seconds + w_1000m_b * r.mark_seconds + w_1000m_c
          WHEN a.gender = 'F' AND r.event_name IN ('Mile', '1 Mile') AND r.mark_seconds IS NOT NULL THEN
            w_mile_a * r.mark_seconds * r.mark_seconds + w_mile_b * r.mark_seconds + w_mile_c
          WHEN a.gender = 'F' AND r.event_name IN ('3000 Meters', '3000m') AND r.mark_seconds IS NOT NULL THEN
            w_3000m_a * r.mark_seconds * r.mark_seconds + w_3000m_b * r.mark_seconds + w_3000m_c
          WHEN a.gender = 'F' AND r.event_name IN ('5000 Meters', '5000m') AND r.mark_seconds IS NOT NULL THEN
            w_5000m_a * r.mark_seconds * r.mark_seconds + w_5000m_b * r.mark_seconds + w_5000m_c
          WHEN a.gender = 'F' AND r.event_name IN ('60 Hurdles', '60 Meter Hurdles', '60mH') AND r.mark_seconds IS NOT NULL THEN
            w_60mh_a * r.mark_seconds * r.mark_seconds + w_60mh_b * r.mark_seconds + w_60mh_c

          -- WOMEN'S FIELD EVENTS
          WHEN a.gender = 'F' AND r.event_name = 'High Jump' AND r.mark_meters IS NOT NULL THEN
            w_hj_a * r.mark_meters * r.mark_meters + w_hj_b * r.mark_meters + w_hj_c
          WHEN a.gender = 'F' AND r.event_name = 'Pole Vault' AND r.mark_meters IS NOT NULL THEN
            w_pv_a * r.mark_meters * r.mark_meters + w_pv_b * r.mark_meters + w_pv_c
          WHEN a.gender = 'F' AND r.event_name = 'Long Jump' AND r.mark_meters IS NOT NULL THEN
            w_lj_a * r.mark_meters * r.mark_meters + w_lj_b * r.mark_meters + w_lj_c
          WHEN a.gender = 'F' AND r.event_name = 'Triple Jump' AND r.mark_meters IS NOT NULL THEN
            w_tj_a * r.mark_meters * r.mark_meters + w_tj_b * r.mark_meters + w_tj_c
          WHEN a.gender = 'F' AND r.event_name = 'Shot Put' AND r.mark_meters IS NOT NULL THEN
            w_sp_a * r.mark_meters * r.mark_meters + w_sp_b * r.mark_meters + w_sp_c
          WHEN a.gender = 'F' AND r.event_name = 'Weight Throw' AND r.mark_meters IS NOT NULL THEN
            w_wt_a * r.mark_meters * r.mark_meters + w_wt_b * r.mark_meters + w_wt_c

          ELSE NULL
        END
      ))::INT AS wa_points
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
      AND (p_gender IS NULL OR a.gender = p_gender)
  ),
  -- Deduplicate: keep only best performance per athlete
  -- Cap at 1400 points to filter out formula artifacts (injury times, misclassified events)
  ranked AS (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY scored.athlete_id ORDER BY scored.wa_points DESC NULLS LAST) as rn
    FROM scored
    WHERE scored.wa_points IS NOT NULL
      AND scored.wa_points > 0
      AND scored.wa_points <= 1600
  )
  SELECT
    ranked.athlete_id,
    ranked.full_name,
    ranked.gender,
    ranked.event_name,
    ranked.mark_raw,
    ranked.mark_seconds,
    ranked.mark_meters,
    ranked.date,
    ranked.meet_name,
    ranked.meet_id,
    ranked.place,
    ranked.school_name,
    ranked.division,
    ranked.wa_points
  FROM ranked
  WHERE ranked.rn = 1
  ORDER BY ranked.wa_points DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION get_top_performances TO anon, authenticated, service_role;

COMMENT ON FUNCTION get_top_performances IS
'Gets top performances ranked by World Athletics scoring points.
Calculates WA points in-database and returns deduplicated, ranked results.
Usage: SELECT * FROM get_top_performances(start_date, end_date, division, gender, limit)
Example: SELECT * FROM get_top_performances(''2026-02-06'', ''2026-02-08'', ''D1'', ''M'', 10)';
