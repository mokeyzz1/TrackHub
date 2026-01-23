// Create a test meet in the database for testing the live tracking UI
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTestMeet() {
  console.log('\n🏃 Creating test meet: Phoenix Academy Middle School Track Meet\n');

  // Today's date
  const today = new Date().toISOString().split('T')[0];

  const testMeet = {
    name: 'Phoenix Academy Middle School Track Meet',
    date: today,
    location: 'Phoenix Academy, San Jose, CA',
    meet_url: 'https://live.jdlfasttrack.com/meets/54336/live/track/track',
    status: 'live',
    level: 'middle_school',
    season: 'indoor',
    created_at: new Date().toISOString()
  };

  // Insert into meets table
  const { data, error } = await supabase
    .from('meets')
    .insert([testMeet])
    .select();

  if (error) {
    console.error('❌ Error creating meet:', error);
    return;
  }

  console.log('✅ Meet created successfully!\n');
  console.log('Meet details:');
  console.log(JSON.stringify(data[0], null, 2));

  const meetId = data[0].meet_id;

  console.log('\n📝 Now creating test events for this meet...\n');

  // Create some test events that match what we scraped
  const events = [
    { name: 'Girls 800m', status: 'live', scheduled_time: null },
    { name: 'Boys 800m', status: 'live', scheduled_time: null },
    { name: 'Girls 400m', status: 'upcoming', scheduled_time: null },
    { name: 'Boys 400m', status: 'upcoming', scheduled_time: null },
    { name: 'Girls 200m', status: 'upcoming', scheduled_time: null },
    { name: 'Boys 200m', status: 'upcoming', scheduled_time: null },
  ];

  const eventsToInsert = events.map(e => ({
    meet_id: meetId,
    event_name: e.name,
    status: e.status,
    scheduled_time: e.scheduled_time,
    created_at: new Date().toISOString()
  }));

  const { data: eventsData, error: eventsError } = await supabase
    .from('events')
    .insert(eventsToInsert)
    .select();

  if (eventsError) {
    console.error('❌ Error creating events:', eventsError);
    return;
  }

  console.log(`✅ Created ${eventsData.length} events!\n`);

  eventsData.forEach((event, i) => {
    console.log(`${i + 1}. ${event.event_name} - ${event.status}`);
  });

  console.log('\n🎉 Test meet setup complete!\n');
  console.log('You can now:');
  console.log('1. View this meet in the app');
  console.log('2. See the live indicators on live events');
  console.log('3. Click to view live results\n');

  return { meet: data[0], events: eventsData };
}

createTestMeet().catch(console.error);
