-- Event Name Normalization - BATCHED VERSION
-- Run each batch separately in Supabase SQL Editor
-- Uses regex to catch ALL variations (Men's, Women's, Meters, Meter Dash, etc.)

-- ==========================================
-- BATCH 1: SPRINTS
-- ==========================================

-- 55m (all variations)
UPDATE results SET event_name = '55m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?55(\.0)?\s*(Meters?|m|Meter\s*Dash)?$' AND event_name != '55m';

-- 60m (all variations)
UPDATE results SET event_name = '60m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?60(\.0)?\s*(Meters?|m|Meter\s*Dash)?$' AND event_name != '60m';

-- 100m (all variations)
UPDATE results SET event_name = '100m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?100(\.0)?\s*(Meters?|m|Meter\s*Dash)?$' AND event_name != '100m';

-- 200m (all variations)
UPDATE results SET event_name = '200m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?200(\.0)?\s*(Meters?|m|M|Meter\s*Dash)?$' AND event_name != '200m';

-- 300m (all variations)
UPDATE results SET event_name = '300m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?300(\.0)?\s*(Meters?|m|Meter\s*Dash)?$' AND event_name != '300m';

-- 400m (all variations)
UPDATE results SET event_name = '400m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?400(\.0)?\s*(Meters?|m|Meter\s*Dash)?$' AND event_name != '400m';


-- ==========================================
-- BATCH 2: MIDDLE DISTANCE
-- ==========================================

-- 500m
UPDATE results SET event_name = '500m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?500(\.0)?\s*(Meters?|m|Meter\s*Run)?$' AND event_name != '500m';

-- 600m
UPDATE results SET event_name = '600m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?600(\.0)?\s*(Meters?|m|Meter\s*Run)?$' AND event_name != '600m';

-- 600y (yards)
UPDATE results SET event_name = '600y' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?600\s*(Y|Yards?)$' AND event_name != '600y';

-- 800m
UPDATE results SET event_name = '800m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?800(\.0)?\s*(Meters?|m|Meter\s*Run)?$' AND event_name != '800m';

-- 1000m
UPDATE results SET event_name = '1000m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?1000(\.0)?\s*(Meters?|m|Meter\s*Run)?$' AND event_name != '1000m';

-- 1500m
UPDATE results SET event_name = '1500m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?1500(\.0)?\s*(Meters?|m|Meter\s*Run)?$' AND event_name != '1500m';

-- Mile
UPDATE results SET event_name = 'Mile' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(1\s*)?Mile(\s*Run)?$' AND event_name != 'Mile';


-- ==========================================
-- BATCH 3: DISTANCE
-- ==========================================

-- 3000m
UPDATE results SET event_name = '3000m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?3000(\.0)?\s*(Meters?|m|Meter\s*Run)?$' AND event_name != '3000m';

-- 3200m / 2 Mile
UPDATE results SET event_name = '3200m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(3200|2\s*Mile)\s*(Meters?|m|Meter\s*Run)?$' AND event_name != '3200m';

-- 5000m / 5k
UPDATE results SET event_name = '5000m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(5000(\.0)?|5k)\s*(Meters?|m|Meter\s*Run)?$' AND event_name != '5000m';

-- 10000m / 10k
UPDATE results SET event_name = '10000m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(10,?000(\.0)?|10k)\s*(Meters?|m|Meter\s*Run)?$' AND event_name != '10000m';


-- ==========================================
-- BATCH 4: HURDLES
-- ==========================================

-- 55m Hurdles
UPDATE results SET event_name = '55m H' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?55\s*(m\s*)?(Hurdles?|H|Meter\s*Hurdles?)$' AND event_name != '55m H';

-- 60m Hurdles
UPDATE results SET event_name = '60m H' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?60\s*(m\s*)?(Hurdles?|H|Meter\s*Hurdles?)$' AND event_name != '60m H';

-- 100m Hurdles
UPDATE results SET event_name = '100m H' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?100\s*(m\s*)?(Hurdles?|H|Meter\s*Hurdles?)$' AND event_name != '100m H';

-- 110m Hurdles
UPDATE results SET event_name = '110m H' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?110\s*(m\s*)?(Hurdles?|H|Meter\s*Hurdles?)$' AND event_name != '110m H';

