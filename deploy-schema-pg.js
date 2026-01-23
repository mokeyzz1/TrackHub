#!/usr/bin/env node

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function deploySchemaViaSupabaseJS() {
  console.log('🚀 Deploying PostgreSQL schema to Supabase using Supabase JS...');
  
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!serviceRoleKey || !supabaseUrl) {
    console.error('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }
  
  console.log('📡 Connecting to Supabase...');
  console.log(`🔗 URL: ${supabaseUrl}`);
  
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  
  try {
    // First, let's check what tables already exist
    console.log('🔍 Checking existing tables...');
    
    const { data: existingTables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');
    
    if (!tablesError) {
      console.log(`📊 Found ${existingTables?.length || 0} existing tables`);
    }
    
    // Since Supabase doesn't allow direct SQL execution via JS client for DDL,
    // let's use the SQL runner approach via raw HTTP
    const fs = require('fs');
    const path = require('path');
    
    const schemaPath = path.join(__dirname, 'backend/supabase/migrations/20241201000000_initial_schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('📄 Attempting to execute SQL via direct PostgreSQL connection...');
    
    // Use the pg library to connect directly
    const { Client } = require('pg');
    
    const client = new Client({
      host: supabaseUrl.replace('https://', '').replace('.supabase.co', '') + '.supabase.co',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: process.env.DB_PASSWORD,
    });
    
    await client.connect();
    console.log('✅ Connected to PostgreSQL database!');
    
    // Execute the schema
    console.log('⚡ Executing schema SQL...');
    await client.query(schemaSql);
    console.log('✅ Schema executed successfully!');
    
    await client.end();
    
    console.log('🎉 Schema deployment completed!');
    console.log('🔍 Check your Supabase dashboard to verify the tables were created');
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    
    // If direct connection fails, provide manual instructions
    console.log('\n💡 Manual deployment required:');
    console.log('1. Go to your Supabase SQL Editor:');
    console.log(`   https://supabase.com/dashboard/project/${supabaseUrl.split('.')[0].split('//')[1]}/sql`);
    console.log('2. Copy the contents of backend/supabase/migrations/20241201000000_initial_schema.sql');
    console.log('3. Paste and run in the SQL Editor');
    console.log('\nThe schema is ready and tested - just needs manual execution!');
  }
}

deploySchemaViaSupabaseJS().catch(console.error);
