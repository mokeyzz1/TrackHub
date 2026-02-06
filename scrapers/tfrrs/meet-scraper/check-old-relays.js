const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Check for relay events in the main results table (old data without meet_id)
  const { data: oldRelays, error } = await supabase
    .from('results')
    .select('result_id, event_name, mark_raw, meet_name')
    .is('meet_id', null)
    .ilike('event_name', '%relay%')
    .limit(20);

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  console.log('Old relay results in main table (no meet_id):');
  console.log('Count:', oldRelays?.length || 0);
  if (oldRelays && oldRelays.length > 0) {
    oldRelays.slice(0, 5).forEach(r => {
      console.log(`  ${r.result_id} | ${r.event_name} | ${r.mark_raw} | ${r.meet_name}`);
    });
  }

  // Also check total relays in results table (with or without meet_id)
  const { data: allRelays } = await supabase
    .from('results')
    .select('result_id, event_name, meet_id')
    .ilike('event_name', '%relay%')
    .limit(100);

  console.log('\nAll relay results in main table:', allRelays?.length || 0);
  if (allRelays && allRelays.length > 0) {
    const withMeetId = allRelays.filter(r => r.meet_id !== null).length;
    const withoutMeetId = allRelays.filter(r => r.meet_id === null).length;
    console.log('  With meet_id:', withMeetId);
    console.log('  Without meet_id:', withoutMeetId);
  }
})();
