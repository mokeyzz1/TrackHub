require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Check if there are results with NULL athlete_id
  const { count: nullAthletes } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true })
    .is('athlete_id', null);

  console.log('Results with NULL athlete_id:', nullAthletes);

  // Check Bearcat meet ID
  const { data: bearcat } = await supabase
    .from('results')
    .select('meet_id, meet_name')
    .ilike('meet_name', '%bearcat%')
    .limit(1);

  const meetId = bearcat?.[0]?.meet_id;
  console.log('\nBearcat meet_id:', meetId);

  // Count all results for Bearcat
  const { count: bearcatTotal } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true })
    .eq('meet_id', meetId);

  console.log('Total Bearcat results in DB:', bearcatTotal);

  // Check 60m results at Bearcat by round
  const { data: sixtyResults } = await supabase
    .from('results')
    .select('round, mark_raw, place, athlete_id, athletes(full_name)')
    .eq('meet_id', meetId)
    .eq('event_name', '60 Meters')
    .order('round')
    .order('place');

  const byRound = {};
  sixtyResults?.forEach(r => {
    const round = r.round || 'NULL';
    if (!byRound[round]) byRound[round] = [];
    byRound[round].push(r);
  });

  console.log('\n60m results at Bearcat by round:');
  for (const [round, rows] of Object.entries(byRound).sort()) {
    console.log('\n' + round + ' (' + rows.length + ' results):');
    rows.slice(0, 8).forEach(r => {
      console.log('  ' + (r.place || '-') + '. ' + r.mark_raw + ' - ' + (r.athletes?.full_name || 'NO ATHLETE'));
    });
    if (rows.length > 8) console.log('  ...' + (rows.length - 8) + ' more');
  }
})();
