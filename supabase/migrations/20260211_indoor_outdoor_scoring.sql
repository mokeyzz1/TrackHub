-- Add indoor vs outdoor detection and separate coefficients
-- Indoor meets are detected by presence of 60m events
-- Indoor 200m/400m get higher scores for same time (tighter turns = harder)
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
  -- Indoor coefficients (Short Track - ST)
  -- 60m is indoor only
  m_60m_a NUMERIC := 68.62032200155772;
  m_60m_b NUMERIC := -1468.376079820242;
  m_60m_c NUMERIC := 7854.923996115336;

  -- Men's Indoor 200m ST (from official WA 2025 coefficients)
  m_200m_indoor_a NUMERIC := 5.043;
  m_200m_indoor_b NUMERIC := -363.005;
  m_200m_indoor_c NUMERIC := 6532.673;

  -- Men's Outdoor 200m
  m_200m_outdoor_a NUMERIC := 5.083;
  m_200m_outdoor_b NUMERIC := -360.826;
  m_200m_outdoor_c NUMERIC := 6403.154;

  -- Men's Indoor 400m ST (from official WA 2025 coefficients)
  m_400m_indoor_a NUMERIC := 0.981;
  m_400m_indoor_b NUMERIC := -158.131;
  m_400m_indoor_c NUMERIC := 6372.245;

  -- Men's Outdoor 400m
  m_400m_outdoor_a NUMERIC := 1.021;
  m_400m_outdoor_b NUMERIC := -161.309;
  m_400m_outdoor_c NUMERIC := 6371.289;

  -- Men's 600m indoor/outdoor
  m_600m_indoor_a NUMERIC := 0.390;
  m_600m_indoor_b NUMERIC := -102.173;
  m_600m_indoor_c NUMERIC := 6692.146;
  m_600m_outdoor_a NUMERIC := 0.386;
  m_600m_outdoor_b NUMERIC := -99.892;
  m_600m_outdoor_c NUMERIC := 6467.789;

  -- Men's 800m indoor/outdoor
  m_800m_indoor_a NUMERIC := 0.197;
  m_800m_indoor_b NUMERIC := -72.639;
  m_800m_indoor_c NUMERIC := 6682.688;
  m_800m_outdoor_a NUMERIC := 0.198;
  m_800m_outdoor_b NUMERIC := -72.071;
  m_800m_outdoor_c NUMERIC := 6558.282;

  -- Men's 1000m indoor/outdoor
  m_1000m_indoor_a NUMERIC := 0.114;
  m_1000m_indoor_b NUMERIC := -54.670;
  m_1000m_indoor_c NUMERIC := 6560.290;
  m_1000m_outdoor_a NUMERIC := 0.112;
  m_1000m_outdoor_b NUMERIC := -53.341;
  m_1000m_outdoor_c NUMERIC := 6334.143;

  -- Men's 1500m indoor/outdoor
  m_1500m_indoor_a NUMERIC := 0.042;
  m_1500m_indoor_b NUMERIC := -32.424;
  m_1500m_indoor_c NUMERIC := 6257.670;
  m_1500m_outdoor_a NUMERIC := 0.041;
  m_1500m_outdoor_b NUMERIC := -31.308;
  m_1500m_outdoor_c NUMERIC := 6026.662;

  -- Men's Mile indoor/outdoor
  m_mile_indoor_a NUMERIC := 0.037;
  m_mile_indoor_b NUMERIC := -30.627;
  m_mile_indoor_c NUMERIC := 6354.958;
  m_mile_outdoor_a NUMERIC := 0.035;
  m_mile_outdoor_b NUMERIC := -29.132;
  m_mile_outdoor_c NUMERIC := 6044.925;

  -- Men's 3000m indoor/outdoor
  m_3000m_indoor_a NUMERIC := 0.008;
  m_3000m_indoor_b NUMERIC := -13.981;
  m_3000m_indoor_c NUMERIC := 5871.903;
  m_3000m_outdoor_a NUMERIC := 0.008;
  m_3000m_outdoor_b NUMERIC := -13.692;
  m_3000m_outdoor_c NUMERIC := 5750.592;

  -- Men's 5000m indoor/outdoor
  m_5000m_indoor_a NUMERIC := 0.003;
  m_5000m_indoor_b NUMERIC := -8.352;
  m_5000m_indoor_c NUMERIC := 6013.401;
  m_5000m_outdoor_a NUMERIC := 0.003;
  m_5000m_outdoor_b NUMERIC := -8.001;
  m_5000m_outdoor_c NUMERIC := 5760.419;

  m_60mh_a NUMERIC := 23.916231718984818;
  m_60mh_b NUMERIC := -698.1937268964539;
  m_60mh_c NUMERIC := 5095.479315056291;

  -- Field events (same indoor/outdoor)
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

  m_wt_a NUMERIC := 0.07161631697170322;
  m_wt_b NUMERIC := 53.365911181377385;
  m_wt_c NUMERIC := -131.69314447528086;

  -- Women's coefficients
  w_60m_a NUMERIC := 24.91177544269476;
  w_60m_b NUMERIC := -697.4127036580539;
  w_60m_c NUMERIC := 4880.84062414919;

  -- Women's Indoor 200m ST (from official WA 2025 coefficients)
  w_200m_indoor_a NUMERIC := 1.962;
  w_200m_indoor_b NUMERIC := -186.353;
  w_200m_indoor_c NUMERIC := 4425.540;

  -- Women's Outdoor 200m
  w_200m_outdoor_a NUMERIC := 2.242;
  w_200m_outdoor_b NUMERIC := -204.015;
  w_200m_outdoor_c NUMERIC := 4640.727;

  -- Women's Indoor 400m ST (from official WA 2025 coefficients)
  w_400m_indoor_a NUMERIC := 0.322;
  w_400m_indoor_b NUMERIC := -72.214;
  w_400m_indoor_c NUMERIC := 4043.816;

  -- Women's Outdoor 400m
  w_400m_outdoor_a NUMERIC := 0.335;
  w_400m_outdoor_b NUMERIC := -73.697;
  w_400m_outdoor_c NUMERIC := 4053.155;

  -- Women's 600m indoor/outdoor
  w_600m_indoor_a NUMERIC := 0.106;
  w_600m_indoor_b NUMERIC := -40.468;
  w_600m_indoor_c NUMERIC := 3851.391;
  w_600m_outdoor_a NUMERIC := 0.129;
  w_600m_outdoor_b NUMERIC := -46.439;
  w_600m_outdoor_c NUMERIC := 4179.414;

  -- Women's 800m indoor/outdoor
  w_800m_indoor_a NUMERIC := 0.057;
  w_800m_indoor_b NUMERIC := -30.201;
  w_800m_indoor_c NUMERIC := 3986.457;
  w_800m_outdoor_a NUMERIC := 0.069;
  w_800m_outdoor_b NUMERIC := -34.399;
  w_800m_outdoor_c NUMERIC := 4299.822;

  -- Women's 1000m indoor/outdoor
  w_1000m_indoor_a NUMERIC := 0.035;
  w_1000m_indoor_b NUMERIC := -23.644;
  w_1000m_indoor_c NUMERIC := 4024.137;
  w_1000m_outdoor_a NUMERIC := 0.038;
  w_1000m_outdoor_b NUMERIC := -25.211;
  w_1000m_outdoor_c NUMERIC := 4159.841;

  -- Women's 1500m indoor/outdoor
  w_1500m_indoor_a NUMERIC := 0.014;
  w_1500m_indoor_b NUMERIC := -14.742;
  w_1500m_indoor_c NUMERIC := 3980.259;
  w_1500m_outdoor_a NUMERIC := 0.013;
  w_1500m_outdoor_b NUMERIC := -14.472;
  w_1500m_outdoor_c NUMERIC := 3907.366;

  -- Women's Mile indoor/outdoor
  w_mile_indoor_a NUMERIC := 0.012;
  w_mile_indoor_b NUMERIC := -13.513;
  w_mile_indoor_c NUMERIC := 3955.963;
  w_mile_outdoor_a NUMERIC := 0.012;
  w_mile_outdoor_b NUMERIC := -13.514;
  w_mile_outdoor_c NUMERIC := 3918.992;

  -- Women's 3000m indoor/outdoor
  w_3000m_indoor_a NUMERIC := 0.003;
  w_3000m_indoor_b NUMERIC := -6.216;
  w_3000m_indoor_c NUMERIC := 3729.568;
  w_3000m_outdoor_a NUMERIC := 0.003;
  w_3000m_outdoor_b NUMERIC := -6.094;
  w_3000m_outdoor_c NUMERIC := 3656.128;

  -- Women's 5000m indoor/outdoor
  w_5000m_indoor_a NUMERIC := 0.001;
  w_5000m_indoor_b NUMERIC := -3.465;
  w_5000m_indoor_c NUMERIC := 3638.232;
  w_5000m_outdoor_a NUMERIC := 0.001;
  w_5000m_outdoor_b NUMERIC := -3.394;
  w_5000m_outdoor_c NUMERIC := 3563.262;

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

  w_wt_a NUMERIC := 0.08327943839902037;
  w_wt_b NUMERIC := 58.50175007313704;
  w_wt_c NUMERIC := -142.57755875051402;

