/**
 * Get all athletes that need their results scraped
 * Outputs to: ../output/athletes-needing-data.json
 */

require('dotenv').config({ path: '../../../.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

const OUTPUT_DIR = path.join(__dirname, './output');

async function getAthletesNeedingData() {
  console.log('=== FETCHING ATHLETES NEEDING DATA ===\n');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // First, get all athlete IDs that have results
  console.log('Step 1: Getting athlete IDs that already have results...');

  const athleteIdsWithResults = new Set();
  let offset = 0;
  const batchSize = 10000;

  while (true) {
    const { data, error } = await supabase
      .from('results')
      .select('athlete_id')
      .not('athlete_id', 'is', null)
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error('Error fetching results:', error);
      break;
    }

    if (!data || data.length === 0) break;

    data.forEach(r => athleteIdsWithResults.add(r.athlete_id));
    offset += batchSize;

    if (offset % 100000 === 0) {
      console.log(`  Processed ${offset.toLocaleString()} results...`);
    }
  }

  console.log(`  Found ${athleteIdsWithResults.size.toLocaleString()} unique athletes with results\n`);

  // Now get all athletes and filter out those with results
  console.log('Step 2: Getting all athletes from database...');

  const athletesNeedingData = [];
  offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('athletes')
      .select('athlete_id, full_name, tfrrs_profile_url, tfrrs_athlete_id, school_id, gender')
      .not('tfrrs_profile_url', 'is', null)
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error('Error fetching athletes:', error);
      break;
    }

    if (!data || data.length === 0) break;

    // Filter to only those without results
    const needingData = data.filter(a => !athleteIdsWithResults.has(a.athlete_id));
    athletesNeedingData.push(...needingData);

    offset += batchSize;

    if (offset % 50000 === 0) {
      console.log(`  Processed ${offset.toLocaleString()} athletes...`);
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total athletes in database: ${offset.toLocaleString()}`);
  console.log(`Athletes WITH results: ${athleteIdsWithResults.size.toLocaleString()}`);
  console.log(`Athletes NEEDING data: ${athletesNeedingData.length.toLocaleString()}`);

  // Save to JSON file
  const outputFile = path.join(OUTPUT_DIR, 'athletes-needing-data.json');

  const output = {
    generated_at: new Date().toISOString(),
    total_count: athletesNeedingData.length,
    athletes: athletesNeedingData
  };

  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`\nSaved to: ${outputFile}`);

  // Also save just the IDs for quick reference
  const idsFile = path.join(OUTPUT_DIR, 'athlete-ids-needing-data.json');
  fs.writeFileSync(idsFile, JSON.stringify(athletesNeedingData.map(a => a.athlete_id)));
  console.log(`IDs saved to: ${idsFile}`);

  return athletesNeedingData;
}

getAthletesNeedingData().catch(console.error);
