const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Get all unique event names from old results
  let allEvents = new Map();
  let offset = 0;

  console.log('Scanning old results for relay events...');

  while (offset < 100000) { // Sample first 100k
    const { data } = await supabase
      .from('results')
      .select('event_name')
      .is('meet_id', null)
      .range(offset, offset + 999);

    if (!data || data.length === 0) break;

    data.forEach(r => {
      allEvents.set(r.event_name, (allEvents.get(r.event_name) || 0) + 1);
    });

    offset += 1000;
    if (offset % 20000 === 0) console.log(`  Checked ${offset} results...`);
  }

  console.log('\nAll event names from old data:');
  const sorted = [...allEvents.entries()].sort((a, b) => b[1] - a[1]);
  sorted.forEach(([name, count]) => {
    console.log(`  ${count.toString().padStart(6)}  ${name}`);
  });

  // Identify relay events
  const relayPatterns = ['4x', 'dmr', 'relay', 'medley', 'shuttle'];
  const relayEvents = sorted.filter(([name]) =>
    relayPatterns.some(p => name.toLowerCase().includes(p))
  );

  console.log('\n=== RELAY EVENTS ===');
  let totalRelays = 0;
  relayEvents.forEach(([name, count]) => {
    console.log(`  ${count.toString().padStart(6)}  ${name}`);
    totalRelays += count;
  });
  console.log(`\nTotal old relay results: ${totalRelays}`);
})();
