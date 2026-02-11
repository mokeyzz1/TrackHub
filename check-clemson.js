require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Search in results table by meet_name
  const { data: results } = await supabase
    .from('results')
    .select('meet_name, meet_id, date, event_name, mark_raw, place, round')
    .ilike('meet_name', '%clemson%')
    .eq('date', '2026-01-10')
    .limit(40);

  console.log('Clemson Invite results (Jan 10):');
  if (!results || results.length === 0) {
    console.log('  No results found');
  } else {
    console.log('Meet name:', results[0].meet_name);
    console.log('Meet ID:', results[0].meet_id);
    console.log('\nSample results:');
    results.forEach(r => {
      console.log('  ' + (r.event_name || 'null').padEnd(20) + ' | ' + (r.mark_raw || 'null').padEnd(10) + ' | Place: ' + r.place + ' | Round: ' + r.round);
    });
  }

  // Also check what meets exist on Jan 10
  console.log('\n\nAll meets on Jan 10:');
  const { data: janMeets } = await supabase
    .from('results')
    .select('meet_name, meet_id')
    .eq('date', '2026-01-10');

  const uniqueMeets = {};
  janMeets?.forEach(r => { uniqueMeets[r.meet_name] = r.meet_id; });
  Object.entries(uniqueMeets).forEach(([name, id]) => {
    console.log('  ' + name + ' (ID: ' + id + ')');
  });
})();
