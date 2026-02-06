/**
 * Get Athletes Without Results
 *
 * Finds athletes in the database who have no results yet.
 * Outputs them to athletes-needing-data.json for the scraper.
 *
 * Usage:
 *   node get-athletes-without-results.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const OUTPUT_FILE = path.join(__dirname, './output/athletes-needing-data.json');

async function getAthletesWithoutResults() {
  console.log('========================================');
  console.log('GET ATHLETES WITHOUT RESULTS');
  console.log('========================================\n');

  // Step 1: Get all athlete IDs that have results
  console.log('Step 1: Loading athletes with results...');
  const athletesWithResults = new Set();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('results')
      .select('athlete_id')
      .range(offset, offset + 999);

    if (error) {
      console.error('Error:', error.message);
      break;
    }
    if (!data || data.length === 0) break;

    data.forEach(r => athletesWithResults.add(r.athlete_id));

    if (data.length < 1000) break;
    offset += 1000;

    if (offset % 500000 === 0) {
      console.log(`  ...processed ${offset.toLocaleString()} results`);
    }
  }

  console.log(`  Found ${athletesWithResults.size.toLocaleString()} athletes with results\n`);

  // Step 2: Get all athletes with TFRRS URLs who DON'T have results
  console.log('Step 2: Finding athletes without results...');
  const athletesNeedingData = [];
  offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('athletes')
      .select('athlete_id, full_name, tfrrs_profile_url, tfrrs_athlete_id')
      .not('tfrrs_profile_url', 'is', null)
      .range(offset, offset + 999);

    if (error) {
      console.error('Error:', error.message);
      break;
    }
    if (!data || data.length === 0) break;

    // Filter to only those without results
    for (const athlete of data) {
      if (!athletesWithResults.has(athlete.athlete_id)) {
        athletesNeedingData.push({
          athlete_id: athlete.athlete_id,
          full_name: athlete.full_name,
          tfrrs_profile_url: athlete.tfrrs_profile_url,
          tfrrs_athlete_id: athlete.tfrrs_athlete_id
        });
      }
    }

    if (data.length < 1000) break;
    offset += 1000;

    if (offset % 10000 === 0) {
      console.log(`  ...checked ${offset.toLocaleString()} athletes`);
    }
  }

  console.log(`  Found ${athletesNeedingData.length.toLocaleString()} athletes needing data\n`);

  // Step 3: Save to file
  const output = {
    generated_at: new Date().toISOString(),
    description: 'Athletes in database without any results - need TFRRS scraping',
    total_athletes: athletesNeedingData.length,
    athletes: athletesNeedingData
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log('========================================');
  console.log('COMPLETE');
  console.log('========================================');
  console.log(`Total athletes needing data: ${athletesNeedingData.length.toLocaleString()}`);
  console.log(`Saved to: ${OUTPUT_FILE}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Clear checkpoint: rm checkpoint.json');
  console.log('  2. Clear old output: rm output/scraped-results.json output/scraped-prs.json');
  console.log('  3. Run scraper: node scrape-athlete-results.js');
}

getAthletesWithoutResults().catch(console.error);
