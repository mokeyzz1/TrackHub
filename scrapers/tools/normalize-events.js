#!/usr/bin/env node
/**
 * Normalize event names in the database (BATCHED)
 * Run with: node normalize-events.js
 */

require('dotenv').config({ path: '../../frontend/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH_SIZE = 500;

// Direct mappings: old name -> new name
const DIRECT_MAPPINGS = {
  // Sprints
  '55': '55m', '55.0': '55m', '55 Meters': '55m', '55 Meter Dash': '55m',
  '60': '60m', '60.0': '60m', '60 Meters': '60m', '60 Meter Dash': '60m', '60 Meter': '60m',
  '100': '100m', '100.0': '100m', '100 Meters': '100m', '100 Meter Dash': '100m',
  '200': '200m', '200.0': '200m', '200 Meters': '200m', '200 Meter Dash': '200m', '200M': '200m',
  '300': '300m', '300.0': '300m', '300 Meters': '300m', '300 Meter Dash': '300m',
  '400': '400m', '400.0': '400m', '400 Meters': '400m', '400 Meter Dash': '400m',

  // Middle Distance
  '500': '500m', '500.0': '500m', '500 Meters': '500m',
  '600': '600m', '600.0': '600m', '600 Meters': '600m', '600 Meter Run': '600m',
  '600Y': '600y', '600 Yards': '600y',
  '800': '800m', '800.0': '800m', '800 Meters': '800m', '800 Meter Run': '800m',
  '1000': '1000m', '1000.0': '1000m', '1000 Meters': '1000m', '1000 Meter Run': '1000m',
  '1500': '1500m', '1500.0': '1500m', '1500 Meters': '1500m', '1500 Meter Run': '1500m',
  'MILE': 'Mile', 'Mile Run': 'Mile', '1 Mile': 'Mile', '1 Mile Run': 'Mile',

  // Distance
  '3000': '3000m', '3000.0': '3000m', '3000 Meters': '3000m', '3000 Meter Run': '3000m',
  '3200': '3200m', '2 Mile': '3200m',
  '5000': '5000m', '5000.0': '5000m', '5000 Meters': '5000m', '5000 Meter Run': '5000m', '5k': '5000m',
  '10000': '10000m', '10000.0': '10000m', '10,000': '10000m', '10000 Meters': '10000m', '10k': '10000m',

  // Hurdles
  '55H': '55m H', '55 Hurdles': '55m H', '55 Meter Hurdles': '55m H', '55m Hurdles': '55m H',
  '60H': '60m H', '60 Hurdles': '60m H', '60 Meter Hurdles': '60m H', '60m Hurdles': '60m H',
  '100H': '100m H', '100 Hurdles': '100m H', '100 Meter Hurdles': '100m H', '100m Hurdles': '100m H',
  '110H': '110m H', '110 Hurdles': '110m H', '110 Meter Hurdles': '110m H', '110m Hurdles': '110m H',
  '400H': '400m H', '400 Hurdles': '400m H', '400 Meter Hurdles': '400m H', '400m Hurdles': '400m H',

  // Steeplechase
  '3000S': '3000m SC', 'SC': '3000m SC', 'Steeplechase': '3000m SC', '3000 Steeplechase': '3000m SC',

  // Field Events - Jumps
  'HJ': 'High Jump',
  'LJ': 'Long Jump',
  'TJ': 'Triple Jump',
  'PV': 'Pole Vault',

  // Field Events - Throws
  'SP': 'Shot Put', 'Shot': 'Shot Put',
  'DT': 'Discus', 'Discus Throw': 'Discus',
  'HT': 'Hammer', 'Hammer Throw': 'Hammer',
  'JT': 'Javelin', 'Javelin Throw': 'Javelin',
  'WT': 'Weight Throw', 'Weight': 'Weight Throw',

  // Multi-events
  'Hep': 'Heptathlon', 'HEP': 'Heptathlon',
  'Dec': 'Decathlon', 'DEC': 'Decathlon',
  'Pent': 'Pentathlon', 'PENT': 'Pentathlon',

  // Relays
  '4x100': '4x100m', '4x100 Relay': '4x100m', '4 x 100': '4x100m',
  '4x200': '4x200m', '4x200 Relay': '4x200m', '4 x 200': '4x200m',
  '4x400': '4x400m', '4x400 Relay': '4x400m', '4 x 400': '4x400m',
  '4x800': '4x800m', '4x800 Relay': '4x800m', '4 x 800': '4x800m',
  'Distance Medley Relay': 'DMR', 'Distance Medley': 'DMR',
  'Sprint Medley Relay': 'SMR', 'Sprint Medley': 'SMR',
};

async function updateInBatches(oldName, newName) {
  let totalUpdated = 0;
  let hasMore = true;

  while (hasMore) {
    // Get a batch of result IDs to update
    const { data: batch, error: fetchError } = await supabase
      .from('results')
      .select('result_id')
      .eq('event_name', oldName)
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error(`  Error fetching batch for "${oldName}":`, fetchError.message);
      return totalUpdated;
    }

    if (!batch || batch.length === 0) {
      hasMore = false;
      break;
    }

    const ids = batch.map(r => r.result_id);

    // Update this batch
    const { error: updateError } = await supabase
      .from('results')
      .update({ event_name: newName })
      .in('result_id', ids);

    if (updateError) {
      console.error(`  Error updating batch for "${oldName}":`, updateError.message);
      return totalUpdated;
    }

    totalUpdated += ids.length;
    process.stdout.write(`  Updated ${totalUpdated} rows...\r`);

    // If we got less than BATCH_SIZE, we're done
    if (batch.length < BATCH_SIZE) {
      hasMore = false;
    }
  }

  return totalUpdated;
}

async function normalizeEvents() {
  console.log('Starting event name normalization...\n');

  let grandTotal = 0;

  for (const [oldName, newName] of Object.entries(DIRECT_MAPPINGS)) {
    // Skip if already normalized
    if (oldName === newName) continue;

    // Check if any records exist with this name
    const { count } = await supabase
      .from('results')
      .select('*', { count: 'exact', head: true })
      .eq('event_name', oldName);

    if (count && count > 0) {
      console.log(`\nNormalizing: "${oldName}" -> "${newName}" (${count} records)`);
      const updated = await updateInBatches(oldName, newName);
      console.log(`  Done: ${updated} rows updated`);
      grandTotal += updated;
    }
  }

  console.log(`\n========================================`);
  console.log(`Total rows updated: ${grandTotal}`);
  console.log(`========================================`);
}

normalizeEvents().catch(console.error);
