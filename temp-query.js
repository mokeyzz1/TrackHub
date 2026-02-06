const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://hunbahsnaeeztmzqpnrl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1bmJhaHNuYWVlenRtenFwbnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2MTI5MjEsImV4cCI6MjA4MDE4ODkyMX0.dLjVdd5cnjwFMJkFP2a2xho4GWm1mgqvJK2JVDzqfnw'
);

async function checkMissingData() {
  console.log('=== CHECKING FOR MISSING/UNMATCHED DATA ===\n');

  // 1. Check results with NULL athlete_id (unmatched results)
  const { count: unmatchedResults } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true })
    .is('athlete_id', null);

  console.log(`1. Results with NULL athlete_id: ${unmatchedResults || 0}`);

  // 2. Check total results
  const { count: totalResults } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true });

  console.log(`   Total results: ${totalResults || 0}`);
  console.log(`   Match rate: ${totalResults ? ((totalResults - (unmatchedResults || 0)) / totalResults * 100).toFixed(1) : 0}%\n`);

  // 3. Check live_results with NULL athlete_id
  const { count: unmatchedLive } = await supabase
    .from('live_results')
    .select('*', { count: 'exact', head: true })
    .is('athlete_id', null);

  const { count: totalLive } = await supabase
    .from('live_results')
    .select('*', { count: 'exact', head: true });

  console.log(`2. Live results with NULL athlete_id: ${unmatchedLive || 0}`);
  console.log(`   Total live results: ${totalLive || 0}\n`);

  // 4. Sample some unmatched results to see the names
  const { data: sampleUnmatched } = await supabase
    .from('live_results')
    .select('participant_name, team_name, event_name, meet_name')
    .is('athlete_id', null)
    .limit(20);

  if (sampleUnmatched && sampleUnmatched.length > 0) {
    console.log('3. Sample unmatched live_results:');
    sampleUnmatched.forEach(r => {
      console.log(`   - ${r.participant_name} | ${r.team_name} | ${r.event_name}`);
    });
  }

  // 5. Check athletes with 0 results
  const { data: athletesNoResults } = await supabase
    .from('athletes')
    .select('athlete_id, full_name, school_id')
    .eq('is_active', true);

  // Get athletes that have results
  const { data: athletesWithResults } = await supabase
    .from('results')
    .select('athlete_id')
    .not('athlete_id', 'is', null);

  const athleteIdsWithResults = new Set(athletesWithResults?.map(r => r.athlete_id) || []);
  const athletesWithoutResults = athletesNoResults?.filter(a => !athleteIdsWithResults.has(a.athlete_id)) || [];

  console.log(`\n4. Athletes with NO results: ${athletesWithoutResults.length}`);
  console.log(`   Total active athletes: ${athletesNoResults?.length || 0}`);

  // Sample some athletes without results
  console.log('\n   Sample athletes with 0 results:');
  athletesWithoutResults.slice(0, 10).forEach(a => {
    console.log(`   - ${a.full_name} (ID: ${a.athlete_id})`);
  });
}

checkMissingData();
