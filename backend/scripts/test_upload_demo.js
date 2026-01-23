// Demo upload of live results to Supabase using sample data
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

// Sample data from the Boys 4x800m we scraped earlier
const sampleResults = [
  { place: '1', name: 'Wilkes Central Wilkes Centr A', time: '4:31.35', splits: ['2:18.25'] },
  { place: '2', name: 'Oak Grove A', time: '4:38.94', splits: ['2:21.61'] },
  { place: '3', name: 'Lincoln Charter Lincoln Char A', time: '4:38.98', splits: ['2:20.60'] },
  { place: '4', name: 'Pine Forest A', time: '4:39.83', splits: [] },
  { place: '5', name: 'T.W. Andrews A', time: '4:41.99', splits: [] },
];

function parseTimeToSeconds(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    const minutes = parseInt(parts[0]);
    const seconds = parseFloat(parts[1]);
    return minutes * 60 + seconds;
  } else {
    return parseFloat(timeStr);
  }
}

async function uploadDemo() {
  console.log('📤 Uploading sample live results to Supabase...\n');

  let uploaded = 0;
  let errors = 0;

  for (const result of sampleResults) {
    try {
      const resultRecord = {
        meet_url: 'https://live.jdlfasttrack.com/meets/54336/live/track/track',
        meet_name: 'Phoenix Academy',
        event_name: 'Boys 4x800m',
        participant_name: result.name,
        place: parseInt(result.place),
        mark_raw: result.time,
        mark_seconds: parseTimeToSeconds(result.time),
        splits: result.splits,
        scraped_at: new Date().toISOString(),
        date: '2025-12-02',
        round: 'LIVE',
        is_processed: false,
      };

      const { data, error } = await supabase
        .from('live_results')
        .insert(resultRecord);

      if (error) {
        console.error(`❌ Error uploading ${result.name}:`, error.message);
        errors++;
      } else {
        console.log(`✅ ${result.place}. ${result.name} - ${result.time}`);
        uploaded++;
      }
    } catch (e) {
      console.error(`❌ Exception:`, e.message);
      errors++;
    }
  }

  console.log(`\n📊 Upload Summary:`);
  console.log(`   Uploaded: ${uploaded}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Total: ${sampleResults.length}`);

  if (uploaded > 0) {
    console.log('\n✅ Live results successfully uploaded to Supabase!');
    console.log('\n🔍 To view the results:');
    console.log('   1. Go to https://supabase.com/dashboard/project/hunbahsnaeeztmzqpnrl/editor');
    console.log('   2. Run: SELECT * FROM live_results ORDER BY scraped_at DESC LIMIT 10;');
  }
}

uploadDemo().catch(console.error);
