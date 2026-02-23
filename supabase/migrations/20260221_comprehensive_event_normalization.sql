-- Comprehensive Event Name Normalization
-- Run this in Supabase SQL Editor
-- Handles ALL variations including: 60.0, 55H, DT, HT, JT, WT, MILE, Dec, Hep, Pent, 3000S, 10k, etc.

-- ==========================================
-- SPRINTS - including decimal variations
-- ==========================================

-- 55m
UPDATE results SET event_name = '55m' WHERE event_name IN ('55', '55.0', '55 Meters', '55 Meter Dash') AND event_name != '55m';

-- 60m
UPDATE results SET event_name = '60m' WHERE event_name IN ('60', '60.0', '60 Meters', '60 Meter Dash') AND event_name != '60m';

-- 100m
UPDATE results SET event_name = '100m' WHERE event_name IN ('100', '100.0', '100 Meters', '100 Meter Dash') AND event_name != '100m';

-- 200m
UPDATE results SET event_name = '200m' WHERE event_name IN ('200', '200.0', '200 Meters', '200 Meter Dash', '200M') AND event_name != '200m';

-- 300m
UPDATE results SET event_name = '300m' WHERE event_name IN ('300', '300.0', '300 Meters', '300 Meter Dash') AND event_name != '300m';

-- 400m
UPDATE results SET event_name = '400m' WHERE event_name IN ('400', '400.0', '400 Meters', '400 Meter Dash') AND event_name != '400m';

-- ==========================================
-- MIDDLE DISTANCE
-- ==========================================

-- 500m
UPDATE results SET event_name = '500m' WHERE event_name IN ('500', '500.0', '500 Meters') AND event_name != '500m';

-- 600m (including yards)
UPDATE results SET event_name = '600m' WHERE event_name IN ('600', '600.0', '600 Meters', '600 Meter Run') AND event_name != '600m';
UPDATE results SET event_name = '600y' WHERE event_name IN ('600Y', '600 Yards') AND event_name != '600y';

-- 800m
UPDATE results SET event_name = '800m' WHERE event_name IN ('800', '800.0', '800 Meters', '800 Meter Run') AND event_name != '800m';

-- 1000m
UPDATE results SET event_name = '1000m' WHERE event_name IN ('1000', '1000.0', '1000 Meters', '1000 Meter Run') AND event_name != '1000m';

-- 1500m
UPDATE results SET event_name = '1500m' WHERE event_name IN ('1500', '1500.0', '1500 Meters', '1500 Meter Run') AND event_name != '1500m';

-- Mile (case normalization)
UPDATE results SET event_name = 'Mile' WHERE UPPER(event_name) IN ('MILE', 'MILE RUN', '1 MILE', '1 MILE RUN') AND event_name != 'Mile';

-- ==========================================
-- DISTANCE
-- ==========================================

-- 3000m
UPDATE results SET event_name = '3000m' WHERE event_name IN ('3000', '3000.0', '3000 Meters', '3000 Meter Run') AND event_name != '3000m';

-- 3200m
UPDATE results SET event_name = '3200m' WHERE event_name IN ('3200', '3200 Meters', '3200 Meter Run', '2 Mile') AND event_name != '3200m';

-- 5000m
UPDATE results SET event_name = '5000m' WHERE event_name IN ('5000', '5000.0', '5000 Meters', '5000 Meter Run', '5k') AND event_name != '5000m';

-- 10000m
UPDATE results SET event_name = '10000m' WHERE event_name IN ('10000', '10000.0', '10,000', '10,000 Meters', '10000 Meters', '10000 Meter Run', '10k') AND event_name != '10000m';

-- ==========================================
-- HURDLES - including short forms
-- ==========================================

-- 55m Hurdles
UPDATE results SET event_name = '55m H' WHERE event_name IN ('55H', '55 Hurdles', '55 Meter Hurdles', '55m Hurdles') AND event_name != '55m H';

-- 60m Hurdles
UPDATE results SET event_name = '60m H' WHERE event_name IN ('60H', '60 Hurdles', '60 Meter Hurdles', '60m Hurdles') AND event_name != '60m H';

-- 100m Hurdles
UPDATE results SET event_name = '100m H' WHERE event_name IN ('100H', '100 Hurdles', '100 Meter Hurdles', '100m Hurdles') AND event_name != '100m H';

-- 110m Hurdles
UPDATE results SET event_name = '110m H' WHERE event_name IN ('110H', '110 Hurdles', '110 Meter Hurdles', '110m Hurdles') AND event_name != '110m H';

-- 400m Hurdles
UPDATE results SET event_name = '400m H' WHERE event_name IN ('400H', '400 Hurdles', '400 Meter Hurdles', '400m Hurdles') AND event_name != '400m H';

