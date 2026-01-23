const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  console.log('\n📋 Checking results table structure...\n');
  
  // Get a sample row to see available columns
  const { data, error } = await supabase
    .from('results')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  if (data && data.length > 0) {
    console.log('✅ Available columns in results table:\n');
    Object.keys(data[0]).forEach(col => {
      console.log(`   - ${col}`);
    });
    console.log('\n📄 Sample row:');
    console.log(JSON.stringify(data[0], null, 2));
  } else {
    console.log('❌ No data found in results table');
  }
}

checkSchema().catch(console.error);
