// Query existing live results to see what we have
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function queryLiveResults() {
  console.log('\n📊 Querying live_results table...\n');

  // Get all live results
  const { data, error, count } = await supabase
    .from('live_results')
    .select('*', { count: 'exact' })
    .order('scraped_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`✅ Found ${count} live results\n`);

  if (data && data.length > 0) {
    // Group by meet
    const meetMap = new Map();
    data.forEach(result => {
      if (!meetMap.has(result.meet_url)) {
        meetMap.set(result.meet_url, {
          meet_url: result.meet_url,
          events: new Set(),
          results: []
        });
      }
      const meet = meetMap.get(result.meet_url);
      meet.events.add(result.event_name);
      meet.results.push(result);
    });

    console.log(`📍 Found ${meetMap.size} unique meets:\n`);

    Array.from(meetMap.entries()).forEach(([url, meet], i) => {
      console.log(`${i + 1}. Meet URL: ${url}`);
      console.log(`   📊 ${meet.events.size} events: ${Array.from(meet.events).slice(0, 3).join(', ')}${meet.events.size > 3 ? '...' : ''}`);
      console.log(`   🏃 ${meet.results.length} total results`);
      console.log();
    });

    // Show some sample results
    console.log('Sample results:');
    data.slice(0, 5).forEach((r, i) => {
      console.log(`\n${i + 1}. ${r.event_name}`);
      console.log(`   👤 ${r.participant_name}`);
      console.log(`   ⏱️  ${r.mark_raw}`);
      console.log(`   📍 Place: ${r.place || 'N/A'}`);
      console.log(`   🔗 ${r.meet_url}`);
    });
  } else {
    console.log('❌ No live results found\n');
    console.log('Run the live meet scraper to populate this table:\n');
    console.log('  node scripts/multi_event_live_scraper.js https://live.jdlfasttrack.com/meets/54336/live/track/track\n');
  }
}

queryLiveResults().catch(console.error);