-- ==========================================
-- STEEPLECHASE
-- ==========================================
UPDATE results SET event_name = '3000m SC' WHERE event_name IN ('3000S', 'SC', 'Steeplechase', '3000 Steeplechase', '3000m Steeplechase', '3000 Meter Steeplechase') AND event_name != '3000m SC';

-- ==========================================
-- FIELD EVENTS - JUMPS (full names)
-- ==========================================

UPDATE results SET event_name = 'High Jump' WHERE UPPER(event_name) IN ('HJ', 'HIGH JUMP') AND event_name != 'High Jump';
UPDATE results SET event_name = 'Long Jump' WHERE UPPER(event_name) IN ('LJ', 'LONG JUMP') AND event_name != 'Long Jump';
UPDATE results SET event_name = 'Triple Jump' WHERE UPPER(event_name) IN ('TJ', 'TRIPLE JUMP') AND event_name != 'Triple Jump';
UPDATE results SET event_name = 'Pole Vault' WHERE UPPER(event_name) IN ('PV', 'POLE VAULT') AND event_name != 'Pole Vault';

-- ==========================================
-- FIELD EVENTS - THROWS (full names)
-- ==========================================

UPDATE results SET event_name = 'Shot Put' WHERE UPPER(event_name) IN ('SP', 'SHOT PUT', 'SHOT') AND event_name != 'Shot Put';
UPDATE results SET event_name = 'Discus' WHERE UPPER(event_name) IN ('DT', 'DISCUS', 'DISCUS THROW') AND event_name != 'Discus';
UPDATE results SET event_name = 'Hammer' WHERE UPPER(event_name) IN ('HT', 'HAMMER', 'HAMMER THROW') AND event_name != 'Hammer';
UPDATE results SET event_name = 'Javelin' WHERE UPPER(event_name) IN ('JT', 'JAVELIN', 'JAVELIN THROW') AND event_name != 'Javelin';
UPDATE results SET event_name = 'Weight Throw' WHERE UPPER(event_name) IN ('WT', 'WEIGHT THROW', 'WEIGHT') AND event_name != 'Weight Throw';

-- ==========================================
-- RELAYS
-- ==========================================

UPDATE results SET event_name = '4x100m' WHERE event_name ~* '^4\s*x\s*100\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x100m';
UPDATE results SET event_name = '4x200m' WHERE event_name ~* '^4\s*x\s*200\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x200m';
UPDATE results SET event_name = '4x400m' WHERE event_name ~* '^4\s*x\s*400\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x400m';
UPDATE results SET event_name = '4x800m' WHERE event_name ~* '^4\s*x\s*800\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x800m';
UPDATE results SET event_name = 'DMR' WHERE UPPER(event_name) IN ('DMR', 'DISTANCE MEDLEY RELAY', 'DISTANCE MEDLEY') AND event_name != 'DMR';
UPDATE results SET event_name = 'SMR' WHERE UPPER(event_name) IN ('SMR', 'SPRINT MEDLEY RELAY', 'SPRINT MEDLEY') AND event_name != 'SMR';

-- ==========================================
-- MULTI-EVENTS (case normalization)
-- ==========================================

UPDATE results SET event_name = 'Heptathlon' WHERE UPPER(event_name) IN ('HEP', 'HEPTATHLON') AND event_name != 'Heptathlon';
UPDATE results SET event_name = 'Decathlon' WHERE UPPER(event_name) IN ('DEC', 'DECATHLON') AND event_name != 'Decathlon';
UPDATE results SET event_name = 'Pentathlon' WHERE UPPER(event_name) IN ('PENT', 'PENTATHLON') AND event_name != 'Pentathlon';

-- ==========================================
-- RELAY RESULTS TABLE
-- ==========================================

UPDATE relay_results SET event_name = '4x100m' WHERE event_name ~* '^4\s*x\s*100\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x100m';
UPDATE relay_results SET event_name = '4x200m' WHERE event_name ~* '^4\s*x\s*200\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x200m';
UPDATE relay_results SET event_name = '4x400m' WHERE event_name ~* '^4\s*x\s*400\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x400m';
UPDATE relay_results SET event_name = '4x800m' WHERE event_name ~* '^4\s*x\s*800\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x800m';
UPDATE relay_results SET event_name = 'DMR' WHERE UPPER(event_name) IN ('DMR', 'DISTANCE MEDLEY RELAY', 'DISTANCE MEDLEY') AND event_name != 'DMR';
UPDATE relay_results SET event_name = 'SMR' WHERE UPPER(event_name) IN ('SMR', 'SPRINT MEDLEY RELAY', 'SPRINT MEDLEY') AND event_name != 'SMR';

-- ==========================================
-- SUMMARY - Check remaining variations
-- ==========================================
-- SELECT event_name, COUNT(*) as cnt FROM results GROUP BY event_name ORDER BY cnt DESC LIMIT 100;
