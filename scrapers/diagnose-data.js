/**
 * Diagnose data quality issues in the results table
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function diagnose() {
  console.log('=== DATA QUALITY DIAGNOSTIC ===\n');

  // 1. Total results
  const { count: totalResults } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true });
  console.log(`Total results: ${totalResults?.toLocaleString()}`);

  // 2. NULL dates
  const { count: nullDates } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true })
    .is('date', null);
  console.log(`Results with NULL date: ${nullDates?.toLocaleString()} (${(nullDates/totalResults*100).toFixed(1)}%)`);

  // 3. NULL rounds
  const { count: nullRounds } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true })
    .is('round', null);
  console.log(`Results with NULL round: ${nullRounds?.toLocaleString()} (${(nullRounds/totalResults*100).toFixed(1)}%)`);

  // 4. NULL meet_name
  const { count: nullMeets } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true })
    .is('meet_name', null);
  console.log(`Results with NULL meet_name: ${nullMeets?.toLocaleString()} (${(nullMeets/totalResults*100).toFixed(1)}%)`);

  // 5. Check Frank Sparks specifically for duplicates (we know he has them)
  console.log('\n--- Checking Frank Sparks (ID 69205) for duplicates ---');
  const { data: frankResults } = await supabase
    .from('results')
    .select('result_id, meet_name, date, mark_raw, event_name, round')
    .eq('athlete_id', 69205)
    .order('meet_name');

  console.log(`Frank's total results: ${frankResults?.length}`);

  // Group by meet+mark+event to find duplicates
  const frankGroups = {};
  frankResults?.forEach(r => {
    const key = `${r.meet_name}_${r.mark_raw}_${r.event_name}`;
    if (!frankGroups[key]) frankGroups[key] = [];
    frankGroups[key].push(r);
  });

  const frankDupes = Object.entries(frankGroups).filter(([k, v]) => v.length > 1);
  console.log(`Frank's duplicate groups: ${frankDupes.length}`);
  frankDupes.forEach(([key, results]) => {
    console.log(`\n  ${key}:`);
    results.forEach(r => {
      console.log(`    ID:${r.result_id} date:${r.date || 'NULL'} round:${r.round || 'NULL'}`);
    });
  });

  // 6. Sample round names using RPC or batched queries
  console.log('\n--- Sampling round names ---');
  const roundSample = {};

  // Get distinct rounds with counts using multiple queries
  const commonRounds = ['F', 'P', 'Finals', 'Preliminaries', 'Final', 'Preliminary'];
  for (const round of commonRounds) {
    const { count } = await supabase
      .from('results')
      .select('*', { count: 'exact', head: true })
      .eq('round', round);
    if (count > 0) roundSample[round] = count;
  }

  // Check for Heat patterns
  const { count: heatCount } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true })
    .ilike('round', 'Heat%');
  if (heatCount > 0) roundSample['Heat X (pattern)'] = heatCount;

  console.log('Round counts:');
  Object.entries(roundSample)
    .sort((a, b) => b[1] - a[1])
    .forEach(([round, count]) => {
      console.log(`  "${round}": ${count?.toLocaleString()}`);
    });

  // 7. Count results that could be normalized
  const { count: canNormalizePrelim } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true })
    .or('round.eq.P,round.eq.Preliminaries,round.eq.Preliminary,round.ilike.Heat%');

  const { count: canNormalizeFinal } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true })
    .or('round.eq.F,round.eq.Finals');

  console.log(`\nResults that can be normalized to "Prelim": ${canNormalizePrelim?.toLocaleString()}`);
  console.log(`Results that can be normalized to "Final": ${canNormalizeFinal?.toLocaleString()}`);

  // 8. Check for meet names with extra spaces
  const { data: sampleMeets } = await supabase
    .from('results')
    .select('meet_name')
    .not('meet_name', 'is', null)
    .limit(10000);

  const extraSpaceMeets = new Set();
  sampleMeets?.forEach(r => {
    if (r.meet_name && r.meet_name !== r.meet_name.replace(/\s+/g, ' ').trim()) {
      extraSpaceMeets.add(r.meet_name);
    }
  });

  console.log(`\nMeet names with extra spaces (sampled): ${extraSpaceMeets.size}`);
  [...extraSpaceMeets].slice(0, 5).forEach(m => console.log(`  "${m}"`));

  // 9. Summary
  console.log('\n=== CLEANUP PLAN ===');
  console.log('1. Normalize rounds: P, Preliminaries, Preliminary, Heat X → "Prelim"');
  console.log('2. Normalize rounds: F, Finals → "Final"');
  console.log('3. Fix meet names with extra whitespace');
  console.log('4. For duplicates: Delete NULL-date/round versions when dated version exists');
  console.log(`5. Remaining NULL dates: ${nullDates?.toLocaleString()} - these are from older scrape format`);
}

diagnose().catch(console.error);
