/**
 * Migrate PRs from results.is_pr=true to athlete_prs table
 *
 * Usage:
 *   node migrate-prs-to-table.js          # Dry run
 *   node migrate-prs-to-table.js --commit # Actually migrate
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Detect season from meet name and date
function detectSeason(meetName, date) {
  const name = (meetName || '').toLowerCase();
  const month = date ? new Date(date).getMonth() + 1 : null; // 1-12

  // XC keywords - must be explicit
  if (name.includes('cross country') || name.includes(' xc ') ||
      name.includes('xc ') || name.includes(' xc') ||
      name.includes('harrier') || name.includes('(xc)')) {
    return 'xc';
  }

  // Indoor keywords
  if (name.includes('indoor') || name.includes('armory') ||
      name.includes('fieldhouse') || name.includes('nyac') ||
      name.includes('winter') || name.includes('valentine')) {
    return 'indoor';
  }

  // Outdoor keywords
  if (name.includes('outdoor') || name.includes('twilight')) {
    return 'outdoor';
  }

  // Use date to determine season if no keywords
  if (month) {
    // XC: Sep-Nov
    if (month >= 9 && month <= 11) return 'xc';
    // Indoor: Dec-Mar
    if (month === 12 || month <= 3) return 'indoor';
    // Outdoor: Apr-Jul
    if (month >= 4 && month <= 7) return 'outdoor';
  }

  return 'all'; // Default if can't determine
}

async function migratePRs(commit = false) {
  console.log('========================================');
  console.log(commit ? 'MIGRATING PRs TO athlete_prs TABLE' : 'DRY RUN');
  console.log('========================================\n');

  // Get existing PRs in athlete_prs to avoid duplicates
  console.log('Loading existing athlete_prs...');
  const existingKeys = new Set();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('athlete_prs')
      .select('athlete_id, event_name, season')
      .range(offset, offset + 999);

    if (error) {
      console.error('Error loading existing PRs:', error.message);
      break;
    }
    if (!data || data.length === 0) break;

    data.forEach(pr => {
      existingKeys.add(`${pr.athlete_id}|${pr.event_name.toLowerCase()}|${pr.season}`);
    });

    if (data.length < 1000) break;
    offset += 1000;
  }

  console.log(`Found ${existingKeys.size.toLocaleString()} existing PRs in athlete_prs\n`);

  // Fetch all results with is_pr=true
  console.log('Loading results with is_pr=true...');
  const allResults = [];
  offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('results')
      .select('athlete_id, event_name, mark_raw, mark_seconds, mark_meters, date, meet_name')
      .eq('is_pr', true)
      .range(offset, offset + 999);

    if (error) {
      console.error('Error loading results:', error.message);
      break;
    }
    if (!data || data.length === 0) break;

    allResults.push(...data);
    offset += 1000;

    if (offset % 50000 === 0) {
      console.log(`  Loaded ${offset.toLocaleString()} results...`);
    }

    if (data.length < 1000) break;
  }

  console.log(`Loaded ${allResults.length.toLocaleString()} results with is_pr=true\n`);

  // Group by athlete+event+season and keep best mark
  console.log('Processing PRs (keeping best per athlete/event/season)...');
  const prMap = new Map(); // key -> PR object

  for (const r of allResults) {
    const season = detectSeason(r.meet_name, r.date);
    const key = `${r.athlete_id}|${r.event_name.toLowerCase()}|${season}`;

    // Skip if already exists in athlete_prs
    if (existingKeys.has(key)) continue;

    const existing = prMap.get(key);

    // Determine if this result is better
    let isBetter = !existing;
    if (existing && r.mark_seconds && existing.mark_seconds) {
      // For timed events, lower is better
      isBetter = r.mark_seconds < existing.mark_seconds;
    } else if (existing && r.mark_meters && existing.mark_meters) {
      // For field events, higher is better
      isBetter = r.mark_meters > existing.mark_meters;
    }

    if (isBetter) {
      prMap.set(key, {
        athlete_id: r.athlete_id,
        event_name: r.event_name,
        mark_raw: r.mark_raw,
        mark_seconds: r.mark_seconds,
        mark_meters: r.mark_meters,
        set_at: r.date,
        meet_name: r.meet_name,
        season: season
      });
    }
  }

  const newPRs = Array.from(prMap.values());
  console.log(`New PRs to insert: ${newPRs.length.toLocaleString()}`);

  // Count by season
  const bySeason = {};
  newPRs.forEach(pr => {
    bySeason[pr.season] = (bySeason[pr.season] || 0) + 1;
  });
  console.log('By season:', bySeason);

  // Sample
  console.log('\nSample PRs (first 5):');
  newPRs.slice(0, 5).forEach(pr => {
    console.log(`  ${pr.athlete_id} | ${pr.event_name} | ${pr.mark_raw} | ${pr.season} | ${pr.meet_name?.substring(0, 30)}`);
  });

  if (!commit) {
    console.log('\n>>> DRY RUN - No changes made <<<');
    console.log('Run with --commit to migrate');
    return;
  }

  // Insert in batches
  console.log('\nInserting in batches of 500...');
  let inserted = 0;
  let errors = 0;
  const batchSize = 500;

  for (let i = 0; i < newPRs.length; i += batchSize) {
    const batch = newPRs.slice(i, i + batchSize);

    const { error } = await supabase
      .from('athlete_prs')
      .insert(batch);

    if (error) {
      // Try one by one
      for (const row of batch) {
        const { error: rowError } = await supabase
          .from('athlete_prs')
          .insert(row);
        if (rowError) {
          errors++;
        } else {
          inserted++;
        }
      }
    } else {
      inserted += batch.length;
    }

    if ((i + batchSize) % 10000 === 0 || i + batchSize >= newPRs.length) {
      console.log(`  ${inserted.toLocaleString()}/${newPRs.length.toLocaleString()} inserted`);
    }
  }

  console.log('\n========================================');
  console.log('COMPLETE');
  console.log('========================================');
  console.log(`Inserted: ${inserted.toLocaleString()}`);
  console.log(`Errors: ${errors.toLocaleString()}`);
}

const commit = process.argv.includes('--commit');
migratePRs(commit).catch(console.error);
