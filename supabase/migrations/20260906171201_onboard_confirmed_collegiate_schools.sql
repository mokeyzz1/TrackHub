-- Add the confirmed collegiate institutions absent from the canonical catalog.
-- This is reference-catalog onboarding only: no athlete, result, relay, or meet fact is changed.
-- Exact TFRRS gender URLs and source keys are retained so future ingestion resolves deterministically.
-- NWAC is its own collegiate association and must not be mislabeled as NJCAA.
-- Source review: TFRRS team pages; official NWAC member list; NCAA directory; NJCAA directory;
-- current NCCAA member pages; Madera Community College's official catalog.

INSERT INTO public.divisions (code, display_name, governing_body, sort_order, classification_kind)
SELECT 'NWAC', 'Northwest Athletic Conference', 'NWAC',
       COALESCE((SELECT max(sort_order) + 1 FROM public.divisions), 1), 'association'
WHERE NOT EXISTS (SELECT 1 FROM public.divisions WHERE code = 'NWAC');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.divisions
    WHERE code = 'NWAC'
      AND (display_name <> 'Northwest Athletic Conference'
           OR governing_body <> 'NWAC'
           OR classification_kind <> 'association')
  ) THEN
    RAISE EXCEPTION 'Existing NWAC division row has conflicting semantics';
  END IF;
END $$;

WITH desired (official_name, short_name, city, state, division_code) AS (
  VALUES
    ('American River College', 'American River', 'Sacramento', 'CA', 'CCCAA'),
    ('Butte College', 'Butte', 'Oroville', 'CA', 'CCCAA'),
    ('Chabot College', 'Chabot', 'Hayward', 'CA', 'CCCAA'),
    ('Champion Christian College', 'Champion Christian', 'Hot Springs', 'AR', 'NCCAA-I'),
    ('Clackamas Community College', 'Clackamas CC', 'Oregon City', 'OR', 'NWAC'),
    ('Clark College', 'Clark College', 'Vancouver', 'WA', 'NWAC'),
    ('Clovis Community College', 'Clovis CC', 'Fresno', 'CA', 'CCCAA'),
    ('Colorado Mountain College', 'Colorado Mountain', 'Glenwood Springs', 'CO', 'NJCAA'),
    ('Colorado Northwestern Community College', 'Colorado Northwestern CC', 'Rangely', 'CO', 'NJCAA'),
    ('Dallas Christian College', 'Dallas Christian', 'Farmers Branch', 'TX', 'NCCAA-II'),
    ('De Anza College', 'De Anza', 'Cupertino', 'CA', 'CCCAA'),
    ('Diablo Valley College', 'Diablo Valley', 'Pleasant Hill', 'CA', 'CCCAA'),
    ('Dine College', 'Dine College', 'Tsaile', 'AZ', 'NJCAA'),
    ('Everett Community College', 'Everett CC', 'Everett', 'WA', 'NWAC'),
    ('Faith Baptist Bible College', 'Faith Baptist Bible', 'Ankeny', 'IA', 'NCCAA-II'),
    ('University of Fort Lauderdale', 'Fort Lauderdale', 'Lauderhill', 'FL', 'NCCAA-I'),
    ('Fresno City College', 'Fresno', 'Fresno', 'CA', 'CCCAA'),
    ('Green River College', 'Green River', 'Auburn', 'WA', 'NWAC'),
    ('Hartnell College', 'Hartnell', 'Salinas', 'CA', 'CCCAA'),
    ('Johnson & Wales University Charlotte', 'Johnson & Wales (N.C.)', 'Charlotte', 'NC', 'DIII'),
    ('Lake Tahoe Community College', 'Lake Tahoe', 'South Lake Tahoe', 'CA', 'CCCAA'),
    ('Lane Community College', 'Lane CC', 'Eugene', 'OR', 'NWAC'),
    ('Madera Community College', 'Madera CC', 'Madera', 'CA', 'CCCAA'),
    ('Merritt College', 'Merritt', 'Oakland', 'CA', 'CCCAA'),
    ('Modesto Junior College', 'Modesto', 'Modesto', 'CA', 'CCCAA'),
    ('Monterey Peninsula College', 'Monterey Peninsula', 'Monterey', 'CA', 'CCCAA'),
    ('Mt. Hood Community College', 'Mt. Hood CC', 'Gresham', 'OR', 'NWAC'),
    ('North American University', 'North American', 'Stafford', 'TX', 'NAIA'),
    ('NorthWest Arkansas Community College', 'NorthWest Arkansas CC', 'Bentonville', 'AR', 'NJCAA'),
    ('Pierce College', 'Pierce College (WA)', 'Lakewood', 'WA', 'NWAC'),
    ('Penn State Fayette, The Eberly Campus', 'PSU-Fayette', 'Lemont Furnace', 'PA', 'USCAA'),
    ('Penn State Scranton', 'PSU-Scranton', 'Dunmore', 'PA', 'USCAA'),
    ('College of the Redwoods', 'Redwoods', 'Eureka', 'CA', 'CCCAA'),
    ('Roane State Community College', 'Roane State', 'Harriman', 'TN', 'NJCAA'),
    ('Sacramento City College', 'Sacramento', 'Sacramento', 'CA', 'CCCAA'),
    ('San Joaquin Delta College', 'San Joaquin Delta', 'Stockton', 'CA', 'CCCAA'),
    ('San Jose City College', 'San Jose', 'San Jose', 'CA', 'CCCAA'),
    ('College of San Mateo', 'San Mateo', 'San Mateo', 'CA', 'CCCAA'),
    ('Santa Rosa Junior College', 'Santa Rosa', 'Santa Rosa', 'CA', 'CCCAA'),
    ('College of the Sequoias', 'Sequoias', 'Visalia', 'CA', 'CCCAA'),
    ('Shasta College', 'Shasta', 'Redding', 'CA', 'CCCAA'),
    ('Southwestern Oregon Community College', 'SW Oregon CC', 'Coos Bay', 'OR', 'NWAC'),
    ('Texas Southmost College', 'Texas Southmost', 'Brownsville', 'TX', 'NJCAA'),
    ('University of Arkansas - Fort Smith', 'UA-Fort Smith', 'Fort Smith', 'AR', 'DII'),
    ('United States Sports University', 'USSU', 'Daphne', 'AL', 'NAIA'),
    ('University of Valley Forge', 'Valley Forge', 'Phoenixville', 'PA', 'DIII'),
    ('Vaughn College of Aeronautics and Technology', 'Vaughn', 'Flushing', 'NY', 'USCAA'),
    ('Victoria College', 'Victoria College', 'Victoria', 'TX', 'NJCAA'),
    ('Walters State Community College', 'Walters State CC', 'Morristown', 'TN', 'NJCAA'),
    ('Yuba College', 'Yuba', 'Marysville', 'CA', 'CCCAA')
)
INSERT INTO public.schools (
  official_name, short_name, city, state, division, division_id, institution_type, is_active
)
SELECT d.official_name, d.short_name, d.city, d.state, d.division_code,
       v.division_id, 'collegiate', true
FROM desired d
JOIN public.divisions v ON v.code = d.division_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.schools s WHERE lower(s.official_name) = lower(d.official_name)
);