BEGIN
  RETURN QUERY
  -- First, identify which meets are indoor (have 60m events)
  WITH indoor_meets AS (
    SELECT DISTINCT r.meet_name, r.date
    FROM results r
    WHERE r.date BETWEEN p_start_date AND p_end_date
      AND r.event_name ~* '^60\s*(Meters?|m|Hurdles?|Meter\s*Hurdles?|mH)'
  ),
  scored AS (
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
      -- Check if this is an indoor meet
      (EXISTS (SELECT 1 FROM indoor_meets im WHERE im.meet_name = r.meet_name AND im.date = r.date)) AS is_indoor,
      r.mark_seconds AS ms,
      r.mark_meters AS mm
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
  with_points AS (
    SELECT
      scored.*,
      GREATEST(0, ROUND(
        CASE
          -- MEN'S 60m (indoor only)
          WHEN scored.gender = 'M' AND scored.event_name ~* '^60\s*(Meters?|m)$' AND scored.ms IS NOT NULL THEN
            m_60m_a * scored.ms * scored.ms + m_60m_b * scored.ms + m_60m_c

          -- MEN'S 200m - use indoor or outdoor based on meet type
          WHEN scored.gender = 'M' AND scored.event_name ~* '^200\s*(Meters?|Meter\s*Dash|m|M)' AND scored.ms IS NOT NULL THEN
            CASE WHEN scored.is_indoor THEN
              m_200m_indoor_a * scored.ms * scored.ms + m_200m_indoor_b * scored.ms + m_200m_indoor_c
            ELSE
              m_200m_outdoor_a * scored.ms * scored.ms + m_200m_outdoor_b * scored.ms + m_200m_outdoor_c
            END

          -- MEN'S 400m - use indoor or outdoor based on meet type
          WHEN scored.gender = 'M' AND scored.event_name ~* '^400\s*(Meters?|Meter\s*Dash|m)' AND scored.ms IS NOT NULL THEN
            CASE WHEN scored.is_indoor THEN
              m_400m_indoor_a * scored.ms * scored.ms + m_400m_indoor_b * scored.ms + m_400m_indoor_c
            ELSE
              m_400m_outdoor_a * scored.ms * scored.ms + m_400m_outdoor_b * scored.ms + m_400m_outdoor_c
            END

          -- MEN'S distance events with indoor/outdoor detection
          WHEN scored.gender = 'M' AND scored.event_name ~* '^600\s*(Meters?|Meter|m)' AND scored.ms IS NOT NULL THEN
            CASE WHEN scored.is_indoor THEN
              m_600m_indoor_a * scored.ms * scored.ms + m_600m_indoor_b * scored.ms + m_600m_indoor_c
            ELSE
              m_600m_outdoor_a * scored.ms * scored.ms + m_600m_outdoor_b * scored.ms + m_600m_outdoor_c
            END
          WHEN scored.gender = 'M' AND scored.event_name ~* '^800\s*(Meters?|Meter\s*Run|m)' AND scored.ms IS NOT NULL THEN
            CASE WHEN scored.is_indoor THEN
              m_800m_indoor_a * scored.ms * scored.ms + m_800m_indoor_b * scored.ms + m_800m_indoor_c
            ELSE
              m_800m_outdoor_a * scored.ms * scored.ms + m_800m_outdoor_b * scored.ms + m_800m_outdoor_c
            END
          WHEN scored.gender = 'M' AND scored.event_name ~* '^1000\s*(Meters?|m)' AND scored.ms IS NOT NULL THEN
            CASE WHEN scored.is_indoor THEN
              m_1000m_indoor_a * scored.ms * scored.ms + m_1000m_indoor_b * scored.ms + m_1000m_indoor_c
            ELSE
              m_1000m_outdoor_a * scored.ms * scored.ms + m_1000m_outdoor_b * scored.ms + m_1000m_outdoor_c
            END
          WHEN scored.gender = 'M' AND scored.event_name ~* '^1500\s*(Meters?|m)' AND scored.ms IS NOT NULL THEN
            CASE WHEN scored.is_indoor THEN
              m_1500m_indoor_a * scored.ms * scored.ms + m_1500m_indoor_b * scored.ms + m_1500m_indoor_c
            ELSE
              m_1500m_outdoor_a * scored.ms * scored.ms + m_1500m_outdoor_b * scored.ms + m_1500m_outdoor_c
            END
          WHEN scored.gender = 'M' AND scored.event_name ~* '(^Mile|^1\s*Mile)' AND scored.ms IS NOT NULL THEN
            CASE WHEN scored.is_indoor THEN
              m_mile_indoor_a * scored.ms * scored.ms + m_mile_indoor_b * scored.ms + m_mile_indoor_c
            ELSE
              m_mile_outdoor_a * scored.ms * scored.ms + m_mile_outdoor_b * scored.ms + m_mile_outdoor_c
            END
          WHEN scored.gender = 'M' AND scored.event_name ~* '^3000\s*(Meters?|m)' AND scored.ms IS NOT NULL THEN
            CASE WHEN scored.is_indoor THEN
              m_3000m_indoor_a * scored.ms * scored.ms + m_3000m_indoor_b * scored.ms + m_3000m_indoor_c
            ELSE
              m_3000m_outdoor_a * scored.ms * scored.ms + m_3000m_outdoor_b * scored.ms + m_3000m_outdoor_c
            END
          WHEN scored.gender = 'M' AND scored.event_name ~* '^5000\s*(Meters?|m)' AND scored.ms IS NOT NULL THEN
            CASE WHEN scored.is_indoor THEN
              m_5000m_indoor_a * scored.ms * scored.ms + m_5000m_indoor_b * scored.ms + m_5000m_indoor_c
            ELSE
              m_5000m_outdoor_a * scored.ms * scored.ms + m_5000m_outdoor_b * scored.ms + m_5000m_outdoor_c
            END
          WHEN scored.gender = 'M' AND scored.event_name ~* '^60\s*(Hurdles?|Meter\s*Hurdles?|mH)' AND scored.ms IS NOT NULL THEN
            m_60mh_a * scored.ms * scored.ms + m_60mh_b * scored.ms + m_60mh_c

          -- MEN'S field events
          WHEN scored.gender = 'M' AND scored.event_name ~* '^High\s*Jump' AND scored.mm IS NOT NULL THEN
            m_hj_a * scored.mm * scored.mm + m_hj_b * scored.mm + m_hj_c
          WHEN scored.gender = 'M' AND scored.event_name ~* '^Pole\s*Vault' AND scored.mm IS NOT NULL THEN
            m_pv_a * scored.mm * scored.mm + m_pv_b * scored.mm + m_pv_c
          WHEN scored.gender = 'M' AND scored.event_name ~* '^Long\s*Jump' AND scored.mm IS NOT NULL THEN
            m_lj_a * scored.mm * scored.mm + m_lj_b * scored.mm + m_lj_c
          WHEN scored.gender = 'M' AND scored.event_name ~* '^Triple\s*Jump' AND scored.mm IS NOT NULL THEN
            m_tj_a * scored.mm * scored.mm + m_tj_b * scored.mm + m_tj_c
          WHEN scored.gender = 'M' AND scored.event_name ~* '^Shot\s*Put' AND scored.mm IS NOT NULL THEN
            m_sp_a * scored.mm * scored.mm + m_sp_b * scored.mm + m_sp_c
          WHEN scored.gender = 'M' AND scored.event_name ~* '^Weight\s*Throw|^WT$' AND scored.mm IS NOT NULL THEN
            m_wt_a * scored.mm * scored.mm + m_wt_b * scored.mm + m_wt_c

          -- WOMEN'S 60m (indoor only)
          WHEN scored.gender = 'F' AND scored.event_name ~* '^60\s*(Meters?|m)$' AND scored.ms IS NOT NULL THEN
            w_60m_a * scored.ms * scored.ms + w_60m_b * scored.ms + w_60m_c

          -- WOMEN'S 200m - use indoor or outdoor based on meet type
          WHEN scored.gender = 'F' AND scored.event_name ~* '^200\s*(Meters?|Meter\s*Dash|m|M)' AND scored.ms IS NOT NULL THEN
            CASE WHEN scored.is_indoor THEN
              w_200m_indoor_a * scored.ms * scored.ms + w_200m_indoor_b * scored.ms + w_200m_indoor_c
            ELSE
              w_200m_outdoor_a * scored.ms * scored.ms + w_200m_outdoor_b * scored.ms + w_200m_outdoor_c
            END

          -- WOMEN'S 400m - use indoor or outdoor based on meet type
          WHEN scored.gender = 'F' AND scored.event_name ~* '^400\s*(Meters?|Meter\s*Dash|m)' AND scored.ms IS NOT NULL THEN
            CASE WHEN scored.is_indoor THEN
              w_400m_indoor_a * scored.ms * scored.ms + w_400m_indoor_b * scored.ms + w_400m_indoor_c
            ELSE
              w_400m_outdoor_a * scored.ms * scored.ms + w_400m_outdoor_b * scored.ms + w_400m_outdoor_c
            END

          -- WOMEN'S distance events with indoor/outdoor detection
          WHEN scored.gender = 'F' AND scored.event_name ~* '^600\s*(Meters?|Meter|m)' AND scored.ms IS NOT NULL THEN
            CASE WHEN scored.is_indoor THEN
              w_600m_indoor_a * scored.ms * scored.ms + w_600m_indoor_b * scored.ms + w_600m_indoor_c
            ELSE
              w_600m_outdoor_a * scored.ms * scored.ms + w_600m_outdoor_b * scored.ms + w_600m_outdoor_c
            END
          WHEN scored.gender = 'F' AND scored.event_name ~* '^800\s*(Meters?|Meter\s*Run|m)' AND scored.ms IS NOT NULL THEN
            CASE WHEN scored.is_indoor THEN
              w_800m_indoor_a * scored.ms * scored.ms + w_800m_indoor_b * scored.ms + w_800m_indoor_c
            ELSE
              w_800m_outdoor_a * scored.ms * scored.ms + w_800m_outdoor_b * scored.ms + w_800m_outdoor_c
            END
          WHEN scored.gender = 'F' AND scored.event_name ~* '^1000\s*(Meters?|m)' AND scored.ms IS NOT NULL THEN
            CASE WHEN scored.is_indoor THEN
              w_1000m_indoor_a * scored.ms * scored.ms + w_1000m_indoor_b * scored.ms + w_1000m_indoor_c
            ELSE
              w_1000m_outdoor_a * scored.ms * scored.ms + w_1000m_outdoor_b * scored.ms + w_1000m_outdoor_c
            END
          WHEN scored.gender = 'F' AND scored.event_name ~* '^1500\s*(Meters?|m)' AND scored.ms IS NOT NULL THEN
            CASE WHEN scored.is_indoor THEN
              w_1500m_indoor_a * scored.ms * scored.ms + w_1500m_indoor_b * scored.ms + w_1500m_indoor_c
            ELSE
              w_1500m_outdoor_a * scored.ms * scored.ms + w_1500m_outdoor_b * scored.ms + w_1500m_outdoor_c
            END
          WHEN scored.gender = 'F' AND scored.event_name ~* '(^Mile|^1\s*Mile)' AND scored.ms IS NOT NULL THEN
            CASE WHEN scored.is_indoor THEN
              w_mile_indoor_a * scored.ms * scored.ms + w_mile_indoor_b * scored.ms + w_mile_indoor_c
            ELSE
              w_mile_outdoor_a * scored.ms * scored.ms + w_mile_outdoor_b * scored.ms + w_mile_outdoor_c
            END
          WHEN scored.gender = 'F' AND scored.event_name ~* '^3000\s*(Meters?|m)' AND scored.ms IS NOT NULL THEN
            CASE WHEN scored.is_indoor THEN
              w_3000m_indoor_a * scored.ms * scored.ms + w_3000m_indoor_b * scored.ms + w_3000m_indoor_c
            ELSE
              w_3000m_outdoor_a * scored.ms * scored.ms + w_3000m_outdoor_b * scored.ms + w_3000m_outdoor_c
            END
          WHEN scored.gender = 'F' AND scored.event_name ~* '^5000\s*(Meters?|m)' AND scored.ms IS NOT NULL THEN
            CASE WHEN scored.is_indoor THEN
              w_5000m_indoor_a * scored.ms * scored.ms + w_5000m_indoor_b * scored.ms + w_5000m_indoor_c
            ELSE
              w_5000m_outdoor_a * scored.ms * scored.ms + w_5000m_outdoor_b * scored.ms + w_5000m_outdoor_c
            END
          WHEN scored.gender = 'F' AND scored.event_name ~* '^60\s*(Hurdles?|Meter\s*Hurdles?|mH)' AND scored.ms IS NOT NULL THEN
            w_60mh_a * scored.ms * scored.ms + w_60mh_b * scored.ms + w_60mh_c

          -- WOMEN'S field events
          WHEN scored.gender = 'F' AND scored.event_name ~* '^High\s*Jump' AND scored.mm IS NOT NULL THEN
            w_hj_a * scored.mm * scored.mm + w_hj_b * scored.mm + w_hj_c
          WHEN scored.gender = 'F' AND scored.event_name ~* '^Pole\s*Vault' AND scored.mm IS NOT NULL THEN
            w_pv_a * scored.mm * scored.mm + w_pv_b * scored.mm + w_pv_c
          WHEN scored.gender = 'F' AND scored.event_name ~* '^Long\s*Jump' AND scored.mm IS NOT NULL THEN
            w_lj_a * scored.mm * scored.mm + w_lj_b * scored.mm + w_lj_c
          WHEN scored.gender = 'F' AND scored.event_name ~* '^Triple\s*Jump' AND scored.mm IS NOT NULL THEN
            w_tj_a * scored.mm * scored.mm + w_tj_b * scored.mm + w_tj_c
          WHEN scored.gender = 'F' AND scored.event_name ~* '^Shot\s*Put' AND scored.mm IS NOT NULL THEN
            w_sp_a * scored.mm * scored.mm + w_sp_b * scored.mm + w_sp_c
          WHEN scored.gender = 'F' AND scored.event_name ~* '^Weight\s*Throw|^WT$' AND scored.mm IS NOT NULL THEN
            w_wt_a * scored.mm * scored.mm + w_wt_b * scored.mm + w_wt_c

          ELSE NULL
        END
      ))::INT AS wa_points
    FROM scored
  ),
  ranked AS (
    SELECT
      with_points.athlete_id,
      with_points.full_name,
      with_points.gender,
      with_points.event_name,
      with_points.mark_raw,
      with_points.ms::NUMERIC AS mark_seconds,
      with_points.mm::NUMERIC AS mark_meters,
      with_points.date,
      with_points.meet_name,
      with_points.meet_id,
      with_points.place,
      with_points.school_name,
      with_points.division,
      with_points.wa_points,
      ROW_NUMBER() OVER (PARTITION BY with_points.athlete_id ORDER BY with_points.wa_points DESC NULLS LAST) as rn
    FROM with_points
    WHERE with_points.wa_points IS NOT NULL
      AND with_points.wa_points > 0
      AND with_points.wa_points <= 1600
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
'Gets top performances with indoor/outdoor detection using official WA 2025 scoring coefficients.
Detects indoor meets by presence of 60m events, then applies appropriate indoor (Short Track) coefficients.
Indoor events generally score higher than outdoor for same time (tighter turns, banked track = harder).
Supports: 200m, 400m, 600m, 800m, 1000m, 1500m, Mile, 3000m, 5000m with indoor/outdoor variants.';
