// Check upcoming meets for today and tomorrow
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUpcomingMeets() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayStr = today.toISOString().split('T')[0];
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  console.log('\n🔍 Checking for meets today and tomorrow...\n');
  console.log('Today:', todayStr);
  console.log('Tomorrow:', tomorrowStr);
  console.log('='.repeat(60));

  const { data: meets } = await supabase
    .from('meets')
    .select('*')
    .gte('date', todayStr)
    .lte('date', tomorrowStr)
    .order('date', { ascending: true });

  if (!meets || meets.length === 0) {
    console.log('\n❌ No meets found for today or tomorrow');
    process.exit(0);
  }

  console.log(`\n📋 Found ${meets.length} meets:\n`);

  meets.forEach((meet, i) => {
    console.log(`${i + 1}. ${meet.name}`);
    console.log(`   Date: ${meet.date}`);
    console.log(`   URL: ${meet.meet_url || 'NO URL ❌'}`);
    console.log(`   Status: ${meet.status || 'unknown'}`);
    console.log('');
  });

  const withUrl = meets.filter(m => m.meet_url);
  const withoutUrl = meets.filter(m => !m.meet_url);

  console.log('='.repeat(60));
  console.log(`\n✅ Meets WITH URL: ${withUrl.length}`);
  console.log(`❌ Meets WITHOUT URL: ${withoutUrl.length}`);

  if (withoutUrl.length > 0) {
    console.log(`\n⚠️  Meets needing URL updates:`);
    withoutUrl.forEach(m => {
      console.log(`   - ${m.name} (ID: ${m.meet_id})`);
    });
  }

  console.log('='.repeat(60) + '\n');

  process.exit(0);
}

checkUpcomingMeets().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
