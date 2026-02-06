const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Check format of old relay results
  const { data: relays } = await supabase
    .from('results')
    .select('result_id, athlete_id, event_name, mark_raw, meet_name, date, team_id')
    .is('meet_id', null)
    .in('event_name', ['4x400', '4x100', 'DMR', '4x800', '4x200'])
    .limit(20);

  console.log('Sample old relay results:');
  relays?.forEach(r => {
    console.log(`  ${r.result_id} | athlete_id: ${r.athlete_id} | ${r.event_name} | ${r.mark_raw} | ${r.meet_name}`);
  });

  // Count total old relays
  const relayEvents = ['4x400', '4x100', 'DMR', '4x800', '4x200', '4x300', '4x1600', '4x1500', 'SMR', '4xMile'];

  let totalCount = 0;
  for (const event of relayEvents) {
    const { count } = await supabase
      .from('results')
      .select('*', { count: 'exact', head: true })
      .is('meet_id', null)
      .eq('event_name', event);

    if (count > 0) {
      console.log(`\n${event}: ${count}`);
      totalCount += count;
    }
  }

  console.log('\n=== TOTAL OLD RELAY RESULTS: ' + totalCount + ' ===');
})();
