/**
 * Import Retry Results and PRs
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseDate(dateStr) {
  if (!dateStr) return null;

  // Handle date ranges like "Mar 31-Apr 1, 2023" - take first date
  const match = dateStr.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}).*?(\d{4})/i);
  if (match) {
    const months = {Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
    const month = months[match[1]];
    const day = parseInt(match[2]);
    const year = parseInt(match[3]);
    return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  // If already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  return null;
}

async function importRetryData() {
  console.log('========================================');
  console.log('IMPORT RETRY DATA');
  console.log('========================================\n');

  // Import results
  const results = JSON.parse(fs.readFileSync('./output/retry-results.json', 'utf-8'));
  console.log(`Loaded ${results.length} results\n`);

  let resultImported = 0;
  let resultErrors = 0;

  for (const r of results) {
    const row = {
      athlete_id: r.athlete_id,
      event_name: r.event_name,
      mark_raw: r.mark_raw,
      meet_name: r.meet_name || null,
      date: parseDate(r.date),
      place: r.place || null
    };

    const { error } = await supabase.from('results').insert(row);
    if (error) {
      resultErrors++;
      if (resultErrors <= 3) {
        console.log('Result error:', error.message);
      }
    } else {
      resultImported++;
    }

    if ((resultImported + resultErrors) % 1000 === 0) {
      console.log(`  Progress: ${resultImported + resultErrors}/${results.length}`);
    }
  }

  console.log(`\nResults: ${resultImported} imported, ${resultErrors} errors`);

  // PRs already imported (3340 succeeded earlier)
  console.log('\nPRs were already imported (3340)');

  console.log('\n========================================');
  console.log('COMPLETE');
  console.log('========================================');
}

importRetryData().catch(console.error);
