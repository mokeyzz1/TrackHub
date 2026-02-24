-- Top Performances with CORRECT WA 2025 coefficients, normalized event names, and time bounds
-- Coefficients verified from official World Athletics scoring tables
-- Time bounds added to filter out injury times/invalid marks
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
  -- ===========================================
  -- MEN'S COEFFICIENTS (Official WA 2025)
  -- ===========================================

  -- 60m (indoor only)
  m_60m_a NUMERIC := 68.62032200155772;
  m_60m_b NUMERIC := -1468.376079820242;
  m_60m_c NUMERIC := 7854.923996115336;

  -- 200m indoor/outdoor
  m_200m_indoor_a NUMERIC := 5.0428984333116205;
  m_200m_indoor_b NUMERIC := -363.0051678271411;
  m_200m_indoor_c NUMERIC := 6532.672628951492;
  m_200m_outdoor_a NUMERIC := 5.083329625804254;
  m_200m_outdoor_b NUMERIC := -360.8260380705033;
  m_200m_outdoor_c NUMERIC := 6403.154333221377;

  -- 400m indoor/outdoor
  m_400m_indoor_a NUMERIC := 0.9810285010226494;
  m_400m_indoor_b NUMERIC := -158.13093544779986;
  m_400m_indoor_c NUMERIC := 6372.245446830289;
  m_400m_outdoor_a NUMERIC := 1.0210130425695638;
  m_400m_outdoor_b NUMERIC := -161.3092238081408;
  m_400m_outdoor_c NUMERIC := 6371.289298935095;

  -- 600m indoor/outdoor
  m_600m_indoor_a NUMERIC := 0.3899861152610953;
  m_600m_indoor_b NUMERIC := -102.17335025475768;
  m_600m_indoor_c NUMERIC := 6692.146447579609;
  m_600m_outdoor_a NUMERIC := 0.3856992283143512;
  m_600m_outdoor_b NUMERIC := -99.89240864996827;
  m_600m_outdoor_c NUMERIC := 6467.788691627793;

  -- 800m indoor/outdoor
  m_800m_indoor_a NUMERIC := 0.19739256108073278;
  m_800m_indoor_b NUMERIC := -72.63927638712084;
  m_800m_indoor_c NUMERIC := 6682.6879602972185;
  m_800m_outdoor_a NUMERIC := 0.1980049254166545;
  m_800m_outdoor_b NUMERIC := -72.07136038821409;
  m_800m_outdoor_c NUMERIC := 6558.28160300618;

  -- 1000m indoor/outdoor
  m_1000m_indoor_a NUMERIC := 0.11389778654137217;
  m_1000m_indoor_b NUMERIC := -54.670029751952825;
  m_1000m_indoor_c NUMERIC := 6560.289996561711;
  m_1000m_outdoor_a NUMERIC := 0.11229987246056083;
  m_1000m_outdoor_b NUMERIC := -53.34129687676432;
  m_1000m_outdoor_c NUMERIC := 6334.142779359594;

  -- 1500m indoor/outdoor
  m_1500m_indoor_a NUMERIC := 0.041999988506264074;
  m_1500m_indoor_b NUMERIC := -32.423575703958704;
  m_1500m_indoor_c NUMERIC := 6257.669581143418;
  m_1500m_outdoor_a NUMERIC := 0.04065992529984008;
  m_1500m_outdoor_b NUMERIC := -31.307736299477256;
  m_1500m_outdoor_c NUMERIC := 6026.662254345021;

  -- Mile indoor/outdoor
  m_mile_indoor_a NUMERIC := 0.036900007414912395;
  m_mile_indoor_b NUMERIC := -30.626657725760197;
  m_mile_indoor_c NUMERIC := 6354.958031052956;
  m_mile_outdoor_a NUMERIC := 0.035099677603458446;
  m_mile_outdoor_b NUMERIC := -29.132456259137143;
  m_mile_outdoor_c NUMERIC := 6044.924547011615;

  -- 3000m indoor/outdoor
  m_3000m_indoor_a NUMERIC := 0.00832191917227365;
  m_3000m_indoor_b NUMERIC := -13.980775520668885;
  m_3000m_indoor_c NUMERIC := 5871.90250552597;
  m_3000m_outdoor_a NUMERIC := 0.008150049932713843;
  m_3000m_outdoor_b NUMERIC := -13.691983542337312;
  m_3000m_outdoor_c NUMERIC := 5750.59246378555;

  -- 5000m indoor/outdoor
  m_5000m_indoor_a NUMERIC := 0.002900003148620267;
  m_5000m_indoor_b NUMERIC := -8.351976844926412;
  m_5000m_indoor_c NUMERIC := 6013.40053571912;
  m_5000m_outdoor_a NUMERIC := 0.002777997945427213;
  m_5000m_outdoor_b NUMERIC := -8.000608112196687;
  m_5000m_outdoor_c NUMERIC := 5760.418712362531;

  -- 60m Hurdles (indoor only)
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

  -- Weight Throw (not in official WA tables, using derived coefficients)
  m_wt_a NUMERIC := 0.0028444950947790204;
  m_wt_b NUMERIC := 15.081627308136717;
  m_wt_c NUMERIC := -21.68901198504136;

  -- ===========================================
  -- WOMEN'S COEFFICIENTS (Official WA 2025)
  -- ===========================================

  -- 60m (indoor only)
  w_60m_a NUMERIC := 24.91177544269476;
  w_60m_b NUMERIC := -697.4127036580539;
  w_60m_c NUMERIC := 4880.84062414919;

  -- 200m indoor/outdoor
  w_200m_indoor_a NUMERIC := 1.9617476310046413;
  w_200m_indoor_b NUMERIC := -186.35304547847045;
  w_200m_indoor_c NUMERIC := 4425.540362004947;
  w_200m_outdoor_a NUMERIC := 2.2422237149162925;
  w_200m_outdoor_b NUMERIC := -204.01464451534775;
  w_200m_outdoor_c NUMERIC := 4640.727341804304;

  -- 400m indoor/outdoor
  w_400m_indoor_a NUMERIC := 0.32239778088712256;
  w_400m_indoor_b NUMERIC := -72.2140857003651;
  w_400m_indoor_c NUMERIC := 4043.8163995789655;
  w_400m_outdoor_a NUMERIC := 0.3350059758445596;
  w_400m_outdoor_b NUMERIC := -73.6974469594461;
  w_400m_outdoor_c NUMERIC := 4053.1545244171575;

  -- 600m indoor/outdoor
  w_600m_indoor_a NUMERIC := 0.10630096102938147;
  w_600m_indoor_b NUMERIC := -40.4675585171226;
  w_600m_indoor_c NUMERIC := 3851.3911703779886;
  w_600m_outdoor_a NUMERIC := 0.1290024817337887;
  w_600m_outdoor_b NUMERIC := -46.439367295225566;
  w_600m_outdoor_c NUMERIC := 4179.4139537496085;

  -- 800m indoor/outdoor
  w_800m_indoor_a NUMERIC := 0.05719995663858857;
  w_800m_indoor_b NUMERIC := -30.201001015322618;
  w_800m_indoor_c NUMERIC := 3986.4574604244845;
  w_800m_outdoor_a NUMERIC := 0.06879989341997295;
  w_800m_outdoor_b NUMERIC := -34.399261916380055;
  w_800m_outdoor_c NUMERIC := 4299.822125108796;

  -- 1000m indoor/outdoor
  w_1000m_indoor_a NUMERIC := 0.034730273669098644;
  w_1000m_indoor_b NUMERIC := -23.643965410011788;
  w_1000m_indoor_c NUMERIC := 4024.137096635415;
  w_1000m_outdoor_a NUMERIC := 0.038199708533426247;
  w_1000m_outdoor_b NUMERIC := -25.211487793783817;
  w_1000m_outdoor_c NUMERIC := 4159.840558573429;

  -- 1500m indoor/outdoor
  w_1500m_indoor_a NUMERIC := 0.013649954143477805;
  w_1500m_indoor_b NUMERIC := -14.741826462372728;
  w_1500m_indoor_c NUMERIC := 3980.259331609617;
  w_1500m_outdoor_a NUMERIC := 0.01339999627048627;
  w_1500m_outdoor_b NUMERIC := -14.471861176560651;
  w_1500m_outdoor_c NUMERIC := 3907.3655835949467;

  -- Mile indoor/outdoor
  w_mile_indoor_a NUMERIC := 0.011540015186639607;
  w_mile_indoor_b NUMERIC := -13.513232952897397;
  w_mile_indoor_c NUMERIC := 3955.963356088527;
  w_mile_outdoor_a NUMERIC := 0.011649998601839462;
  w_mile_outdoor_b NUMERIC := -13.513881163102496;
  w_mile_outdoor_c NUMERIC := 3918.992004961794;

  -- 3000m indoor/outdoor
  w_3000m_indoor_a NUMERIC := 0.002590000537161685;
  w_3000m_indoor_b NUMERIC := -6.215973858107134;
  w_3000m_indoor_c NUMERIC := 3729.5683351015323;
  w_3000m_outdoor_a NUMERIC := 0.0025389974609562604;
  w_3000m_outdoor_b NUMERIC := -6.09357042856243;
  w_3000m_outdoor_c NUMERIC := 3656.127933666052;

  -- 5000m indoor/outdoor
  w_5000m_indoor_a NUMERIC := 0.00082499992965758;
  w_5000m_indoor_b NUMERIC := -3.464991324219369;
  w_5000m_indoor_c NUMERIC := 3638.23229190876;
  w_5000m_outdoor_a NUMERIC := 0.0008079992470730324;
  w_5000m_outdoor_b NUMERIC := -3.3935897885437782;
  w_5000m_outdoor_c NUMERIC := 3563.2616780022654;

  -- 60m Hurdles (indoor only)
  w_60mh_a NUMERIC := 11.16828188896136;
  w_60mh_b NUMERIC := -406.39148481091615;
  w_60mh_c NUMERIC := 3696.9522386075114;

  -- Field events (same indoor/outdoor)
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

  -- Weight Throw (not in official WA tables, using derived coefficients)
  w_wt_a NUMERIC := 0.0030967239667614166;
  w_wt_b NUMERIC := 15.730166876520684;
  w_wt_c NUMERIC := -22.699498543297523;

  -- ===========================================
  -- TIME BOUNDS (to filter injury times)
  -- ===========================================
  -- Men's max times
  max_m_60m NUMERIC := 12;
  max_m_200m NUMERIC := 35;
  max_m_400m NUMERIC := 75;
  max_m_600m NUMERIC := 120;
  max_m_800m NUMERIC := 180;
  max_m_1000m NUMERIC := 240;
  max_m_1500m NUMERIC := 330;
  max_m_mile NUMERIC := 360;
  max_m_3000m NUMERIC := 720;
  max_m_5000m NUMERIC := 1200;
  max_m_60mh NUMERIC := 15;

  -- Women's max times (slightly more generous)
  max_w_60m NUMERIC := 13;
  max_w_200m NUMERIC := 40;
  max_w_400m NUMERIC := 85;
  max_w_600m NUMERIC := 140;
  max_w_800m NUMERIC := 200;
  max_w_1000m NUMERIC := 270;
  max_w_1500m NUMERIC := 380;
  max_w_mile NUMERIC := 420;
  max_w_3000m NUMERIC := 840;
  max_w_5000m NUMERIC := 1380;
  max_w_60mh NUMERIC := 18;

  -- Field event minimums
  min_hj NUMERIC := 1.0;
  min_pv NUMERIC := 2.0;
  min_lj NUMERIC := 3.0;
  min_m_tj NUMERIC := 8.0;
  min_w_tj NUMERIC := 7.0;
  min_sp NUMERIC := 5.0;
  min_wt NUMERIC := 5.0;

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
      r.event_name AS raw_event_name,
      -- Normalize event name for display
      CASE
        WHEN r.event_name ~* '^60\s*(Meters?|m)$' THEN '60 Meters'
        WHEN r.event_name ~* '^200\s*(Meters?|Meter\s*Dash|m|M)' THEN '200 Meters'
        WHEN r.event_name ~* '^400\s*(Meters?|Meter\s*Dash|m)' THEN '400 Meters'
        WHEN r.event_name ~* '^600\s*(Meters?|Meter|m|Yards?)' THEN '600 Meters'
        WHEN r.event_name ~* '^800\s*(Meters?|Meter\s*Run|m)' THEN '800 Meters'
        WHEN r.event_name ~* '^1000\s*(Meters?|m)' THEN '1000 Meters'
        WHEN r.event_name ~* '^1500\s*(Meters?|m)' THEN '1500 Meters'
        WHEN r.event_name ~* '(^Mile|^1\s*Mile)' THEN 'Mile'
        WHEN r.event_name ~* '^3000\s*(Meters?|m)' THEN '3000 Meters'
        WHEN r.event_name ~* '^5000\s*(Meters?|m)' THEN '5000 Meters'
        WHEN r.event_name ~* '^60\s*(Hurdles?|Meter\s*Hurdles?|mH|m\s*H)' THEN '60 Hurdles'
        WHEN r.event_name ~* '^High\s*Jump' THEN 'High Jump'
        WHEN r.event_name ~* '^Pole\s*Vault' THEN 'Pole Vault'
        WHEN r.event_name ~* '^Long\s*Jump' THEN 'Long Jump'
        WHEN r.event_name ~* '^Triple\s*Jump' THEN 'Triple Jump'
        WHEN r.event_name ~* '^Shot\s*Put' THEN 'Shot Put'
        WHEN r.event_name ~* '^Weight\s*Throw|^WT$' THEN 'Weight Throw'
        ELSE r.event_name
      END::TEXT AS normalized_event_name,
      r.mark_raw::TEXT,
      r.mark_seconds::NUMERIC,
      r.mark_meters::NUMERIC,
      r.date::DATE,
      r.meet_name::TEXT,
      r.meet_id::INT,
      r.place::SMALLINT,
      s.official_name::TEXT AS school_name,
      s.division::TEXT,
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
          -- MEN'S 60m (indoor only) with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^60\s*(Meters?|m)$'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_60m THEN
            m_60m_a * scored.ms * scored.ms + m_60m_b * scored.ms + m_60m_c

          -- MEN'S 200m with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^200\s*(Meters?|Meter\s*Dash|m|M)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_200m THEN
            CASE WHEN scored.is_indoor THEN
              m_200m_indoor_a * scored.ms * scored.ms + m_200m_indoor_b * scored.ms + m_200m_indoor_c
            ELSE
              m_200m_outdoor_a * scored.ms * scored.ms + m_200m_outdoor_b * scored.ms + m_200m_outdoor_c
            END

          -- MEN'S 400m with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^400\s*(Meters?|Meter\s*Dash|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_400m THEN
            CASE WHEN scored.is_indoor THEN
              m_400m_indoor_a * scored.ms * scored.ms + m_400m_indoor_b * scored.ms + m_400m_indoor_c
            ELSE
              m_400m_outdoor_a * scored.ms * scored.ms + m_400m_outdoor_b * scored.ms + m_400m_outdoor_c
            END

          -- MEN'S 600m with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^600\s*(Meters?|Meter|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_600m THEN
            CASE WHEN scored.is_indoor THEN
              m_600m_indoor_a * scored.ms * scored.ms + m_600m_indoor_b * scored.ms + m_600m_indoor_c
            ELSE
              m_600m_outdoor_a * scored.ms * scored.ms + m_600m_outdoor_b * scored.ms + m_600m_outdoor_c
            END

          -- MEN'S 800m with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^800\s*(Meters?|Meter\s*Run|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_800m THEN
            CASE WHEN scored.is_indoor THEN
              m_800m_indoor_a * scored.ms * scored.ms + m_800m_indoor_b * scored.ms + m_800m_indoor_c
            ELSE
              m_800m_outdoor_a * scored.ms * scored.ms + m_800m_outdoor_b * scored.ms + m_800m_outdoor_c
            END

          -- MEN'S 1000m with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^1000\s*(Meters?|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_1000m THEN
            CASE WHEN scored.is_indoor THEN
              m_1000m_indoor_a * scored.ms * scored.ms + m_1000m_indoor_b * scored.ms + m_1000m_indoor_c
            ELSE
              m_1000m_outdoor_a * scored.ms * scored.ms + m_1000m_outdoor_b * scored.ms + m_1000m_outdoor_c
            END

          -- MEN'S 1500m with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^1500\s*(Meters?|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_1500m THEN
            CASE WHEN scored.is_indoor THEN
              m_1500m_indoor_a * scored.ms * scored.ms + m_1500m_indoor_b * scored.ms + m_1500m_indoor_c
            ELSE
              m_1500m_outdoor_a * scored.ms * scored.ms + m_1500m_outdoor_b * scored.ms + m_1500m_outdoor_c
            END

          -- MEN'S Mile with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '(^Mile|^1\s*Mile)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_mile THEN
            CASE WHEN scored.is_indoor THEN
              m_mile_indoor_a * scored.ms * scored.ms + m_mile_indoor_b * scored.ms + m_mile_indoor_c
            ELSE
              m_mile_outdoor_a * scored.ms * scored.ms + m_mile_outdoor_b * scored.ms + m_mile_outdoor_c
            END

          -- MEN'S 3000m with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^3000\s*(Meters?|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_3000m THEN
            CASE WHEN scored.is_indoor THEN
              m_3000m_indoor_a * scored.ms * scored.ms + m_3000m_indoor_b * scored.ms + m_3000m_indoor_c
            ELSE
              m_3000m_outdoor_a * scored.ms * scored.ms + m_3000m_outdoor_b * scored.ms + m_3000m_outdoor_c
            END

          -- MEN'S 5000m with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^5000\s*(Meters?|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_5000m THEN
            CASE WHEN scored.is_indoor THEN
              m_5000m_indoor_a * scored.ms * scored.ms + m_5000m_indoor_b * scored.ms + m_5000m_indoor_c
            ELSE
              m_5000m_outdoor_a * scored.ms * scored.ms + m_5000m_outdoor_b * scored.ms + m_5000m_outdoor_c
            END

          -- MEN'S 60m Hurdles with time bound
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^60\s*(Hurdles?|Meter\s*Hurdles?|mH|m\s*H)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_m_60mh THEN
            m_60mh_a * scored.ms * scored.ms + m_60mh_b * scored.ms + m_60mh_c

          -- MEN'S field events with distance bounds
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^High\s*Jump'
               AND scored.mm IS NOT NULL AND scored.mm >= min_hj THEN
            m_hj_a * scored.mm * scored.mm + m_hj_b * scored.mm + m_hj_c
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^Pole\s*Vault'
               AND scored.mm IS NOT NULL AND scored.mm >= min_pv THEN
            m_pv_a * scored.mm * scored.mm + m_pv_b * scored.mm + m_pv_c
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^Long\s*Jump'
               AND scored.mm IS NOT NULL AND scored.mm >= min_lj THEN
            m_lj_a * scored.mm * scored.mm + m_lj_b * scored.mm + m_lj_c
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^Triple\s*Jump'
               AND scored.mm IS NOT NULL AND scored.mm >= min_m_tj THEN
            m_tj_a * scored.mm * scored.mm + m_tj_b * scored.mm + m_tj_c
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^Shot\s*Put'
               AND scored.mm IS NOT NULL AND scored.mm >= min_sp THEN
            m_sp_a * scored.mm * scored.mm + m_sp_b * scored.mm + m_sp_c
          WHEN scored.gender = 'M' AND scored.raw_event_name ~* '^Weight\s*Throw|^WT$'
               AND scored.mm IS NOT NULL AND scored.mm >= min_wt THEN
            m_wt_a * scored.mm * scored.mm + m_wt_b * scored.mm + m_wt_c

          -- WOMEN'S 60m (indoor only) with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^60\s*(Meters?|m)$'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_60m THEN
            w_60m_a * scored.ms * scored.ms + w_60m_b * scored.ms + w_60m_c

          -- WOMEN'S 200m with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^200\s*(Meters?|Meter\s*Dash|m|M)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_200m THEN
            CASE WHEN scored.is_indoor THEN
              w_200m_indoor_a * scored.ms * scored.ms + w_200m_indoor_b * scored.ms + w_200m_indoor_c
            ELSE
              w_200m_outdoor_a * scored.ms * scored.ms + w_200m_outdoor_b * scored.ms + w_200m_outdoor_c
            END

          -- WOMEN'S 400m with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^400\s*(Meters?|Meter\s*Dash|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_400m THEN
            CASE WHEN scored.is_indoor THEN
              w_400m_indoor_a * scored.ms * scored.ms + w_400m_indoor_b * scored.ms + w_400m_indoor_c
            ELSE
              w_400m_outdoor_a * scored.ms * scored.ms + w_400m_outdoor_b * scored.ms + w_400m_outdoor_c
            END

          -- WOMEN'S 600m with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^600\s*(Meters?|Meter|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_600m THEN
            CASE WHEN scored.is_indoor THEN
              w_600m_indoor_a * scored.ms * scored.ms + w_600m_indoor_b * scored.ms + w_600m_indoor_c
            ELSE
              w_600m_outdoor_a * scored.ms * scored.ms + w_600m_outdoor_b * scored.ms + w_600m_outdoor_c
            END

          -- WOMEN'S 800m with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^800\s*(Meters?|Meter\s*Run|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_800m THEN
            CASE WHEN scored.is_indoor THEN
              w_800m_indoor_a * scored.ms * scored.ms + w_800m_indoor_b * scored.ms + w_800m_indoor_c
            ELSE
              w_800m_outdoor_a * scored.ms * scored.ms + w_800m_outdoor_b * scored.ms + w_800m_outdoor_c
            END

          -- WOMEN'S 1000m with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^1000\s*(Meters?|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_1000m THEN
            CASE WHEN scored.is_indoor THEN
              w_1000m_indoor_a * scored.ms * scored.ms + w_1000m_indoor_b * scored.ms + w_1000m_indoor_c
            ELSE
              w_1000m_outdoor_a * scored.ms * scored.ms + w_1000m_outdoor_b * scored.ms + w_1000m_outdoor_c
            END

          -- WOMEN'S 1500m with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^1500\s*(Meters?|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_1500m THEN
            CASE WHEN scored.is_indoor THEN
              w_1500m_indoor_a * scored.ms * scored.ms + w_1500m_indoor_b * scored.ms + w_1500m_indoor_c
            ELSE
              w_1500m_outdoor_a * scored.ms * scored.ms + w_1500m_outdoor_b * scored.ms + w_1500m_outdoor_c
            END

          -- WOMEN'S Mile with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '(^Mile|^1\s*Mile)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_mile THEN
            CASE WHEN scored.is_indoor THEN
              w_mile_indoor_a * scored.ms * scored.ms + w_mile_indoor_b * scored.ms + w_mile_indoor_c
            ELSE
              w_mile_outdoor_a * scored.ms * scored.ms + w_mile_outdoor_b * scored.ms + w_mile_outdoor_c
            END

          -- WOMEN'S 3000m with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^3000\s*(Meters?|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_3000m THEN
            CASE WHEN scored.is_indoor THEN
              w_3000m_indoor_a * scored.ms * scored.ms + w_3000m_indoor_b * scored.ms + w_3000m_indoor_c
            ELSE
              w_3000m_outdoor_a * scored.ms * scored.ms + w_3000m_outdoor_b * scored.ms + w_3000m_outdoor_c
            END

          -- WOMEN'S 5000m with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^5000\s*(Meters?|m)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_5000m THEN
            CASE WHEN scored.is_indoor THEN
              w_5000m_indoor_a * scored.ms * scored.ms + w_5000m_indoor_b * scored.ms + w_5000m_indoor_c
            ELSE
              w_5000m_outdoor_a * scored.ms * scored.ms + w_5000m_outdoor_b * scored.ms + w_5000m_outdoor_c
            END

          -- WOMEN'S 60m Hurdles with time bound
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^60\s*(Hurdles?|Meter\s*Hurdles?|mH|m\s*H)'
               AND scored.ms IS NOT NULL AND scored.ms <= max_w_60mh THEN
            w_60mh_a * scored.ms * scored.ms + w_60mh_b * scored.ms + w_60mh_c

          -- WOMEN'S field events with distance bounds
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^High\s*Jump'
               AND scored.mm IS NOT NULL AND scored.mm >= min_hj THEN
            w_hj_a * scored.mm * scored.mm + w_hj_b * scored.mm + w_hj_c
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^Pole\s*Vault'
               AND scored.mm IS NOT NULL AND scored.mm >= min_pv THEN
            w_pv_a * scored.mm * scored.mm + w_pv_b * scored.mm + w_pv_c
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^Long\s*Jump'
               AND scored.mm IS NOT NULL AND scored.mm >= min_lj THEN
            w_lj_a * scored.mm * scored.mm + w_lj_b * scored.mm + w_lj_c
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^Triple\s*Jump'
               AND scored.mm IS NOT NULL AND scored.mm >= min_w_tj THEN
            w_tj_a * scored.mm * scored.mm + w_tj_b * scored.mm + w_tj_c
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^Shot\s*Put'
               AND scored.mm IS NOT NULL AND scored.mm >= min_sp THEN
            w_sp_a * scored.mm * scored.mm + w_sp_b * scored.mm + w_sp_c
          WHEN scored.gender = 'F' AND scored.raw_event_name ~* '^Weight\s*Throw|^WT$'
               AND scored.mm IS NOT NULL AND scored.mm >= min_wt THEN
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
      with_points.normalized_event_name AS event_name,
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
      AND with_points.wa_points <= 1400
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
'Gets top performances with Official WA 2025 coefficients + time bounds.
Features:
- Indoor/outdoor coefficients (based on 60m events in meet)
- Normalized event names (200 Meter Dash Invite → 200 Meters)
- Time bounds to filter injury times (51s 200m filtered out)
- Points capped at 1400

Time bounds: 60m(12/13s), 200m(35/40s), 400m(75/85s), etc.
Field minimums: HJ(1m), PV(2m), LJ(3m), etc.

Usage: SELECT * FROM get_top_performances(start_date, end_date, division, gender, limit)';
