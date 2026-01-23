// Create live_results table directly using Supabase client
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

async function createLiveResultsTable() {
  console.log('📜 Creating live_results table...\n');

  // Test if we can insert - if table doesn't exist, it will fail
  const testInsert = {
    meet_url: 'TEST',
    event_name: 'TEST',
    participant_name: 'TEST',
    mark_raw: 'TEST',
    scraped_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('live_results')
    .insert(testInsert);

  if (error) {
    console.log('❌ Table does not exist or has issues:', error.message);
    console.log('\n📝 You need to create the table manually in Supabase.');
    console.log('\n🔧 Steps:');
    console.log('   1. Go to: https://supabase.com/dashboard/project/hunbahsnaeeztmzqpnrl/editor');
    console.log('   2. Click "SQL Editor" → "New query"');
    console.log('   3. Copy and run the following SQL:\n');

    console.log(`
CREATE TABLE live_results (
    live_result_id BIGSERIAL PRIMARY KEY,
    meet_url TEXT NOT NULL,
    meet_name TEXT,
    event_name TEXT NOT NULL,
    participant_name TEXT NOT NULL,
    place INTEGER,
    mark_raw TEXT NOT NULL,
    mark_seconds DOUBLE PRECISION,
    splits TEXT[],
    scraped_at TIMESTAMP WITH TIME ZONE NOT NULL,
    date DATE,
    round TEXT DEFAULT 'LIVE',
    is_processed BOOLEAN DEFAULT FALSE,
    athlete_id BIGINT REFERENCES athletes(athlete_id) ON DELETE SET NULL,
    team_id BIGINT REFERENCES teams(team_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_live_results_meet_url ON live_results(meet_url);
CREATE INDEX idx_live_results_event ON live_results(event_name);
CREATE INDEX idx_live_results_date ON live_results(date);
CREATE INDEX idx_live_results_scraped_at ON live_results(scraped_at DESC);
CREATE INDEX idx_live_results_processed ON live_results(is_processed) WHERE is_processed = FALSE;
    `);

    process.exit(1);
  } else {
    // Clean up test record
    await supabase.from('live_results').delete().eq('meet_url', 'TEST');
    console.log('✅ Table exists and is ready to use!');
  }
}

createLiveResultsTable().catch(console.error);
