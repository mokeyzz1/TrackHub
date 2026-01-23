const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
  console.log('\n📋 Checking for meets-related tables...\n');

  // Try to query a meets table if it exists
  const tables = ['meets', 'meet', 'competitions', 'events'];

  for (const table of tables) {
    console.log(`Trying table: ${table}...`);
    const { data, error, count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (!error) {
      console.log(`  ✅ Found table '${table}' with ${count} rows\n`);

      // Get one sample row
      const { data: sample } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (sample && sample.length > 0) {
        console.log('  Sample columns:');
        Object.keys(sample[0]).forEach(col => console.log(`    - ${col}`));
        console.log();
      }
    }
  }

  // Also check results table for non-null meet data
  console.log('Checking results table for non-null meets...');
  const { data: resultsWithMeets } = await supabase
    .from('results')
    .select('meet_name, date, meet_location')
    .not('meet_name', 'is', null)
    .not('date', 'is', null)
    .order('date', { ascending: false })
    .limit(10);

  if (resultsWithMeets && resultsWithMeets.length > 0) {
    console.log(`\n  ✅ Found ${resultsWithMeets.length} results with meet data:`);
    resultsWithMeets.forEach((r, i) => {
      console.log(`\n  ${i + 1}. ${r.meet_name}`);
      console.log(`     Date: ${r.date}`);
      console.log(`     Location: ${r.meet_location || 'N/A'}`);
    });
  }
}

checkTables().catch(console.error);
