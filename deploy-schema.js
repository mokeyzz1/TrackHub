#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function deploySchema() {
  console.log('🚀 Deploying PostgreSQL schema to Supabase...');
  
  // Read the schema file
  const schemaPath = path.join(__dirname, 'backend/supabase/migrations/20241201000000_initial_schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  
  if (!serviceRoleKey || !supabaseUrl) {
    console.error('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }
  
  console.log('📡 Connecting to Supabase...');
  console.log(`🔗 URL: ${supabaseUrl}`);
  
  try {
    // Use Supabase's SQL execution endpoint
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_sql`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        query: schemaSql
      })
    });
    
    if (!response.ok) {
      console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error('Error response:', errorText);
      
      // Try direct SQL execution via Edge Function approach
      console.log('⚠️  Trying alternative direct SQL execution...');
      
      const altResponse = await fetch(`${supabaseUrl}/database/sql`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sql: schemaSql
        })
      });
      
      if (!altResponse.ok) {
        console.error(`❌ Alternative approach failed: ${altResponse.status}`);
        const altErrorText = await altResponse.text();
        console.error('Alternative error:', altErrorText);
        throw new Error('Both direct and alternative SQL execution failed');
      } else {
        console.log('✅ Schema deployed via alternative method!');
      }
    } else {
      console.log('✅ Schema deployed successfully!');
    }
    
    console.log('🎉 Schema deployment completed!');
    console.log('🔍 Check your Supabase dashboard to verify the tables were created');
    console.log(`   Dashboard: https://supabase.com/dashboard/project/${supabaseUrl.split('.')[0].split('//')[1]}/editor`);
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    console.log('\n💡 Manual deployment option:');
    console.log('1. Go to your Supabase SQL Editor:');
    console.log(`   https://supabase.com/dashboard/project/${supabaseUrl.split('.')[0].split('//')[1]}/sql`);
    console.log('2. Copy the contents of backend/supabase/migrations/20241201000000_initial_schema.sql');
    console.log('3. Paste and run in the SQL Editor');
  }
}

deploySchema().catch(console.error);