-- 400m Hurdles
UPDATE results SET event_name = '400m H' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?400\s*(m\s*)?(Hurdles?|H|Meter\s*Hurdles?)$' AND event_name != '400m H';

-- Steeplechase
UPDATE results SET event_name = '3000m SC' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(3000\s*(m\s*)?)?(Steeplechase|SC|3000S)$' AND event_name != '3000m SC';


-- ==========================================
-- BATCH 5: FIELD EVENTS - JUMPS
-- ==========================================

-- High Jump
UPDATE results SET event_name = 'High Jump' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(High\s*Jump|HJ)$' AND event_name != 'High Jump';

-- Long Jump
UPDATE results SET event_name = 'Long Jump' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(Long\s*Jump|LJ)$' AND event_name != 'Long Jump';

-- Triple Jump
UPDATE results SET event_name = 'Triple Jump' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(Triple\s*Jump|TJ)$' AND event_name != 'Triple Jump';

-- Pole Vault
UPDATE results SET event_name = 'Pole Vault' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(Pole\s*Vault|PV)$' AND event_name != 'Pole Vault';


-- ==========================================
-- BATCH 6: FIELD EVENTS - THROWS
-- ==========================================

-- Shot Put
UPDATE results SET event_name = 'Shot Put' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(Shot\s*Put|SP|Shot)$' AND event_name != 'Shot Put';

-- Discus
UPDATE results SET event_name = 'Discus' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(Discus(\s*Throw)?|DT)$' AND event_name != 'Discus';

-- Hammer
UPDATE results SET event_name = 'Hammer' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(Hammer(\s*Throw)?|HT)$' AND event_name != 'Hammer';

-- Javelin
UPDATE results SET event_name = 'Javelin' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(Javelin(\s*Throw)?|JT)$' AND event_name != 'Javelin';

-- Weight Throw
UPDATE results SET event_name = 'Weight Throw' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(Weight\s*Throw|WT|Weight)$' AND event_name != 'Weight Throw';


-- ==========================================
-- BATCH 7: MULTI-EVENTS
-- ==========================================

-- Heptathlon
UPDATE results SET event_name = 'Heptathlon' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(Heptathlon|Hep|HEP)$' AND event_name != 'Heptathlon';

-- Decathlon
UPDATE results SET event_name = 'Decathlon' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(Decathlon|Dec|DEC)$' AND event_name != 'Decathlon';

-- Pentathlon
UPDATE results SET event_name = 'Pentathlon' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(Pentathlon|Pent|PENT)$' AND event_name != 'Pentathlon';


-- ==========================================
-- BATCH 8: RELAYS (results table)
-- ==========================================

UPDATE results SET event_name = '4x100m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?4\s*x\s*100\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x100m';
UPDATE results SET event_name = '4x200m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?4\s*x\s*200\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x200m';
UPDATE results SET event_name = '4x400m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?4\s*x\s*400\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x400m';
UPDATE results SET event_name = '4x800m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?4\s*x\s*800\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x800m';
UPDATE results SET event_name = 'DMR' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(Distance\s*Medley\s*Relay|DMR|Distance\s*Medley)$' AND event_name != 'DMR';
UPDATE results SET event_name = 'SMR' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(Sprint\s*Medley\s*Relay|SMR|Sprint\s*Medley)$' AND event_name != 'SMR';


-- ==========================================
-- BATCH 9: RELAYS (relay_results table)
-- ==========================================

UPDATE relay_results SET event_name = '4x100m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?4\s*x\s*100\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x100m';
UPDATE relay_results SET event_name = '4x200m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?4\s*x\s*200\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x200m';
UPDATE relay_results SET event_name = '4x400m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?4\s*x\s*400\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x400m';
UPDATE relay_results SET event_name = '4x800m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?4\s*x\s*800\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x800m';
UPDATE relay_results SET event_name = 'DMR' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(Distance\s*Medley\s*Relay|DMR|Distance\s*Medley)$' AND event_name != 'DMR';
UPDATE relay_results SET event_name = 'SMR' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(Sprint\s*Medley\s*Relay|SMR|Sprint\s*Medley)$' AND event_name != 'SMR';


-- ==========================================
-- VERIFY: Check remaining variations
-- ==========================================
-- SELECT event_name, COUNT(*) as cnt FROM results GROUP BY event_name ORDER BY cnt DESC LIMIT 100;
