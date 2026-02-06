/**
 * Import PRs - Update is_pr flag on matching results
 * Optimized version - fewer API calls
 *
 * Usage:
 *   node import-prs.js          # Dry run
 *   node import-prs.js --commit # Actually update
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRS_FILE = path.join(__dirname, './output/scraped-prs.json');

async function importPRs(commit = false) {
  console.log('========================================');
  console.log(commit ? 'UPDATING PRs IN DATABASE' : 'DRY RUN');
  console.log('========================================\n');

  const prs = JSON.parse(fs.readFileSync(PRS_FILE, 'utf-8'));
  console.log(`Loaded ${prs.length.toLocaleString()} PRs\n`);

  // Filter to only "all" season PRs (these are the overall PRs)
  const allPrs = prs.filter(p => p.season === 'all');
  console.log(`"All" season PRs: ${allPrs.length.toLocaleString()}`);

  // Group PRs by athlete
  const prsByAthlete = {};
  for (const pr of allPrs) {
    if (!prsByAthlete[pr.athlete_id]) prsByAthlete[pr.athlete_id] = [];
    prsByAthlete[pr.athlete_id].push(pr);
  }

  const athleteIds = Object.keys(prsByAthlete).map(Number);
  console.log(`Processing ${athleteIds.length} athletes...\n`);

  let matched = 0;
  let notFound = 0;
  let alreadyPr = 0;
  const toUpdate = []; // result_ids to update

  // Process athletes in chunks (smaller to avoid row limits)
  const chunkSize = 20;
  for (let i = 0; i < athleteIds.length; i += chunkSize) {
    const chunk = athleteIds.slice(i, i + chunkSize);

    // Fetch all results for this chunk of athletes (with pagination)
    let results = [];
    let offset = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('results')
        .select('result_id, athlete_id, event_name, mark_raw, is_pr')
        .in('athlete_id', chunk)
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error('Error fetching results:', error.message);
        break;
      }

      if (!data || data.length === 0) break;
      results = results.concat(data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    // Index results by athlete -> event+mark (lowercase for case-insensitive)
    const resultIndex = {};
    for (const r of results) {
      const key = `${r.athlete_id}|${r.event_name.toLowerCase()}|${r.mark_raw}`;
      resultIndex[key] = r;
    }

    // Match PRs
    for (const athleteId of chunk) {
      const athletePrs = prsByAthlete[athleteId] || [];
      for (const pr of athletePrs) {
        const key = `${pr.athlete_id}|${pr.event_name.toLowerCase()}|${pr.mark_raw}`;
        const result = resultIndex[key];

        if (result) {
          matched++;
          if (result.is_pr) {
            alreadyPr++;
          } else {
            toUpdate.push(result.result_id);
          }
        } else {
          notFound++;
        }
      }
    }

    if ((i + chunkSize) % 500 === 0 || i + chunkSize >= athleteIds.length) {
      console.log(`  ${Math.min(i + chunkSize, athleteIds.length)}/${athleteIds.length} athletes | Matched: ${matched} | Already PR: ${alreadyPr} | To update: ${toUpdate.length} | Not found: ${notFound}`);
    }
  }

  console.log(`\n${toUpdate.length} results need is_pr=true`);

  if (!commit) {
    console.log('\n>>> DRY RUN - No changes made <<<');
    console.log('Run with --commit to update database');
    return;
  }

  // Batch update
  console.log('\nUpdating in batches of 500...');
  let updated = 0;
  for (let i = 0; i < toUpdate.length; i += 500) {
    const batch = toUpdate.slice(i, i + 500);
    const { error } = await supabase
      .from('results')
      .update({ is_pr: true })
      .in('result_id', batch);

    if (error) {
      console.error('Update error:', error.message);
    } else {
      updated += batch.length;
      console.log(`  Updated ${updated}/${toUpdate.length}`);
    }
  }

  console.log('\n========================================');
  console.log('COMPLETE');
  console.log('========================================');
  console.log(`Matched: ${matched}`);
  console.log(`Already marked as PR: ${alreadyPr}`);
  console.log(`Newly updated: ${updated}`);
  console.log(`Not found in results: ${notFound}`);
}

const commit = process.argv.includes('--commit');
importPRs(commit).catch(console.error);
