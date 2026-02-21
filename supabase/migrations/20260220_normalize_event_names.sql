-- Normalize event names in results table
-- This updates existing data to use consistent event names
-- Run this in Supabase SQL Editor

-- First, let's see what variations exist
-- SELECT DISTINCT event_name FROM results WHERE event_name ~* '60|200|400|800' ORDER BY event_name;

-- Normalize sprint events
UPDATE results SET event_name = '60m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?60\s*(Meters?|m|Meter\s*Dash)$' AND event_name != '60m';
UPDATE results SET event_name = '200m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?200\s*(Meters?|m|Meter\s*Dash)$' AND event_name != '200m';
UPDATE results SET event_name = '300m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?300\s*(Meters?|m|Meter\s*Dash)$' AND event_name != '300m';
UPDATE results SET event_name = '400m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?400\s*(Meters?|m|Meter\s*Dash)$' AND event_name != '400m';

-- Normalize middle distance events
UPDATE results SET event_name = '600m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?600\s*(Meters?|m|Meter\s*Run)?$' AND event_name != '600m';
UPDATE results SET event_name = '800m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?800\s*(Meters?|m|Meter\s*Run)?$' AND event_name != '800m';
UPDATE results SET event_name = '1000m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?1000\s*(Meters?|m|Meter\s*Run)?$' AND event_name != '1000m';
UPDATE results SET event_name = '1500m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?1500\s*(Meters?|m|Meter\s*Run)?$' AND event_name != '1500m';

-- Normalize Mile
UPDATE results SET event_name = 'Mile' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(1\s*)?Mile(\s*Run)?$' AND event_name != 'Mile';

-- Normalize distance events
UPDATE results SET event_name = '3000m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?3000\s*(Meters?|m|Meter\s*Run)?$' AND event_name != '3000m';
UPDATE results SET event_name = '5000m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?5000\s*(Meters?|m|Meter\s*Run)?$' AND event_name != '5000m';
UPDATE results SET event_name = '10000m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?10,?000\s*(Meters?|m|Meter\s*Run)?$' AND event_name != '10000m';

-- Normalize hurdles
UPDATE results SET event_name = '60m H' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?60\s*(m\s*)?(Hurdles?|H|Meter\s*Hurdles?)$' AND event_name != '60m H';
UPDATE results SET event_name = '100m H' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?100\s*(m\s*)?(Hurdles?|H|Meter\s*Hurdles?)$' AND event_name != '100m H';
UPDATE results SET event_name = '110m H' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?110\s*(m\s*)?(Hurdles?|H|Meter\s*Hurdles?)$' AND event_name != '110m H';
UPDATE results SET event_name = '400m H' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?400\s*(m\s*)?(Hurdles?|H|Meter\s*Hurdles?)$' AND event_name != '400m H';

-- Normalize steeplechase
UPDATE results SET event_name = '3000m SC' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(3000\s*(m\s*)?)?Steeplechase$' AND event_name != '3000m SC';

-- Normalize field events - jumps
UPDATE results SET event_name = 'High Jump' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?High\s*Jump$' AND event_name != 'High Jump';
UPDATE results SET event_name = 'Long Jump' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?Long\s*Jump$' AND event_name != 'Long Jump';
UPDATE results SET event_name = 'Triple Jump' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?Triple\s*Jump$' AND event_name != 'Triple Jump';
UPDATE results SET event_name = 'Pole Vault' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?Pole\s*Vault$' AND event_name != 'Pole Vault';

-- Normalize field events - throws
UPDATE results SET event_name = 'Shot Put' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?Shot\s*Put$' AND event_name != 'Shot Put';
UPDATE results SET event_name = 'Discus' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?Discus(\s*Throw)?$' AND event_name != 'Discus';
UPDATE results SET event_name = 'Hammer' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?Hammer(\s*Throw)?$' AND event_name != 'Hammer';
UPDATE results SET event_name = 'Javelin' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?Javelin(\s*Throw)?$' AND event_name != 'Javelin';
UPDATE results SET event_name = 'Weight Throw' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(Weight\s*Throw|WT)$' AND event_name != 'Weight Throw';

-- Normalize relays
UPDATE results SET event_name = '4x100m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?4\s*x\s*100\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x100m';
UPDATE results SET event_name = '4x200m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?4\s*x\s*200\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x200m';
UPDATE results SET event_name = '4x400m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?4\s*x\s*400\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x400m';
UPDATE results SET event_name = '4x800m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?4\s*x\s*800\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x800m';
UPDATE results SET event_name = 'DMR' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(Distance\s*Medley\s*Relay|DMR)$' AND event_name != 'DMR';
UPDATE results SET event_name = 'SMR' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(Sprint\s*Medley\s*Relay|SMR)$' AND event_name != 'SMR';

-- Normalize multi-events
UPDATE results SET event_name = 'Heptathlon' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?Heptathlon$' AND event_name != 'Heptathlon';
UPDATE results SET event_name = 'Decathlon' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?Decathlon$' AND event_name != 'Decathlon';
UPDATE results SET event_name = 'Pentathlon' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?Pentathlon$' AND event_name != 'Pentathlon';

-- Also update relay_results table
UPDATE relay_results SET event_name = '4x100m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?4\s*x\s*100\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x100m';
UPDATE relay_results SET event_name = '4x200m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?4\s*x\s*200\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x200m';
UPDATE relay_results SET event_name = '4x400m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?4\s*x\s*400\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x400m';
UPDATE relay_results SET event_name = '4x800m' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?4\s*x\s*800\s*(m|Meters?)?\s*(Relay)?$' AND event_name != '4x800m';
UPDATE relay_results SET event_name = 'DMR' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(Distance\s*Medley\s*Relay|DMR)$' AND event_name != 'DMR';
UPDATE relay_results SET event_name = 'SMR' WHERE event_name ~* '^(Men''?s?\s+|Women''?s?\s+)?(Sprint\s*Medley\s*Relay|SMR)$' AND event_name != 'SMR';

-- Show summary of remaining un-normalized event names (for debugging)
-- SELECT event_name, COUNT(*) as cnt FROM results GROUP BY event_name ORDER BY cnt DESC LIMIT 50;
