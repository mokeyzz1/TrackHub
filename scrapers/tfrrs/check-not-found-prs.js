const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const prs = JSON.parse(fs.readFileSync('./output/scraped-prs.json', 'utf-8'));
  const allPrs = prs.filter(p => p.season === 'all');

  let notFound = [];

  for (const pr of allPrs) {
    const { data: results } = await supabase
      .from('results')
      .select('event_name, mark_raw')
      .eq('athlete_id', pr.athlete_id);

    const found = results && results.find(r =>
      r.event_name.toLowerCase() === pr.event_name.toLowerCase() &&
      r.mark_raw === pr.mark_raw
    );

    if (found === undefined || found === null) {
      notFound.push({
        pr: pr,
        athleteResults: results ? results.slice(0, 10) : []
      });
    }

    if (notFound.length >= 10) break;
  }

  console.log('Sample of NOT FOUND PRs:\n');
  for (const nf of notFound.slice(0, 5)) {
    console.log('PR:', nf.pr.athlete_id, '|', nf.pr.event_name, '|', nf.pr.mark_raw);
    console.log('Results in DB for this athlete:');
    if (nf.athleteResults.length === 0) {
      console.log('  (NO RESULTS IN DB)');
    } else {
      nf.athleteResults.forEach(r => console.log('  ', r.event_name, '|', r.mark_raw));
    }
    console.log('');
  }
}

check().catch(console.error);
