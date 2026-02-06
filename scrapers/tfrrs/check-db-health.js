/**
 * Database Health Check
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkHealth() {
  console.log('========================================');
  console.log('DATABASE HEALTH CHECK');
  console.log('========================================\n');

  // 1. Check for orphaned results
  console.log('1. Checking for orphaned results...');
  const { data: sampleResults } = await supabase
    .from('results')
    .select('athlete_id')
    .limit(100);

  let orphanCount = 0;
  if (sampleResults) {
    const ids = [...new Set(sampleResults.map(r => r.athlete_id))];
    const { data: existingAthletes } = await supabase
      .from('athletes')
      .select('athlete_id')
      .in('athlete_id', ids);

    const existingIds = new Set(existingAthletes?.map(a => a.athlete_id) || []);
    orphanCount = ids.filter(id => existingIds.has(id) === false).length;
  }
  console.log('   Orphaned athletes in sample: ' + orphanCount + '/100');

  // 2. Check for duplicate results
  console.log('\n2. Checking for potential duplicates...');
  const { data: dupCheck } = await supabase
    .from('results')
    .select('athlete_id, event_name, meet_name, mark_raw')
    .limit(1000);

  const seen = new Set();
  let dups = 0;
  dupCheck?.forEach(r => {
    const key = r.athlete_id + '|' + r.event_name + '|' + r.meet_name + '|' + r.mark_raw;
    if (seen.has(key)) dups++;
    seen.add(key);
  });
  console.log('   Potential duplicates in sample: ' + dups + '/1000');

  // 3. Check data quality
  console.log('\n3. Checking data quality...');

  const { count: nullEventResults } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true })
    .is('event_name', null);
  console.log('   Results with null event_name: ' + (nullEventResults || 0));

  const { count: nullMarkResults } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true })
    .is('mark_raw', null);
  console.log('   Results with null mark_raw: ' + (nullMarkResults || 0));

  const { count: nullEventPRs } = await supabase
    .from('athlete_prs')
    .select('*', { count: 'exact', head: true })
    .is('event_name', null);
  console.log('   PRs with null event_name: ' + (nullEventPRs || 0));

  const { count: noNameAthletes } = await supabase
    .from('athletes')
    .select('*', { count: 'exact', head: true })
    .is('full_name', null);
  console.log('   Athletes with null name: ' + (noNameAthletes || 0));

  // 4. Check for empty marks
  const { count: emptyMarks } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true })
    .eq('mark_raw', '');
  console.log('   Results with empty mark: ' + (emptyMarks || 0));

  // 5. Summary
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');

  const { count: totalAthletes } = await supabase
    .from('athletes')
    .select('*', { count: 'exact', head: true });
  const { count: totalResults } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true });
  const { count: totalPRs } = await supabase
    .from('athlete_prs')
    .select('*', { count: 'exact', head: true });

  console.log('Athletes: ' + totalAthletes?.toLocaleString());
  console.log('Results: ' + totalResults?.toLocaleString());
  console.log('PRs: ' + totalPRs?.toLocaleString());

  console.log('\n========================================');
  console.log('VERDICT');
  console.log('========================================');

  const issues = orphanCount + (dups > 50 ? 1 : 0) +
    (nullEventResults || 0) + (nullMarkResults || 0) + (noNameAthletes || 0) + (emptyMarks || 0);

  if (issues === 0) {
    console.log('✓ Database is CLEAN!');
  } else if (issues < 10) {
    console.log('✓ Database is mostly clean (' + issues + ' minor issues)');
  } else {
    console.log('⚠ Found ' + issues + ' issues to review');
  }
}

checkHealth().catch(console.error);