DO $$
DECLARE missing_count integer;
BEGIN
  WITH desired (official_name, short_name, city, state, division_code) AS (
    VALUES
    ('American River College', 'American River', 'Sacramento', 'CA', 'CCCAA'),
    ('Butte College', 'Butte', 'Oroville', 'CA', 'CCCAA'),
    ('Chabot College', 'Chabot', 'Hayward', 'CA', 'CCCAA'),
    ('Champion Christian College', 'Champion Christian', 'Hot Springs', 'AR', 'NCCAA-I'),
    ('Clackamas Community College', 'Clackamas CC', 'Oregon City', 'OR', 'NWAC'),
    ('Clark College', 'Clark College', 'Vancouver', 'WA', 'NWAC'),
    ('Clovis Community College', 'Clovis CC', 'Fresno', 'CA', 'CCCAA'),
    ('Colorado Mountain College', 'Colorado Mountain', 'Glenwood Springs', 'CO', 'NJCAA'),
    ('Colorado Northwestern Community College', 'Colorado Northwestern CC', 'Rangely', 'CO', 'NJCAA'),
    ('Dallas Christian College', 'Dallas Christian', 'Farmers Branch', 'TX', 'NCCAA-II'),
    ('De Anza College', 'De Anza', 'Cupertino', 'CA', 'CCCAA'),
    ('Diablo Valley College', 'Diablo Valley', 'Pleasant Hill', 'CA', 'CCCAA'),
    ('Dine College', 'Dine College', 'Tsaile', 'AZ', 'NJCAA'),
    ('Everett Community College', 'Everett CC', 'Everett', 'WA', 'NWAC'),
    ('Faith Baptist Bible College', 'Faith Baptist Bible', 'Ankeny', 'IA', 'NCCAA-II'),
    ('University of Fort Lauderdale', 'Fort Lauderdale', 'Lauderhill', 'FL', 'NCCAA-I'),
    ('Fresno City College', 'Fresno', 'Fresno', 'CA', 'CCCAA'),
    ('Green River College', 'Green River', 'Auburn', 'WA', 'NWAC'),
    ('Hartnell College', 'Hartnell', 'Salinas', 'CA', 'CCCAA'),
    ('Johnson & Wales University Charlotte', 'Johnson & Wales (N.C.)', 'Charlotte', 'NC', 'DIII'),
    ('Lake Tahoe Community College', 'Lake Tahoe', 'South Lake Tahoe', 'CA', 'CCCAA'),
    ('Lane Community College', 'Lane CC', 'Eugene', 'OR', 'NWAC'),
    ('Madera Community College', 'Madera CC', 'Madera', 'CA', 'CCCAA'),
    ('Merritt College', 'Merritt', 'Oakland', 'CA', 'CCCAA'),
    ('Modesto Junior College', 'Modesto', 'Modesto', 'CA', 'CCCAA'),
    ('Monterey Peninsula College', 'Monterey Peninsula', 'Monterey', 'CA', 'CCCAA'),
    ('Mt. Hood Community College', 'Mt. Hood CC', 'Gresham', 'OR', 'NWAC'),
    ('North American University', 'North American', 'Stafford', 'TX', 'NAIA'),
    ('NorthWest Arkansas Community College', 'NorthWest Arkansas CC', 'Bentonville', 'AR', 'NJCAA'),
    ('Pierce College', 'Pierce College (WA)', 'Lakewood', 'WA', 'NWAC'),
    ('Penn State Fayette, The Eberly Campus', 'PSU-Fayette', 'Lemont Furnace', 'PA', 'USCAA'),
    ('Penn State Scranton', 'PSU-Scranton', 'Dunmore', 'PA', 'USCAA'),
    ('College of the Redwoods', 'Redwoods', 'Eureka', 'CA', 'CCCAA'),
    ('Roane State Community College', 'Roane State', 'Harriman', 'TN', 'NJCAA'),
    ('Sacramento City College', 'Sacramento', 'Sacramento', 'CA', 'CCCAA'),
    ('San Joaquin Delta College', 'San Joaquin Delta', 'Stockton', 'CA', 'CCCAA'),
    ('San Jose City College', 'San Jose', 'San Jose', 'CA', 'CCCAA'),
    ('College of San Mateo', 'San Mateo', 'San Mateo', 'CA', 'CCCAA'),
    ('Santa Rosa Junior College', 'Santa Rosa', 'Santa Rosa', 'CA', 'CCCAA'),
    ('College of the Sequoias', 'Sequoias', 'Visalia', 'CA', 'CCCAA'),
    ('Shasta College', 'Shasta', 'Redding', 'CA', 'CCCAA'),
    ('Southwestern Oregon Community College', 'SW Oregon CC', 'Coos Bay', 'OR', 'NWAC'),
    ('Texas Southmost College', 'Texas Southmost', 'Brownsville', 'TX', 'NJCAA'),
    ('University of Arkansas - Fort Smith', 'UA-Fort Smith', 'Fort Smith', 'AR', 'DII'),
    ('United States Sports University', 'USSU', 'Daphne', 'AL', 'NAIA'),
    ('University of Valley Forge', 'Valley Forge', 'Phoenixville', 'PA', 'DIII'),
    ('Vaughn College of Aeronautics and Technology', 'Vaughn', 'Flushing', 'NY', 'USCAA'),
    ('Victoria College', 'Victoria College', 'Victoria', 'TX', 'NJCAA'),
    ('Walters State Community College', 'Walters State CC', 'Morristown', 'TN', 'NJCAA'),
    ('Yuba College', 'Yuba', 'Marysville', 'CA', 'CCCAA')
  )
  SELECT count(*) INTO missing_count
  FROM desired d
  LEFT JOIN public.schools s ON lower(s.official_name) = lower(d.official_name)
  LEFT JOIN public.divisions v ON v.code = d.division_code
  WHERE s.school_id IS NULL
     OR v.division_id IS NULL
     OR s.division_id IS DISTINCT FROM v.division_id
     OR s.division IS DISTINCT FROM d.division_code
     OR s.institution_type IS DISTINCT FROM 'collegiate'
     OR s.state IS DISTINCT FROM d.state;
  IF missing_count <> 0 THEN
    RAISE EXCEPTION '% desired collegiate schools are missing or conflict with reviewed identity', missing_count;
  END IF;
END $$;

