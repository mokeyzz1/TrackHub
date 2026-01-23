// Run the meets and events migration
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials!');
  console.error('Need EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('\n🏃 Running meets and events migration...\n');

  // Read the SQL file
  const sqlPath = path.join(__dirname, '../supabase/migrations/20241203000000_meets_and_events.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('📄 Executing SQL migration...\n');

  // Execute the SQL
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

  if (error) {
    console.error('❌ Migration failed:', error);

    // Try direct SQL execution instead
    console.log('\n🔄 Trying alternative method with pg...\n');

    const { Client } = require('pg');
    const client = new Client({
      connectionString: `postgresql://postgres.hunbahsnaeeztmzqpnrl:${process.env.DB_PASSWORD}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`
    });

    try {
      await client.connect();
      console.log('✅ Connected to database\n');

      await client.query(sql);
      console.log('✅ Migration executed successfully!\n');

      await client.end();
    } catch (pgError) {
      console.error('❌ PostgreSQL error:', pgError);
      process.exit(1);
    }
  } else {
    console.log('✅ Migration completed successfully!\n');
  }

  console.log('🎉 Meets and events tables are now ready!\n');
}

runMigration().catch(console.error);
