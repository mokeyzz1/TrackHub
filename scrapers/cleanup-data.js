/**
 * Clean up data quality issues in the results table
 *
 * Step 1: Normalize round names (P, Preliminaries, Heat X → Prelim; F, Finals → Final)
 * Step 2: Delete duplicates (run SQL manually in Supabase)
 * Step 3: Fix meet names with extra whitespace
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY_RUN = process.argv.includes('--dry-run');

async function cleanup() {
  console.log(`=== DATA CLEANUP ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

  // Step 1: Normalize round names
  console.log('Step 1: Normalizing round names...\n');

  const normalizations = [
    { from: 'Heat%', to: 'Prelim', isLike: true, desc: 'Heat X → Prelim' },
    { from: 'P', to: 'Prelim', isLike: false, desc: 'P → Prelim' },
    { from: 'Preliminaries', to: 'Prelim', isLike: false, desc: 'Preliminaries → Prelim' },
    { from: 'Preliminary', to: 'Prelim', isLike: false, desc: 'Preliminary → Prelim' },
    { from: 'F', to: 'Final', isLike: false, desc: 'F → Final' },
    { from: 'Finals', to: 'Final', isLike: false, desc: 'Finals → Final' },
  ];

  for (const norm of normalizations) {
    let query = supabase.from('results').select('*', { count: 'exact', head: true });
    if (norm.isLike) {
      query = query.ilike('round', norm.from);
    } else {
      query = query.eq('round', norm.from);
    }
    const { count } = await query;

    if (count > 0) {
      if (!DRY_RUN) {
        let updateQuery = supabase.from('results').update({ round: norm.to });
        if (norm.isLike) {
          updateQuery = updateQuery.ilike('round', norm.from);
        } else {
          updateQuery = updateQuery.eq('round', norm.from);
        }
        const { error } = await updateQuery;
        if (error) {
          console.error(`  Error: ${norm.desc}:`, error.message);
        } else {
          console.log(`  ✓ ${norm.desc}: ${count?.toLocaleString()} rows`);
        }
      } else {
        console.log(`  ${norm.desc}: would update ${count?.toLocaleString()} rows`);
      }
    }
  }

  // Step 2: Delete duplicates - provide SQL
  console.log('\nStep 2: Delete duplicates...\n');
  console.log('  After normalization, run this SQL in Supabase SQL Editor:');
  console.log(`
  ---------------------------------------------------------------
  -- Delete duplicate results (same athlete/meet/date/event/mark/round)
  -- Keeps the one with the lowest result_id
  ---------------------------------------------------------------
  DELETE FROM results a
  USING results b
  WHERE a.result_id > b.result_id
    AND a.athlete_id = b.athlete_id
    AND a.meet_name = b.meet_name
    AND a.date = b.date
    AND a.event_name = b.event_name
    AND a.mark_raw = b.mark_raw
    AND a.round = b.round
    AND a.date IS NOT NULL;
  ---------------------------------------------------------------
  `);

  // Step 3: Fix meet names with extra spaces
  console.log('Step 3: Fixing meet names with extra whitespace...\n');

  const { data: sampleMeets } = await supabase
    .from('results')
    .select('meet_name')
    .not('meet_name', 'is', null)
    .limit(50000);

  const extraSpaceMeets = new Set();
  sampleMeets?.forEach(r => {
    if (r.meet_name && r.meet_name !== r.meet_name.replace(/\s+/g, ' ').trim()) {
      extraSpaceMeets.add(r.meet_name);
    }
  });

  if (extraSpaceMeets.size === 0) {
    console.log('  No meet names with extra spaces found');
  } else {
    for (const meetName of extraSpaceMeets) {
      const fixedName = meetName.replace(/\s+/g, ' ').trim();
      const { count } = await supabase
        .from('results')
        .select('*', { count: 'exact', head: true })
        .eq('meet_name', meetName);

      if (!DRY_RUN) {
        const { error } = await supabase
          .from('results')
          .update({ meet_name: fixedName })
          .eq('meet_name', meetName);

        if (error) {
          console.error(`  Error: "${meetName}":`, error.message);
        } else {
          console.log(`  ✓ "${meetName}" → "${fixedName}": ${count} rows`);
        }
      } else {
        console.log(`  "${meetName}" → "${fixedName}": would update ${count} rows`);
      }
    }
  }

  console.log('\n=== CLEANUP COMPLETE ===');

  // Verification
  console.log('\nVerifying...');
  const { count: heatCount } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true })
    .ilike('round', 'Heat%');
  console.log(`  Heat X rounds remaining: ${heatCount?.toLocaleString()}`);

  const { count: pCount } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true })
    .eq('round', 'P');
  console.log(`  P rounds remaining: ${pCount?.toLocaleString()}`);

  const { count: fCount } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true })
    .eq('round', 'F');
  console.log(`  F rounds remaining: ${fCount?.toLocaleString()}`);

  const { count: prelimCount } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true })
    .eq('round', 'Prelim');
  console.log(`  Prelim rounds: ${prelimCount?.toLocaleString()}`);

  const { count: finalCount } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true })
    .eq('round', 'Final');
  console.log(`  Final rounds: ${finalCount?.toLocaleString()}`);
}

cleanup().catch(console.error);
