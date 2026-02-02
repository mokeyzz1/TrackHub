/**
 * Run SQL against Supabase database
 * Usage: node run-sql.js <sql-file>
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runSQL(sqlFile) {
  const sql = fs.readFileSync(sqlFile, 'utf-8');
  console.log('Running SQL...\n');
  console.log(sql);
  console.log('\n---');

  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

  if (error) {
    // If rpc doesn't exist, try raw query via postgrest
    console.log('RPC not available, using direct query...');

    // Split into separate statements
    const statements = sql.split(';').filter(s => s.trim());

    for (const stmt of statements) {
      if (!stmt.trim()) continue;
      console.log(`Executing: ${stmt.substring(0, 50)}...`);

      // Use the REST API directly for DDL
      const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/`, {
        method: 'POST',
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: stmt })
      });

      if (!response.ok) {
        const text = await response.text();
        console.log('Response:', text);
      }
    }
  } else {
    console.log('Success:', data);
  }
}

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('Usage: node run-sql.js <sql-file>');
  process.exit(1);
}

runSQL(sqlFile).catch(console.error);
