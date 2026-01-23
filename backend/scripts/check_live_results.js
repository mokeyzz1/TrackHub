// Quick script to check what's in the live_results table
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLiveResults() {
  console.log('\n📊 Checking live_results table...\n');

  // Get total count
  const { count } = await supabase
    .from('live_results')
    .select('*', { count: 'exact', head: true });

  console.log(`Total results in database: ${count}\n`);

  // Get unique meets
  const { data: meets } = await supabase
    .from('live_results')
    .select('meet_name, meet_url')
    .order('scraped_at', { ascending: false });

  const uniqueMeets = [...new Map(meets.map(m => [m.meet_url, m])).values()];

  console.log(`Unique meets: ${uniqueMeets.length}\n`);

  uniqueMeets.forEach((meet, i) => {
    console.log(`${i + 1}. ${meet.meet_name}`);
    console.log(`   ${meet.meet_url}`);
  });

  // Get latest results
  const { data: latest } = await supabase
    .from('live_results')
    .select('*')
    .order('scraped_at', { ascending: false })
    .limit(10);

  console.log(`\n📋 Latest 10 Results:\n`);

  latest.forEach((result, i) => {
    console.log(`${i + 1}. ${result.event_name} - ${result.participant_name}`);
    console.log(`   Place: ${result.place} | Time: ${result.mark_raw}`);
    console.log(`   Scraped: ${new Date(result.scraped_at).toLocaleString()}\n`);
  });

  // Get events summary
  const { data: events } = await supabase
    .from('live_results')
    .select('event_name, meet_name')
    .order('event_name');

  const uniqueEvents = [...new Map(events.map(e => [e.event_name + e.meet_name, e])).values()];

  console.log(`\n🏃 Events in Database: ${uniqueEvents.length}\n`);

  uniqueEvents.forEach((event, i) => {
    console.log(`${i + 1}. ${event.event_name} (${event.meet_name})`);
  });
}

checkLiveResults().catch(console.error);
