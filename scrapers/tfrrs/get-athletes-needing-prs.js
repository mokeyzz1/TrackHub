/**
 * Get athletes that need PRs scraped
 *
 * Finds current roster athletes who don't have PRs in athlete_prs table
 * and outputs them to athletes-needing-data.json for the scraper
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const OUTPUT_FILE = path.join(__dirname, './output/athletes-needing-data.json');

async function getAthletesNeedingPRs() {
  console.log('Getting athletes that need PRs scraped...\n');

  // Get all athlete_ids that already have PRs (paginated)
  console.log('Loading existing PRs...');
  const athleteIdsWithPRs = new Set();
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('athlete_prs')
      .select('athlete_id')
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error loading PRs:', error.message);
      break;
    }

    if (!data || data.length === 0) break;
    data.forEach(r => athleteIdsWithPRs.add(r.athlete_id));
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`Athletes with PRs: ${athleteIdsWithPRs.size.toLocaleString()}`);

  // Get current roster athletes (updated in 2026)
  console.log('\nLoading current roster athletes...');
  const athletes = [];
  offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('athletes')
      .select('athlete_id, full_name, tfrrs_profile_url')
      .gte('updated_at', '2026-01-01')
      .not('tfrrs_profile_url', 'is', null)
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error loading athletes:', error.message);
      break;
    }

    if (!data || data.length === 0) break;
    athletes.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`Current roster athletes: ${athletes.length.toLocaleString()}`);

  // Filter to only those without PRs
  const needsPRs = athletes.filter(a => !athleteIdsWithPRs.has(a.athlete_id));

  console.log(`Athletes needing PRs: ${needsPRs.length.toLocaleString()}`);

  // Save to file
  const output = {
    generated_at: new Date().toISOString(),
    total_athletes: needsPRs.length,
    athletes: needsPRs
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nSaved to: ${OUTPUT_FILE}`);

  // Show sample
  console.log('\nSample athletes (first 5):');
  needsPRs.slice(0, 5).forEach(a => {
    console.log(`  ${a.athlete_id} | ${a.full_name}`);
  });
}

getAthletesNeedingPRs().catch(console.error);
