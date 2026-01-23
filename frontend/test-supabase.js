require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function testConnection() {
  console.log('🧪 Testing Supabase connection...\n');

  try {
    // Test 1: Count athletes
    console.log('Test 1: Counting athletes...');
    const { count: athleteCount, error: e1 } = await supabase
      .from('athletes')
      .select('*', { count: 'exact', head: true });

    if (e1) throw e1;
    console.log('✅ Athletes count:', athleteCount?.toLocaleString());

    // Test 2: Get some athletes with schools
    console.log('\nTest 2: Fetching sample athletes...');
    const { data: athletes, error: e2 } = await supabase
      .from('athletes')
      .select('full_name, schools(official_name)')
      .limit(5);

    if (e2) throw e2;
    console.log('✅ Sample athletes:');
    athletes?.forEach(a => console.log(`   - ${a.full_name} (${a.schools?.official_name})`));

    // Test 3: Get recent results
    console.log('\nTest 3: Fetching recent results...');
    const { data: results, error: e3 } = await supabase
      .from('results')
      .select('event_name, mark_raw, date')
      .order('date', { ascending: false })
      .limit(5);

    if (e3) throw e3;
    console.log('✅ Recent results:');
    results?.forEach(r => console.log(`   - ${r.event_name}: ${r.mark_raw} (${r.date})`));

    // Test 4: Count results
    console.log('\nTest 4: Counting all results...');
    const { count: resultCount, error: e4 } = await supabase
      .from('results')
      .select('*', { count: 'exact', head: true });

    if (e4) throw e4;
    console.log('✅ Total results:', resultCount?.toLocaleString());

    console.log('\n🎉 All tests passed! Supabase is connected and working!\n');
    console.log('📊 Summary:');
    console.log(`   - Athletes: ${athleteCount?.toLocaleString()}`);
    console.log(`   - Results: ${resultCount?.toLocaleString()}`);
    console.log('\n✨ Your app is ready to use Supabase!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
  }
}

testConnection();
