// Get all unique meets from Supabase
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

async function getMeets() {
  console.log('\n📊 Fetching meets from Supabase...\n');

  // Get all results with their meet info
  const { data, error } = await supabase
    .from('results')
    .select('meet_name, date, meet_location, event_name')
    .order('date', { ascending: false })
    .limit(1000);

  if (error) {
    console.error('Error:', error);
    return;
  }

  // Group by meet
  const meetMap = new Map();

  data.forEach(result => {
    const key = result.meet_name + result.date;
    if (!meetMap.has(key)) {
      meetMap.set(key, {
        name: result.meet_name,
        date: result.date,
        location: result.meet_location || 'TBD',
        events: new Set()
      });
    }

    const meet = meetMap.get(key);
    if (result.event_name) meet.events.add(result.event_name);
  });

  // Convert to array and sort
  const meets = Array.from(meetMap.values()).map(m => ({
    ...m,
    events: Array.from(m.events)
  })).sort((a, b) => new Date(b.date) - new Date(a.date));

  console.log(`Found ${meets.length} unique meets\n`);

  // Show recent meets
  meets.slice(0, 20).forEach((meet, i) => {
    console.log(`${i + 1}. ${meet.name}`);
    console.log(`   📅 ${meet.date}`);
    console.log(`   📍 ${meet.location}`);
    console.log(`   🏃 ${meet.events.length} events: ${meet.events.slice(0, 3).join(', ')}${meet.events.length > 3 ? '...' : ''}`);
    console.log();
  });

  return meets;
}

getMeets().catch(console.error);