WITH desired (official_name, source_name, gender, source_key, source_url) AS (
  VALUES
    ('American River College', 'AMERICAN RIVER', 'F', 'American_River', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_American_River.html'),
    ('American River College', 'AMERICAN RIVER', 'M', 'American_River', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_American_River.html'),
    ('Butte College', 'BUTTE', 'F', 'Butte', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Butte.html'),
    ('Butte College', 'BUTTE', 'M', 'Butte', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Butte.html'),
    ('Chabot College', 'CHABOT', 'F', 'Chabot', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Chabot.html'),
    ('Chabot College', 'CHABOT', 'M', 'Chabot', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Chabot.html'),
    ('Champion Christian College', 'CHAMPION CHRISTIAN COLLEGE', 'M', 'Champion_Christian_College', 'https://www.tfrrs.org/teams/tf/AR_college_m_Champion_Christian_College.html'),
    ('Clackamas Community College', 'CLACKAMAS CC', 'F', 'Clackamas_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_f_Clackamas_CC.html'),
    ('Clackamas Community College', 'CLACKAMAS CC', 'M', 'Clackamas_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_m_Clackamas_CC.html'),
    ('Clark College', 'CLARK COLLEGE', 'F', 'Clark_College', 'https://www.tfrrs.org/teams/tf/WA_jcollege_f_Clark_College.html'),
    ('Clark College', 'CLARK COLLEGE', 'M', 'Clark_College', 'https://www.tfrrs.org/teams/tf/WA_jcollege_m_Clark_College.html'),
    ('Clovis Community College', 'CLOVIS CC', 'F', 'Clovis_CC', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Clovis_CC.html'),
    ('Clovis Community College', 'CLOVIS CC', 'M', 'Clovis_CC', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Clovis_CC.html'),
    ('College of San Mateo', 'SAN MATEO', 'F', 'San_Mateo', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_San_Mateo.html'),
    ('College of San Mateo', 'SAN MATEO', 'M', 'San_Mateo', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_San_Mateo.html'),
    ('College of the Redwoods', 'REDWOODS', 'F', 'Redwoods', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Redwoods.html'),
    ('College of the Redwoods', 'REDWOODS', 'M', 'Redwoods', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Redwoods.html'),
    ('College of the Sequoias', 'SEQUOIAS', 'F', 'Sequoias', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Sequoias.html'),
    ('College of the Sequoias', 'SEQUOIAS', 'M', 'Sequoias', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Sequoias.html'),
    ('Colorado Mountain College', 'COLORADO MOUNTAIN COLLEGE', 'F', 'Colorado_Mountain_College', 'https://www.tfrrs.org/teams/tf/CO_college_f_Colorado_Mountain_College.html'),
    ('Colorado Northwestern Community College', 'COLORADO NORTHWESTERN CC', 'M', 'Colorado_Northwestern_CC', 'https://www.tfrrs.org/teams/tf/CO_jcollege_m_Colorado_Northwestern_CC.html'),
    ('Dallas Christian College', 'DALLAS CHRISTIAN', 'M', 'DallasChristian', 'https://www.tfrrs.org/teams/tf/TX_college_m_DallasChristian.html'),
    ('De Anza College', 'DE ANZA', 'F', 'De_Anza', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_De_Anza.html'),
    ('De Anza College', 'DE ANZA', 'M', 'De_Anza', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_De_Anza.html'),
    ('Diablo Valley College', 'DIABLO VALLEY', 'F', 'Diablo_Valley', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Diablo_Valley.html'),
    ('Diablo Valley College', 'DIABLO VALLEY', 'M', 'Diablo_Valley', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Diablo_Valley.html'),
    ('Dine College', 'DINE COLLEGE (AZ)', 'F', 'Dine_College_AZ', 'https://www.tfrrs.org/teams/tf/AZ_jcollege_f_Dine_College_AZ.html'),
    ('Dine College', 'DINE COLLEGE (AZ)', 'M', 'Dine_College_AZ', 'https://www.tfrrs.org/teams/tf/AZ_jcollege_m_Dine_College_AZ.html'),
    ('Everett Community College', 'EVERETT CC', 'F', 'Everett_CC', 'https://www.tfrrs.org/teams/tf/WA_jcollege_f_Everett_CC.html'),
    ('Everett Community College', 'EVERETT CC', 'M', 'Everett_CC', 'https://www.tfrrs.org/teams/tf/WA_jcollege_m_Everett_CC.html'),
    ('Faith Baptist Bible College', 'FAITH BAPTIST BIBLE', 'F', 'Faith_Baptist_Bible', 'https://www.tfrrs.org/teams/tf/IA_college_f_Faith_Baptist_Bible.html'),
    ('Faith Baptist Bible College', 'FAITH BAPTIST BIBLE', 'M', 'Faith_Baptist_Bible', 'https://www.tfrrs.org/teams/tf/IA_college_m_Faith_Baptist_Bible.html'),
    ('Fresno City College', 'FRESNO', 'F', 'Fresno', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Fresno.html'),
    ('Fresno City College', 'FRESNO', 'M', 'Fresno', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Fresno.html'),
    ('Green River College', 'GREEN RIVER COLLEGE', 'F', 'Green_River_CC', 'https://www.tfrrs.org/teams/tf/WA_jcollege_f_Green_River_CC.html'),
    ('Green River College', 'GREEN RIVER COLLEGE', 'M', 'Green_River_CC', 'https://www.tfrrs.org/teams/tf/WA_jcollege_m_Green_River_CC.html'),
    ('Hartnell College', 'HARTNELL', 'F', 'Hartnell', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Hartnell.html'),
    ('Hartnell College', 'HARTNELL', 'M', 'Hartnell', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Hartnell.html'),
    ('Johnson & Wales University Charlotte', 'JOHNSON & WALES (N.C.)', 'F', 'Johnson__Wales_NC', 'https://www.tfrrs.org/teams/tf/NC_college_f_Johnson__Wales_NC.html'),
    ('Lake Tahoe Community College', 'LAKE TAHOE', 'F', 'Lake_Tahoe', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Lake_Tahoe.html'),
    ('Lake Tahoe Community College', 'LAKE TAHOE', 'M', 'Lake_Tahoe', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Lake_Tahoe.html'),
    ('Lane Community College', 'LANE CC', 'F', 'Lane_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_f_Lane_CC.html'),
    ('Lane Community College', 'LANE CC', 'M', 'Lane_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_m_Lane_CC.html'),
    ('Madera Community College', 'MADERA CC', 'M', 'Madera_CC', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Madera_CC.html'),
    ('Merritt College', 'MERRITT', 'F', 'Merritt', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Merritt.html'),
    ('Merritt College', 'MERRITT', 'M', 'Merritt', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Merritt.html'),
    ('Modesto Junior College', 'MODESTO', 'F', 'Modesto', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Modesto.html'),
    ('Modesto Junior College', 'MODESTO', 'M', 'Modesto', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Modesto.html'),
    ('Monterey Peninsula College', 'MONTEREY PENINSULA', 'F', 'Monterey_Peninsula', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Monterey_Peninsula.html'),
    ('Monterey Peninsula College', 'MONTEREY PENINSULA', 'M', 'Monterey_Peninsula', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Monterey_Peninsula.html'),
    ('Mt. Hood Community College', 'MT. HOOD CC', 'F', 'Mt_Hood_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_f_Mt_Hood_CC.html'),
    ('Mt. Hood Community College', 'MT. HOOD CC', 'M', 'Mt_Hood_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_m_Mt_Hood_CC.html'),
    ('North American University', 'NORTH AMERICAN', 'F', 'North_American', 'https://www.tfrrs.org/teams/tf/TX_college_f_North_American.html'),
    ('North American University', 'NORTH AMERICAN', 'M', 'North_American', 'https://www.tfrrs.org/teams/tf/TX_college_m_North_American.html'),
    ('NorthWest Arkansas Community College', 'NORTHWEST ARKANSAS CC', 'F', 'NorthWest_Arkansas', 'https://www.tfrrs.org/teams/tf/AR_jcollege_f_NorthWest_Arkansas.html'),
    ('NorthWest Arkansas Community College', 'NORTHWEST ARKANSAS CC', 'M', 'NorthWest_Arkansas', 'https://www.tfrrs.org/teams/tf/AR_jcollege_m_NorthWest_Arkansas.html'),
    ('Penn State Fayette, The Eberly Campus', 'PSU-FAYETTE', 'M', 'PSU-Fayette', 'https://www.tfrrs.org/teams/tf/PA_college_m_PSU-Fayette.html'),
    ('Penn State Scranton', 'PSU-SCRANTON', 'F', 'PSU-Scranton', 'https://www.tfrrs.org/teams/tf/PA_college_f_PSU-Scranton.html'),
    ('Penn State Scranton', 'PSU-SCRANTON', 'M', 'PSU-Scranton', 'https://www.tfrrs.org/teams/tf/PA_college_m_PSU-Scranton.html'),
    ('Pierce College', 'PIERCE COLLEGE (WA)', 'F', 'Pierce_College_WA', 'https://www.tfrrs.org/teams/tf/WA_jcollege_f_Pierce_College_WA.html'),
    ('Roane State Community College', 'ROANE STATE', 'F', 'Roane_State_Community_College', 'https://www.tfrrs.org/teams/tf/TN_jcollege_f_Roane_State_Community_College.html'),
    ('Roane State Community College', 'ROANE STATE', 'M', 'Roane_State_Community_College', 'https://www.tfrrs.org/teams/tf/TN_jcollege_m_Roane_State_Community_College.html'),
    ('Sacramento City College', 'SACRAMENTO', 'F', 'Sacramento', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Sacramento.html'),
    ('Sacramento City College', 'SACRAMENTO', 'M', 'Sacramento', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Sacramento.html'),
    ('San Joaquin Delta College', 'SAN JOAQUIN DELTA', 'F', 'San_Joaquin_Delta', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_San_Joaquin_Delta.html'),
    ('San Joaquin Delta College', 'SAN JOAQUIN DELTA', 'M', 'San_Joaquin_Delta', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_San_Joaquin_Delta.html'),
    ('San Jose City College', 'SAN JOSE', 'F', 'San_Jose', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_San_Jose.html'),
    ('San Jose City College', 'SAN JOSE', 'M', 'San_Jose', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_San_Jose.html'),
    ('Santa Rosa Junior College', 'SANTA ROSA', 'F', 'Santa_Rosa', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Santa_Rosa.html'),
    ('Santa Rosa Junior College', 'SANTA ROSA', 'M', 'Santa_Rosa', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Santa_Rosa.html'),
    ('Shasta College', 'SHASTA', 'F', 'Shasta', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Shasta.html'),
    ('Shasta College', 'SHASTA', 'M', 'Shasta', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Shasta.html'),
    ('Southwestern Oregon Community College', 'SW OREGON CC', 'F', 'SW_Oregon_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_f_SW_Oregon_CC.html'),
    ('Southwestern Oregon Community College', 'SW OREGON CC', 'M', 'SW_Oregon_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_m_SW_Oregon_CC.html'),
    ('Texas Southmost College', 'TEXAS SOUTHMOST COLLEGE', 'F', 'Texas_Southmost_College', 'https://www.tfrrs.org/teams/tf/TX_jcollege_f_Texas_Southmost_College.html'),
    ('Texas Southmost College', 'TEXAS SOUTHMOST COLLEGE', 'M', 'Texas_Southmost_College', 'https://www.tfrrs.org/teams/tf/TX_jcollege_m_Texas_Southmost_College.html'),
    ('United States Sports University', 'USSU', 'F', 'United_States_Sports_Academy', 'https://www.tfrrs.org/teams/tf/AL_college_f_United_States_Sports_Academy.html'),
    ('University of Arkansas - Fort Smith', 'UA-FORT SMITH', 'F', 'Arkansas-Fort_Smith', 'https://www.tfrrs.org/teams/tf/AR_college_f_Arkansas-Fort_Smith.html'),
    ('University of Arkansas - Fort Smith', 'UA-FORT SMITH', 'M', 'Arkansas-Fort_Smith', 'https://www.tfrrs.org/teams/tf/AR_college_m_Arkansas-Fort_Smith.html'),
    ('University of Fort Lauderdale', 'FORT LAUDERDALE', 'M', 'University_of_Fort_Lauderdale', 'https://www.tfrrs.org/teams/tf/FL_college_m_University_of_Fort_Lauderdale.html'),
    ('University of Valley Forge', 'VALLEY FORGE', 'F', 'Valley_Forge_Christian', 'https://www.tfrrs.org/teams/tf/PA_college_f_Valley_Forge_Christian.html'),
    ('University of Valley Forge', 'VALLEY FORGE', 'M', 'Valley_Forge_Christian', 'https://www.tfrrs.org/teams/tf/PA_college_m_Valley_Forge_Christian.html'),
    ('Vaughn College of Aeronautics and Technology', 'VAUGHN', 'M', 'Vaughn', 'https://www.tfrrs.org/teams/tf/NY_college_m_Vaughn.html'),
    ('Victoria College', 'VICTORIA COLLEGE', 'M', 'Victoria_College', 'https://www.tfrrs.org/teams/tf/TX_jcollege_m_Victoria_College.html'),
    ('Walters State Community College', 'WALTERS STATE CC', 'F', 'Walters_State_CC', 'https://www.tfrrs.org/teams/tf/TN_jcollege_f_Walters_State_CC.html'),
    ('Walters State Community College', 'WALTERS STATE CC', 'M', 'Walters_State_CC', 'https://www.tfrrs.org/teams/tf/TN_jcollege_m_Walters_State_CC.html'),
    ('Yuba College', 'YUBA', 'F', 'Yuba', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Yuba.html'),
    ('Yuba College', 'YUBA', 'M', 'Yuba', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Yuba.html')
)
INSERT INTO public.teams (
  school_id, gender, team_name, team_type, tfrrs_team_url, is_active
)
SELECT s.school_id, d.gender, d.source_name, 'collegiate', d.source_url, true
FROM desired d
JOIN public.schools s ON lower(s.official_name) = lower(d.official_name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.teams t
  WHERE t.school_id = s.school_id AND t.gender = d.gender
);

DO $$
DECLARE conflict_count integer;
BEGIN
  WITH desired (official_name, source_name, gender, source_key, source_url) AS (
    VALUES
    ('American River College', 'AMERICAN RIVER', 'F', 'American_River', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_American_River.html'),
    ('American River College', 'AMERICAN RIVER', 'M', 'American_River', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_American_River.html'),
    ('Butte College', 'BUTTE', 'F', 'Butte', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Butte.html'),
    ('Butte College', 'BUTTE', 'M', 'Butte', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Butte.html'),
    ('Chabot College', 'CHABOT', 'F', 'Chabot', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Chabot.html'),
    ('Chabot College', 'CHABOT', 'M', 'Chabot', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Chabot.html'),
    ('Champion Christian College', 'CHAMPION CHRISTIAN COLLEGE', 'M', 'Champion_Christian_College', 'https://www.tfrrs.org/teams/tf/AR_college_m_Champion_Christian_College.html'),
    ('Clackamas Community College', 'CLACKAMAS CC', 'F', 'Clackamas_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_f_Clackamas_CC.html'),
    ('Clackamas Community College', 'CLACKAMAS CC', 'M', 'Clackamas_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_m_Clackamas_CC.html'),
    ('Clark College', 'CLARK COLLEGE', 'F', 'Clark_College', 'https://www.tfrrs.org/teams/tf/WA_jcollege_f_Clark_College.html'),
    ('Clark College', 'CLARK COLLEGE', 'M', 'Clark_College', 'https://www.tfrrs.org/teams/tf/WA_jcollege_m_Clark_College.html'),
    ('Clovis Community College', 'CLOVIS CC', 'F', 'Clovis_CC', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Clovis_CC.html'),
    ('Clovis Community College', 'CLOVIS CC', 'M', 'Clovis_CC', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Clovis_CC.html'),
    ('College of San Mateo', 'SAN MATEO', 'F', 'San_Mateo', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_San_Mateo.html'),
    ('College of San Mateo', 'SAN MATEO', 'M', 'San_Mateo', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_San_Mateo.html'),
    ('College of the Redwoods', 'REDWOODS', 'F', 'Redwoods', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Redwoods.html'),
    ('College of the Redwoods', 'REDWOODS', 'M', 'Redwoods', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Redwoods.html'),
    ('College of the Sequoias', 'SEQUOIAS', 'F', 'Sequoias', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Sequoias.html'),
    ('College of the Sequoias', 'SEQUOIAS', 'M', 'Sequoias', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Sequoias.html'),
    ('Colorado Mountain College', 'COLORADO MOUNTAIN COLLEGE', 'F', 'Colorado_Mountain_College', 'https://www.tfrrs.org/teams/tf/CO_college_f_Colorado_Mountain_College.html'),
    ('Colorado Northwestern Community College', 'COLORADO NORTHWESTERN CC', 'M', 'Colorado_Northwestern_CC', 'https://www.tfrrs.org/teams/tf/CO_jcollege_m_Colorado_Northwestern_CC.html'),
    ('Dallas Christian College', 'DALLAS CHRISTIAN', 'M', 'DallasChristian', 'https://www.tfrrs.org/teams/tf/TX_college_m_DallasChristian.html'),
    ('De Anza College', 'DE ANZA', 'F', 'De_Anza', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_De_Anza.html'),
    ('De Anza College', 'DE ANZA', 'M', 'De_Anza', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_De_Anza.html'),
    ('Diablo Valley College', 'DIABLO VALLEY', 'F', 'Diablo_Valley', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Diablo_Valley.html'),
    ('Diablo Valley College', 'DIABLO VALLEY', 'M', 'Diablo_Valley', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Diablo_Valley.html'),
    ('Dine College', 'DINE COLLEGE (AZ)', 'F', 'Dine_College_AZ', 'https://www.tfrrs.org/teams/tf/AZ_jcollege_f_Dine_College_AZ.html'),
    ('Dine College', 'DINE COLLEGE (AZ)', 'M', 'Dine_College_AZ', 'https://www.tfrrs.org/teams/tf/AZ_jcollege_m_Dine_College_AZ.html'),
    ('Everett Community College', 'EVERETT CC', 'F', 'Everett_CC', 'https://www.tfrrs.org/teams/tf/WA_jcollege_f_Everett_CC.html'),
    ('Everett Community College', 'EVERETT CC', 'M', 'Everett_CC', 'https://www.tfrrs.org/teams/tf/WA_jcollege_m_Everett_CC.html'),
    ('Faith Baptist Bible College', 'FAITH BAPTIST BIBLE', 'F', 'Faith_Baptist_Bible', 'https://www.tfrrs.org/teams/tf/IA_college_f_Faith_Baptist_Bible.html'),
    ('Faith Baptist Bible College', 'FAITH BAPTIST BIBLE', 'M', 'Faith_Baptist_Bible', 'https://www.tfrrs.org/teams/tf/IA_college_m_Faith_Baptist_Bible.html'),
    ('Fresno City College', 'FRESNO', 'F', 'Fresno', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Fresno.html'),
    ('Fresno City College', 'FRESNO', 'M', 'Fresno', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Fresno.html'),
    ('Green River College', 'GREEN RIVER COLLEGE', 'F', 'Green_River_CC', 'https://www.tfrrs.org/teams/tf/WA_jcollege_f_Green_River_CC.html'),
    ('Green River College', 'GREEN RIVER COLLEGE', 'M', 'Green_River_CC', 'https://www.tfrrs.org/teams/tf/WA_jcollege_m_Green_River_CC.html'),
    ('Hartnell College', 'HARTNELL', 'F', 'Hartnell', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Hartnell.html'),
    ('Hartnell College', 'HARTNELL', 'M', 'Hartnell', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Hartnell.html'),
    ('Johnson & Wales University Charlotte', 'JOHNSON & WALES (N.C.)', 'F', 'Johnson__Wales_NC', 'https://www.tfrrs.org/teams/tf/NC_college_f_Johnson__Wales_NC.html'),
    ('Lake Tahoe Community College', 'LAKE TAHOE', 'F', 'Lake_Tahoe', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Lake_Tahoe.html'),
    ('Lake Tahoe Community College', 'LAKE TAHOE', 'M', 'Lake_Tahoe', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Lake_Tahoe.html'),
    ('Lane Community College', 'LANE CC', 'F', 'Lane_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_f_Lane_CC.html'),
    ('Lane Community College', 'LANE CC', 'M', 'Lane_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_m_Lane_CC.html'),
    ('Madera Community College', 'MADERA CC', 'M', 'Madera_CC', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Madera_CC.html'),
    ('Merritt College', 'MERRITT', 'F', 'Merritt', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Merritt.html'),
    ('Merritt College', 'MERRITT', 'M', 'Merritt', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Merritt.html'),
    ('Modesto Junior College', 'MODESTO', 'F', 'Modesto', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Modesto.html'),
    ('Modesto Junior College', 'MODESTO', 'M', 'Modesto', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Modesto.html'),
    ('Monterey Peninsula College', 'MONTEREY PENINSULA', 'F', 'Monterey_Peninsula', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Monterey_Peninsula.html'),
    ('Monterey Peninsula College', 'MONTEREY PENINSULA', 'M', 'Monterey_Peninsula', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Monterey_Peninsula.html'),
    ('Mt. Hood Community College', 'MT. HOOD CC', 'F', 'Mt_Hood_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_f_Mt_Hood_CC.html'),
    ('Mt. Hood Community College', 'MT. HOOD CC', 'M', 'Mt_Hood_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_m_Mt_Hood_CC.html'),
    ('North American University', 'NORTH AMERICAN', 'F', 'North_American', 'https://www.tfrrs.org/teams/tf/TX_college_f_North_American.html'),
    ('North American University', 'NORTH AMERICAN', 'M', 'North_American', 'https://www.tfrrs.org/teams/tf/TX_college_m_North_American.html'),
    ('NorthWest Arkansas Community College', 'NORTHWEST ARKANSAS CC', 'F', 'NorthWest_Arkansas', 'https://www.tfrrs.org/teams/tf/AR_jcollege_f_NorthWest_Arkansas.html'),
    ('NorthWest Arkansas Community College', 'NORTHWEST ARKANSAS CC', 'M', 'NorthWest_Arkansas', 'https://www.tfrrs.org/teams/tf/AR_jcollege_m_NorthWest_Arkansas.html'),
    ('Penn State Fayette, The Eberly Campus', 'PSU-FAYETTE', 'M', 'PSU-Fayette', 'https://www.tfrrs.org/teams/tf/PA_college_m_PSU-Fayette.html'),
    ('Penn State Scranton', 'PSU-SCRANTON', 'F', 'PSU-Scranton', 'https://www.tfrrs.org/teams/tf/PA_college_f_PSU-Scranton.html'),
    ('Penn State Scranton', 'PSU-SCRANTON', 'M', 'PSU-Scranton', 'https://www.tfrrs.org/teams/tf/PA_college_m_PSU-Scranton.html'),
    ('Pierce College', 'PIERCE COLLEGE (WA)', 'F', 'Pierce_College_WA', 'https://www.tfrrs.org/teams/tf/WA_jcollege_f_Pierce_College_WA.html'),
    ('Roane State Community College', 'ROANE STATE', 'F', 'Roane_State_Community_College', 'https://www.tfrrs.org/teams/tf/TN_jcollege_f_Roane_State_Community_College.html'),
    ('Roane State Community College', 'ROANE STATE', 'M', 'Roane_State_Community_College', 'https://www.tfrrs.org/teams/tf/TN_jcollege_m_Roane_State_Community_College.html'),
    ('Sacramento City College', 'SACRAMENTO', 'F', 'Sacramento', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Sacramento.html'),
    ('Sacramento City College', 'SACRAMENTO', 'M', 'Sacramento', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Sacramento.html'),
    ('San Joaquin Delta College', 'SAN JOAQUIN DELTA', 'F', 'San_Joaquin_Delta', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_San_Joaquin_Delta.html'),
    ('San Joaquin Delta College', 'SAN JOAQUIN DELTA', 'M', 'San_Joaquin_Delta', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_San_Joaquin_Delta.html'),
    ('San Jose City College', 'SAN JOSE', 'F', 'San_Jose', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_San_Jose.html'),
    ('San Jose City College', 'SAN JOSE', 'M', 'San_Jose', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_San_Jose.html'),
    ('Santa Rosa Junior College', 'SANTA ROSA', 'F', 'Santa_Rosa', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Santa_Rosa.html'),
    ('Santa Rosa Junior College', 'SANTA ROSA', 'M', 'Santa_Rosa', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Santa_Rosa.html'),
    ('Shasta College', 'SHASTA', 'F', 'Shasta', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Shasta.html'),
    ('Shasta College', 'SHASTA', 'M', 'Shasta', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Shasta.html'),
    ('Southwestern Oregon Community College', 'SW OREGON CC', 'F', 'SW_Oregon_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_f_SW_Oregon_CC.html'),
    ('Southwestern Oregon Community College', 'SW OREGON CC', 'M', 'SW_Oregon_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_m_SW_Oregon_CC.html'),
    ('Texas Southmost College', 'TEXAS SOUTHMOST COLLEGE', 'F', 'Texas_Southmost_College', 'https://www.tfrrs.org/teams/tf/TX_jcollege_f_Texas_Southmost_College.html'),
    ('Texas Southmost College', 'TEXAS SOUTHMOST COLLEGE', 'M', 'Texas_Southmost_College', 'https://www.tfrrs.org/teams/tf/TX_jcollege_m_Texas_Southmost_College.html'),
    ('United States Sports University', 'USSU', 'F', 'United_States_Sports_Academy', 'https://www.tfrrs.org/teams/tf/AL_college_f_United_States_Sports_Academy.html'),
    ('University of Arkansas - Fort Smith', 'UA-FORT SMITH', 'F', 'Arkansas-Fort_Smith', 'https://www.tfrrs.org/teams/tf/AR_college_f_Arkansas-Fort_Smith.html'),
    ('University of Arkansas - Fort Smith', 'UA-FORT SMITH', 'M', 'Arkansas-Fort_Smith', 'https://www.tfrrs.org/teams/tf/AR_college_m_Arkansas-Fort_Smith.html'),
    ('University of Fort Lauderdale', 'FORT LAUDERDALE', 'M', 'University_of_Fort_Lauderdale', 'https://www.tfrrs.org/teams/tf/FL_college_m_University_of_Fort_Lauderdale.html'),
    ('University of Valley Forge', 'VALLEY FORGE', 'F', 'Valley_Forge_Christian', 'https://www.tfrrs.org/teams/tf/PA_college_f_Valley_Forge_Christian.html'),
    ('University of Valley Forge', 'VALLEY FORGE', 'M', 'Valley_Forge_Christian', 'https://www.tfrrs.org/teams/tf/PA_college_m_Valley_Forge_Christian.html'),
    ('Vaughn College of Aeronautics and Technology', 'VAUGHN', 'M', 'Vaughn', 'https://www.tfrrs.org/teams/tf/NY_college_m_Vaughn.html'),
    ('Victoria College', 'VICTORIA COLLEGE', 'M', 'Victoria_College', 'https://www.tfrrs.org/teams/tf/TX_jcollege_m_Victoria_College.html'),
    ('Walters State Community College', 'WALTERS STATE CC', 'F', 'Walters_State_CC', 'https://www.tfrrs.org/teams/tf/TN_jcollege_f_Walters_State_CC.html'),
    ('Walters State Community College', 'WALTERS STATE CC', 'M', 'Walters_State_CC', 'https://www.tfrrs.org/teams/tf/TN_jcollege_m_Walters_State_CC.html'),
    ('Yuba College', 'YUBA', 'F', 'Yuba', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Yuba.html'),
    ('Yuba College', 'YUBA', 'M', 'Yuba', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Yuba.html')
  )
  SELECT count(*) INTO conflict_count
  FROM desired d
  JOIN public.schools s ON lower(s.official_name) = lower(d.official_name)
  LEFT JOIN public.teams t ON t.school_id = s.school_id AND t.gender = d.gender
  WHERE t.team_id IS NULL
     OR t.tfrrs_team_url IS DISTINCT FROM d.source_url
     OR EXISTS (
       SELECT 1 FROM public.teams other
       WHERE other.tfrrs_team_url = d.source_url AND other.team_id <> t.team_id
     );
  IF conflict_count <> 0 THEN
    RAISE EXCEPTION '% desired collegiate teams are missing or conflict with reviewed source URLs', conflict_count;
  END IF;
END $$;

-- Correct the four pre-existing aliases that were reviewed against the wrong similarly named
-- institutions. The predicates name both the old and new identities, so an unexpected target
-- remains blocked by the general conflict assertion below.
WITH corrections (normalized_key, gender, old_official_name, old_state, old_url, new_official_name) AS (
  VALUES
    ('clark college', 'M', 'Clark', 'MA', 'https://www.tfrrs.org/teams/tf/MA_college_m_Clark.html', 'Clark College'),
    ('clark college', 'F', 'Clark', 'MA', 'https://www.tfrrs.org/teams/tf/MA_college_f_Clark.html', 'Clark College'),
    ('lane cc', 'M', 'Lane', 'TN', 'https://www.tfrrs.org/teams/tf/TN_college_m_Lane.html', 'Lane Community College'),
    ('lane cc', 'F', 'Lane', 'TN', 'https://www.tfrrs.org/teams/tf/TN_college_f_Lane.html', 'Lane Community College')
)
UPDATE ingest.team_aliases a
SET team_id = new_team.team_id,
    notes = 'Corrected reviewed source identity; prior alias targeted a different similarly named institution.',
    verified_at = now(),
    updated_at = now()
FROM corrections c
JOIN public.teams old_team ON old_team.tfrrs_team_url = c.old_url
JOIN public.schools old_school
  ON old_school.school_id = old_team.school_id
 AND old_school.official_name = c.old_official_name
 AND old_school.state = c.old_state
JOIN public.schools new_school ON new_school.official_name = c.new_official_name
JOIN public.teams new_team
  ON new_team.school_id = new_school.school_id
 AND new_team.gender = c.gender
WHERE a.source = 'tfrrs'
  AND a.normalized_source_team_key = c.normalized_key
  AND a.source_gender = c.gender
  AND a.team_id = old_team.team_id;

DO $$
DECLARE conflict_count integer;
BEGIN
  WITH desired (official_name, source_name, gender, source_key, source_url) AS (
    VALUES
    ('American River College', 'AMERICAN RIVER', 'F', 'American_River', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_American_River.html'),
    ('American River College', 'AMERICAN RIVER', 'M', 'American_River', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_American_River.html'),
    ('Butte College', 'BUTTE', 'F', 'Butte', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Butte.html'),
    ('Butte College', 'BUTTE', 'M', 'Butte', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Butte.html'),
    ('Chabot College', 'CHABOT', 'F', 'Chabot', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Chabot.html'),
    ('Chabot College', 'CHABOT', 'M', 'Chabot', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Chabot.html'),
    ('Champion Christian College', 'CHAMPION CHRISTIAN COLLEGE', 'M', 'Champion_Christian_College', 'https://www.tfrrs.org/teams/tf/AR_college_m_Champion_Christian_College.html'),
    ('Clackamas Community College', 'CLACKAMAS CC', 'F', 'Clackamas_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_f_Clackamas_CC.html'),
    ('Clackamas Community College', 'CLACKAMAS CC', 'M', 'Clackamas_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_m_Clackamas_CC.html'),
    ('Clark College', 'CLARK COLLEGE', 'F', 'Clark_College', 'https://www.tfrrs.org/teams/tf/WA_jcollege_f_Clark_College.html'),
    ('Clark College', 'CLARK COLLEGE', 'M', 'Clark_College', 'https://www.tfrrs.org/teams/tf/WA_jcollege_m_Clark_College.html'),
    ('Clovis Community College', 'CLOVIS CC', 'F', 'Clovis_CC', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Clovis_CC.html'),
    ('Clovis Community College', 'CLOVIS CC', 'M', 'Clovis_CC', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Clovis_CC.html'),
    ('College of San Mateo', 'SAN MATEO', 'F', 'San_Mateo', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_San_Mateo.html'),
    ('College of San Mateo', 'SAN MATEO', 'M', 'San_Mateo', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_San_Mateo.html'),
    ('College of the Redwoods', 'REDWOODS', 'F', 'Redwoods', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Redwoods.html'),
    ('College of the Redwoods', 'REDWOODS', 'M', 'Redwoods', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Redwoods.html'),
    ('College of the Sequoias', 'SEQUOIAS', 'F', 'Sequoias', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Sequoias.html'),
    ('College of the Sequoias', 'SEQUOIAS', 'M', 'Sequoias', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Sequoias.html'),
    ('Colorado Mountain College', 'COLORADO MOUNTAIN COLLEGE', 'F', 'Colorado_Mountain_College', 'https://www.tfrrs.org/teams/tf/CO_college_f_Colorado_Mountain_College.html'),
    ('Colorado Northwestern Community College', 'COLORADO NORTHWESTERN CC', 'M', 'Colorado_Northwestern_CC', 'https://www.tfrrs.org/teams/tf/CO_jcollege_m_Colorado_Northwestern_CC.html'),
    ('Dallas Christian College', 'DALLAS CHRISTIAN', 'M', 'DallasChristian', 'https://www.tfrrs.org/teams/tf/TX_college_m_DallasChristian.html'),
    ('De Anza College', 'DE ANZA', 'F', 'De_Anza', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_De_Anza.html'),
    ('De Anza College', 'DE ANZA', 'M', 'De_Anza', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_De_Anza.html'),
    ('Diablo Valley College', 'DIABLO VALLEY', 'F', 'Diablo_Valley', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Diablo_Valley.html'),
    ('Diablo Valley College', 'DIABLO VALLEY', 'M', 'Diablo_Valley', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Diablo_Valley.html'),
    ('Dine College', 'DINE COLLEGE (AZ)', 'F', 'Dine_College_AZ', 'https://www.tfrrs.org/teams/tf/AZ_jcollege_f_Dine_College_AZ.html'),
    ('Dine College', 'DINE COLLEGE (AZ)', 'M', 'Dine_College_AZ', 'https://www.tfrrs.org/teams/tf/AZ_jcollege_m_Dine_College_AZ.html'),
    ('Everett Community College', 'EVERETT CC', 'F', 'Everett_CC', 'https://www.tfrrs.org/teams/tf/WA_jcollege_f_Everett_CC.html'),
    ('Everett Community College', 'EVERETT CC', 'M', 'Everett_CC', 'https://www.tfrrs.org/teams/tf/WA_jcollege_m_Everett_CC.html'),
    ('Faith Baptist Bible College', 'FAITH BAPTIST BIBLE', 'F', 'Faith_Baptist_Bible', 'https://www.tfrrs.org/teams/tf/IA_college_f_Faith_Baptist_Bible.html'),
    ('Faith Baptist Bible College', 'FAITH BAPTIST BIBLE', 'M', 'Faith_Baptist_Bible', 'https://www.tfrrs.org/teams/tf/IA_college_m_Faith_Baptist_Bible.html'),
    ('Fresno City College', 'FRESNO', 'F', 'Fresno', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Fresno.html'),
    ('Fresno City College', 'FRESNO', 'M', 'Fresno', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Fresno.html'),
    ('Green River College', 'GREEN RIVER COLLEGE', 'F', 'Green_River_CC', 'https://www.tfrrs.org/teams/tf/WA_jcollege_f_Green_River_CC.html'),
    ('Green River College', 'GREEN RIVER COLLEGE', 'M', 'Green_River_CC', 'https://www.tfrrs.org/teams/tf/WA_jcollege_m_Green_River_CC.html'),
    ('Hartnell College', 'HARTNELL', 'F', 'Hartnell', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Hartnell.html'),
    ('Hartnell College', 'HARTNELL', 'M', 'Hartnell', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Hartnell.html'),
    ('Johnson & Wales University Charlotte', 'JOHNSON & WALES (N.C.)', 'F', 'Johnson__Wales_NC', 'https://www.tfrrs.org/teams/tf/NC_college_f_Johnson__Wales_NC.html'),
    ('Lake Tahoe Community College', 'LAKE TAHOE', 'F', 'Lake_Tahoe', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Lake_Tahoe.html'),
    ('Lake Tahoe Community College', 'LAKE TAHOE', 'M', 'Lake_Tahoe', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Lake_Tahoe.html'),
    ('Lane Community College', 'LANE CC', 'F', 'Lane_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_f_Lane_CC.html'),
    ('Lane Community College', 'LANE CC', 'M', 'Lane_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_m_Lane_CC.html'),
    ('Madera Community College', 'MADERA CC', 'M', 'Madera_CC', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Madera_CC.html'),
    ('Merritt College', 'MERRITT', 'F', 'Merritt', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Merritt.html'),
    ('Merritt College', 'MERRITT', 'M', 'Merritt', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Merritt.html'),
    ('Modesto Junior College', 'MODESTO', 'F', 'Modesto', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Modesto.html'),
    ('Modesto Junior College', 'MODESTO', 'M', 'Modesto', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Modesto.html'),
    ('Monterey Peninsula College', 'MONTEREY PENINSULA', 'F', 'Monterey_Peninsula', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Monterey_Peninsula.html'),
    ('Monterey Peninsula College', 'MONTEREY PENINSULA', 'M', 'Monterey_Peninsula', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Monterey_Peninsula.html'),
    ('Mt. Hood Community College', 'MT. HOOD CC', 'F', 'Mt_Hood_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_f_Mt_Hood_CC.html'),
    ('Mt. Hood Community College', 'MT. HOOD CC', 'M', 'Mt_Hood_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_m_Mt_Hood_CC.html'),
    ('North American University', 'NORTH AMERICAN', 'F', 'North_American', 'https://www.tfrrs.org/teams/tf/TX_college_f_North_American.html'),
    ('North American University', 'NORTH AMERICAN', 'M', 'North_American', 'https://www.tfrrs.org/teams/tf/TX_college_m_North_American.html'),
    ('NorthWest Arkansas Community College', 'NORTHWEST ARKANSAS CC', 'F', 'NorthWest_Arkansas', 'https://www.tfrrs.org/teams/tf/AR_jcollege_f_NorthWest_Arkansas.html'),
    ('NorthWest Arkansas Community College', 'NORTHWEST ARKANSAS CC', 'M', 'NorthWest_Arkansas', 'https://www.tfrrs.org/teams/tf/AR_jcollege_m_NorthWest_Arkansas.html'),
    ('Penn State Fayette, The Eberly Campus', 'PSU-FAYETTE', 'M', 'PSU-Fayette', 'https://www.tfrrs.org/teams/tf/PA_college_m_PSU-Fayette.html'),
    ('Penn State Scranton', 'PSU-SCRANTON', 'F', 'PSU-Scranton', 'https://www.tfrrs.org/teams/tf/PA_college_f_PSU-Scranton.html'),
    ('Penn State Scranton', 'PSU-SCRANTON', 'M', 'PSU-Scranton', 'https://www.tfrrs.org/teams/tf/PA_college_m_PSU-Scranton.html'),
    ('Pierce College', 'PIERCE COLLEGE (WA)', 'F', 'Pierce_College_WA', 'https://www.tfrrs.org/teams/tf/WA_jcollege_f_Pierce_College_WA.html'),
    ('Roane State Community College', 'ROANE STATE', 'F', 'Roane_State_Community_College', 'https://www.tfrrs.org/teams/tf/TN_jcollege_f_Roane_State_Community_College.html'),
    ('Roane State Community College', 'ROANE STATE', 'M', 'Roane_State_Community_College', 'https://www.tfrrs.org/teams/tf/TN_jcollege_m_Roane_State_Community_College.html'),
    ('Sacramento City College', 'SACRAMENTO', 'F', 'Sacramento', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Sacramento.html'),
    ('Sacramento City College', 'SACRAMENTO', 'M', 'Sacramento', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Sacramento.html'),
    ('San Joaquin Delta College', 'SAN JOAQUIN DELTA', 'F', 'San_Joaquin_Delta', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_San_Joaquin_Delta.html'),
    ('San Joaquin Delta College', 'SAN JOAQUIN DELTA', 'M', 'San_Joaquin_Delta', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_San_Joaquin_Delta.html'),
    ('San Jose City College', 'SAN JOSE', 'F', 'San_Jose', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_San_Jose.html'),
    ('San Jose City College', 'SAN JOSE', 'M', 'San_Jose', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_San_Jose.html'),
    ('Santa Rosa Junior College', 'SANTA ROSA', 'F', 'Santa_Rosa', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Santa_Rosa.html'),
    ('Santa Rosa Junior College', 'SANTA ROSA', 'M', 'Santa_Rosa', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Santa_Rosa.html'),
    ('Shasta College', 'SHASTA', 'F', 'Shasta', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Shasta.html'),
    ('Shasta College', 'SHASTA', 'M', 'Shasta', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Shasta.html'),
    ('Southwestern Oregon Community College', 'SW OREGON CC', 'F', 'SW_Oregon_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_f_SW_Oregon_CC.html'),
    ('Southwestern Oregon Community College', 'SW OREGON CC', 'M', 'SW_Oregon_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_m_SW_Oregon_CC.html'),
    ('Texas Southmost College', 'TEXAS SOUTHMOST COLLEGE', 'F', 'Texas_Southmost_College', 'https://www.tfrrs.org/teams/tf/TX_jcollege_f_Texas_Southmost_College.html'),
    ('Texas Southmost College', 'TEXAS SOUTHMOST COLLEGE', 'M', 'Texas_Southmost_College', 'https://www.tfrrs.org/teams/tf/TX_jcollege_m_Texas_Southmost_College.html'),
    ('United States Sports University', 'USSU', 'F', 'United_States_Sports_Academy', 'https://www.tfrrs.org/teams/tf/AL_college_f_United_States_Sports_Academy.html'),
    ('University of Arkansas - Fort Smith', 'UA-FORT SMITH', 'F', 'Arkansas-Fort_Smith', 'https://www.tfrrs.org/teams/tf/AR_college_f_Arkansas-Fort_Smith.html'),
    ('University of Arkansas - Fort Smith', 'UA-FORT SMITH', 'M', 'Arkansas-Fort_Smith', 'https://www.tfrrs.org/teams/tf/AR_college_m_Arkansas-Fort_Smith.html'),
    ('University of Fort Lauderdale', 'FORT LAUDERDALE', 'M', 'University_of_Fort_Lauderdale', 'https://www.tfrrs.org/teams/tf/FL_college_m_University_of_Fort_Lauderdale.html'),
    ('University of Valley Forge', 'VALLEY FORGE', 'F', 'Valley_Forge_Christian', 'https://www.tfrrs.org/teams/tf/PA_college_f_Valley_Forge_Christian.html'),
    ('University of Valley Forge', 'VALLEY FORGE', 'M', 'Valley_Forge_Christian', 'https://www.tfrrs.org/teams/tf/PA_college_m_Valley_Forge_Christian.html'),
    ('Vaughn College of Aeronautics and Technology', 'VAUGHN', 'M', 'Vaughn', 'https://www.tfrrs.org/teams/tf/NY_college_m_Vaughn.html'),
    ('Victoria College', 'VICTORIA COLLEGE', 'M', 'Victoria_College', 'https://www.tfrrs.org/teams/tf/TX_jcollege_m_Victoria_College.html'),
    ('Walters State Community College', 'WALTERS STATE CC', 'F', 'Walters_State_CC', 'https://www.tfrrs.org/teams/tf/TN_jcollege_f_Walters_State_CC.html'),
    ('Walters State Community College', 'WALTERS STATE CC', 'M', 'Walters_State_CC', 'https://www.tfrrs.org/teams/tf/TN_jcollege_m_Walters_State_CC.html'),
    ('Yuba College', 'YUBA', 'F', 'Yuba', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Yuba.html'),
    ('Yuba College', 'YUBA', 'M', 'Yuba', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Yuba.html')
  ), resolved AS (
    SELECT d.*, t.team_id
    FROM desired d
    JOIN public.schools s ON lower(s.official_name) = lower(d.official_name)
    JOIN public.teams t ON t.school_id = s.school_id AND t.gender = d.gender
  )
  SELECT count(*) INTO conflict_count
  FROM resolved r
  JOIN ingest.team_aliases a
    ON a.source = 'tfrrs'
   AND a.normalized_source_team_key = lower(trim(regexp_replace(r.source_key, '[^a-zA-Z0-9]+', ' ', 'g')))
   AND a.source_gender = r.gender
  WHERE a.team_id <> r.team_id;
  IF conflict_count <> 0 THEN
    RAISE EXCEPTION '% conflicting reviewed TFRRS team aliases exist', conflict_count;
  END IF;
END $$;

WITH desired (official_name, source_name, gender, source_key, source_url) AS (
  VALUES
    ('American River College', 'AMERICAN RIVER', 'F', 'American_River', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_American_River.html'),
    ('American River College', 'AMERICAN RIVER', 'M', 'American_River', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_American_River.html'),
    ('Butte College', 'BUTTE', 'F', 'Butte', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Butte.html'),
    ('Butte College', 'BUTTE', 'M', 'Butte', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Butte.html'),
    ('Chabot College', 'CHABOT', 'F', 'Chabot', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Chabot.html'),
    ('Chabot College', 'CHABOT', 'M', 'Chabot', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Chabot.html'),
    ('Champion Christian College', 'CHAMPION CHRISTIAN COLLEGE', 'M', 'Champion_Christian_College', 'https://www.tfrrs.org/teams/tf/AR_college_m_Champion_Christian_College.html'),
    ('Clackamas Community College', 'CLACKAMAS CC', 'F', 'Clackamas_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_f_Clackamas_CC.html'),
    ('Clackamas Community College', 'CLACKAMAS CC', 'M', 'Clackamas_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_m_Clackamas_CC.html'),
    ('Clark College', 'CLARK COLLEGE', 'F', 'Clark_College', 'https://www.tfrrs.org/teams/tf/WA_jcollege_f_Clark_College.html'),
    ('Clark College', 'CLARK COLLEGE', 'M', 'Clark_College', 'https://www.tfrrs.org/teams/tf/WA_jcollege_m_Clark_College.html'),
    ('Clovis Community College', 'CLOVIS CC', 'F', 'Clovis_CC', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Clovis_CC.html'),
    ('Clovis Community College', 'CLOVIS CC', 'M', 'Clovis_CC', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Clovis_CC.html'),
    ('College of San Mateo', 'SAN MATEO', 'F', 'San_Mateo', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_San_Mateo.html'),
    ('College of San Mateo', 'SAN MATEO', 'M', 'San_Mateo', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_San_Mateo.html'),
    ('College of the Redwoods', 'REDWOODS', 'F', 'Redwoods', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Redwoods.html'),
    ('College of the Redwoods', 'REDWOODS', 'M', 'Redwoods', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Redwoods.html'),
    ('College of the Sequoias', 'SEQUOIAS', 'F', 'Sequoias', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Sequoias.html'),
    ('College of the Sequoias', 'SEQUOIAS', 'M', 'Sequoias', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Sequoias.html'),
    ('Colorado Mountain College', 'COLORADO MOUNTAIN COLLEGE', 'F', 'Colorado_Mountain_College', 'https://www.tfrrs.org/teams/tf/CO_college_f_Colorado_Mountain_College.html'),
    ('Colorado Northwestern Community College', 'COLORADO NORTHWESTERN CC', 'M', 'Colorado_Northwestern_CC', 'https://www.tfrrs.org/teams/tf/CO_jcollege_m_Colorado_Northwestern_CC.html'),
    ('Dallas Christian College', 'DALLAS CHRISTIAN', 'M', 'DallasChristian', 'https://www.tfrrs.org/teams/tf/TX_college_m_DallasChristian.html'),
    ('De Anza College', 'DE ANZA', 'F', 'De_Anza', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_De_Anza.html'),
    ('De Anza College', 'DE ANZA', 'M', 'De_Anza', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_De_Anza.html'),
    ('Diablo Valley College', 'DIABLO VALLEY', 'F', 'Diablo_Valley', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Diablo_Valley.html'),
    ('Diablo Valley College', 'DIABLO VALLEY', 'M', 'Diablo_Valley', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Diablo_Valley.html'),
    ('Dine College', 'DINE COLLEGE (AZ)', 'F', 'Dine_College_AZ', 'https://www.tfrrs.org/teams/tf/AZ_jcollege_f_Dine_College_AZ.html'),
    ('Dine College', 'DINE COLLEGE (AZ)', 'M', 'Dine_College_AZ', 'https://www.tfrrs.org/teams/tf/AZ_jcollege_m_Dine_College_AZ.html'),
    ('Everett Community College', 'EVERETT CC', 'F', 'Everett_CC', 'https://www.tfrrs.org/teams/tf/WA_jcollege_f_Everett_CC.html'),
    ('Everett Community College', 'EVERETT CC', 'M', 'Everett_CC', 'https://www.tfrrs.org/teams/tf/WA_jcollege_m_Everett_CC.html'),
    ('Faith Baptist Bible College', 'FAITH BAPTIST BIBLE', 'F', 'Faith_Baptist_Bible', 'https://www.tfrrs.org/teams/tf/IA_college_f_Faith_Baptist_Bible.html'),
    ('Faith Baptist Bible College', 'FAITH BAPTIST BIBLE', 'M', 'Faith_Baptist_Bible', 'https://www.tfrrs.org/teams/tf/IA_college_m_Faith_Baptist_Bible.html'),
    ('Fresno City College', 'FRESNO', 'F', 'Fresno', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Fresno.html'),
    ('Fresno City College', 'FRESNO', 'M', 'Fresno', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Fresno.html'),
    ('Green River College', 'GREEN RIVER COLLEGE', 'F', 'Green_River_CC', 'https://www.tfrrs.org/teams/tf/WA_jcollege_f_Green_River_CC.html'),
    ('Green River College', 'GREEN RIVER COLLEGE', 'M', 'Green_River_CC', 'https://www.tfrrs.org/teams/tf/WA_jcollege_m_Green_River_CC.html'),
    ('Hartnell College', 'HARTNELL', 'F', 'Hartnell', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Hartnell.html'),
    ('Hartnell College', 'HARTNELL', 'M', 'Hartnell', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Hartnell.html'),
    ('Johnson & Wales University Charlotte', 'JOHNSON & WALES (N.C.)', 'F', 'Johnson__Wales_NC', 'https://www.tfrrs.org/teams/tf/NC_college_f_Johnson__Wales_NC.html'),
    ('Lake Tahoe Community College', 'LAKE TAHOE', 'F', 'Lake_Tahoe', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Lake_Tahoe.html'),
    ('Lake Tahoe Community College', 'LAKE TAHOE', 'M', 'Lake_Tahoe', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Lake_Tahoe.html'),
    ('Lane Community College', 'LANE CC', 'F', 'Lane_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_f_Lane_CC.html'),
    ('Lane Community College', 'LANE CC', 'M', 'Lane_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_m_Lane_CC.html'),
    ('Madera Community College', 'MADERA CC', 'M', 'Madera_CC', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Madera_CC.html'),
    ('Merritt College', 'MERRITT', 'F', 'Merritt', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Merritt.html'),
    ('Merritt College', 'MERRITT', 'M', 'Merritt', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Merritt.html'),
    ('Modesto Junior College', 'MODESTO', 'F', 'Modesto', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Modesto.html'),
    ('Modesto Junior College', 'MODESTO', 'M', 'Modesto', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Modesto.html'),
    ('Monterey Peninsula College', 'MONTEREY PENINSULA', 'F', 'Monterey_Peninsula', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Monterey_Peninsula.html'),
    ('Monterey Peninsula College', 'MONTEREY PENINSULA', 'M', 'Monterey_Peninsula', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Monterey_Peninsula.html'),
    ('Mt. Hood Community College', 'MT. HOOD CC', 'F', 'Mt_Hood_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_f_Mt_Hood_CC.html'),
    ('Mt. Hood Community College', 'MT. HOOD CC', 'M', 'Mt_Hood_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_m_Mt_Hood_CC.html'),
    ('North American University', 'NORTH AMERICAN', 'F', 'North_American', 'https://www.tfrrs.org/teams/tf/TX_college_f_North_American.html'),
    ('North American University', 'NORTH AMERICAN', 'M', 'North_American', 'https://www.tfrrs.org/teams/tf/TX_college_m_North_American.html'),
    ('NorthWest Arkansas Community College', 'NORTHWEST ARKANSAS CC', 'F', 'NorthWest_Arkansas', 'https://www.tfrrs.org/teams/tf/AR_jcollege_f_NorthWest_Arkansas.html'),
    ('NorthWest Arkansas Community College', 'NORTHWEST ARKANSAS CC', 'M', 'NorthWest_Arkansas', 'https://www.tfrrs.org/teams/tf/AR_jcollege_m_NorthWest_Arkansas.html'),
    ('Penn State Fayette, The Eberly Campus', 'PSU-FAYETTE', 'M', 'PSU-Fayette', 'https://www.tfrrs.org/teams/tf/PA_college_m_PSU-Fayette.html'),
    ('Penn State Scranton', 'PSU-SCRANTON', 'F', 'PSU-Scranton', 'https://www.tfrrs.org/teams/tf/PA_college_f_PSU-Scranton.html'),
    ('Penn State Scranton', 'PSU-SCRANTON', 'M', 'PSU-Scranton', 'https://www.tfrrs.org/teams/tf/PA_college_m_PSU-Scranton.html'),
    ('Pierce College', 'PIERCE COLLEGE (WA)', 'F', 'Pierce_College_WA', 'https://www.tfrrs.org/teams/tf/WA_jcollege_f_Pierce_College_WA.html'),
    ('Roane State Community College', 'ROANE STATE', 'F', 'Roane_State_Community_College', 'https://www.tfrrs.org/teams/tf/TN_jcollege_f_Roane_State_Community_College.html'),
    ('Roane State Community College', 'ROANE STATE', 'M', 'Roane_State_Community_College', 'https://www.tfrrs.org/teams/tf/TN_jcollege_m_Roane_State_Community_College.html'),
    ('Sacramento City College', 'SACRAMENTO', 'F', 'Sacramento', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Sacramento.html'),
    ('Sacramento City College', 'SACRAMENTO', 'M', 'Sacramento', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Sacramento.html'),
    ('San Joaquin Delta College', 'SAN JOAQUIN DELTA', 'F', 'San_Joaquin_Delta', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_San_Joaquin_Delta.html'),
    ('San Joaquin Delta College', 'SAN JOAQUIN DELTA', 'M', 'San_Joaquin_Delta', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_San_Joaquin_Delta.html'),
    ('San Jose City College', 'SAN JOSE', 'F', 'San_Jose', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_San_Jose.html'),
    ('San Jose City College', 'SAN JOSE', 'M', 'San_Jose', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_San_Jose.html'),
    ('Santa Rosa Junior College', 'SANTA ROSA', 'F', 'Santa_Rosa', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Santa_Rosa.html'),
    ('Santa Rosa Junior College', 'SANTA ROSA', 'M', 'Santa_Rosa', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Santa_Rosa.html'),
    ('Shasta College', 'SHASTA', 'F', 'Shasta', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Shasta.html'),
    ('Shasta College', 'SHASTA', 'M', 'Shasta', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Shasta.html'),
    ('Southwestern Oregon Community College', 'SW OREGON CC', 'F', 'SW_Oregon_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_f_SW_Oregon_CC.html'),
    ('Southwestern Oregon Community College', 'SW OREGON CC', 'M', 'SW_Oregon_CC', 'https://www.tfrrs.org/teams/tf/OR_jcollege_m_SW_Oregon_CC.html'),
    ('Texas Southmost College', 'TEXAS SOUTHMOST COLLEGE', 'F', 'Texas_Southmost_College', 'https://www.tfrrs.org/teams/tf/TX_jcollege_f_Texas_Southmost_College.html'),
    ('Texas Southmost College', 'TEXAS SOUTHMOST COLLEGE', 'M', 'Texas_Southmost_College', 'https://www.tfrrs.org/teams/tf/TX_jcollege_m_Texas_Southmost_College.html'),
    ('United States Sports University', 'USSU', 'F', 'United_States_Sports_Academy', 'https://www.tfrrs.org/teams/tf/AL_college_f_United_States_Sports_Academy.html'),
    ('University of Arkansas - Fort Smith', 'UA-FORT SMITH', 'F', 'Arkansas-Fort_Smith', 'https://www.tfrrs.org/teams/tf/AR_college_f_Arkansas-Fort_Smith.html'),
    ('University of Arkansas - Fort Smith', 'UA-FORT SMITH', 'M', 'Arkansas-Fort_Smith', 'https://www.tfrrs.org/teams/tf/AR_college_m_Arkansas-Fort_Smith.html'),
    ('University of Fort Lauderdale', 'FORT LAUDERDALE', 'M', 'University_of_Fort_Lauderdale', 'https://www.tfrrs.org/teams/tf/FL_college_m_University_of_Fort_Lauderdale.html'),
    ('University of Valley Forge', 'VALLEY FORGE', 'F', 'Valley_Forge_Christian', 'https://www.tfrrs.org/teams/tf/PA_college_f_Valley_Forge_Christian.html'),
    ('University of Valley Forge', 'VALLEY FORGE', 'M', 'Valley_Forge_Christian', 'https://www.tfrrs.org/teams/tf/PA_college_m_Valley_Forge_Christian.html'),
    ('Vaughn College of Aeronautics and Technology', 'VAUGHN', 'M', 'Vaughn', 'https://www.tfrrs.org/teams/tf/NY_college_m_Vaughn.html'),
    ('Victoria College', 'VICTORIA COLLEGE', 'M', 'Victoria_College', 'https://www.tfrrs.org/teams/tf/TX_jcollege_m_Victoria_College.html'),
    ('Walters State Community College', 'WALTERS STATE CC', 'F', 'Walters_State_CC', 'https://www.tfrrs.org/teams/tf/TN_jcollege_f_Walters_State_CC.html'),
    ('Walters State Community College', 'WALTERS STATE CC', 'M', 'Walters_State_CC', 'https://www.tfrrs.org/teams/tf/TN_jcollege_m_Walters_State_CC.html'),
    ('Yuba College', 'YUBA', 'F', 'Yuba', 'https://www.tfrrs.org/teams/tf/CA_jcollege_f_Yuba.html'),
    ('Yuba College', 'YUBA', 'M', 'Yuba', 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_Yuba.html')
)
INSERT INTO ingest.team_aliases (
  source, source_team_key, source_team_name, source_gender,
  normalized_source_team_key, normalized_source_team_name,
  team_id, match_method, notes
)
SELECT 'tfrrs', d.source_key, d.source_name, d.gender,
       lower(trim(regexp_replace(d.source_key, '[^a-zA-Z0-9]+', ' ', 'g'))),
       lower(trim(regexp_replace(d.source_name, '[^a-zA-Z0-9]+', ' ', 'g'))),
       t.team_id, 'verified_alias',
       'Association-confirmed collegiate source identity; reviewed 2026-09-06.'
FROM desired d
JOIN public.schools s ON lower(s.official_name) = lower(d.official_name)
JOIN public.teams t ON t.school_id = s.school_id AND t.gender = d.gender
ON CONFLICT (source, normalized_source_team_key, source_gender) DO UPDATE
SET source_team_key = EXCLUDED.source_team_key,
    source_team_name = EXCLUDED.source_team_name,
    normalized_source_team_name = EXCLUDED.normalized_source_team_name,
    team_id = EXCLUDED.team_id,
    status = 'active',
    match_method = EXCLUDED.match_method,
    notes = EXCLUDED.notes,
    verified_at = now(),
    updated_at = now();

COMMENT ON TABLE public.divisions IS
  'Canonical competition classifications. classification_kind distinguishes divisions, associations, and leagues.';
