// Run a SQL migration file on Supabase
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration(sqlFile) {
  console.log(`📜 Running migration: ${sqlFile}\n`);

  const sqlPath = path.join(__dirname, '../supabase/migrations', sqlFile);

  if (!fs.existsSync(sqlPath)) {
    console.error(`❌ Migration file not found: ${sqlPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Executing SQL...\n');

  // Split by semicolons and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  let successCount = 0;
  let errorCount = 0;

  for (const statement of statements) {
    try {
      const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: statement + ';'
      });

      if (error) {
        // Try direct query if RPC doesn't work
        const result = await supabase.from('_').select('*').limit(0); // Dummy query to get connection
        // For now, just log - we'll need to manually run this in Supabase dashboard
        console.log('⚠️  Statement needs manual execution:', statement.substring(0, 100) + '...');
        errorCount++;
      } else {
        console.log('✅ Statement executed successfully');
        successCount++;
      }
    } catch (e) {
      console.log('⚠️  Statement needs manual execution:', statement.substring(0, 100) + '...');
      errorCount++;
    }
  }

  console.log(`\n📊 Migration Summary:`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Needs Manual Run: ${errorCount}`);
  console.log(`\n💡 To run manually:`);
  console.log(`   1. Go to https://supabase.com/dashboard/project/hunbahsnaeeztmzqpnrl/editor`);
  console.log(`   2. Click "SQL Editor"`);
  console.log(`   3. Paste the contents of: ${sqlPath}`);
  console.log(`   4. Run the query`);
}

const migrationFile = process.argv[2] || '20241202000000_live_results.sql';
runMigration(migrationFile).catch(console.error);
