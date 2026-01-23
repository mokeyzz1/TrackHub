#!/usr/bin/env node

require('dotenv').config();

async function deploySchemaDirectly() {
  console.log('🚀 Deploying PostgreSQL schema to Supabase via direct DB connection...');
  
  const { Client } = require('pg');
  const fs = require('fs');
  const path = require('path');
  
  // Supabase connection params - Port 6543 is for pooled connections
  const client = new Client({
    host: 'hunbahsnaeeztmzqpnrl.supabase.co',
    port: 5432, // Try direct connection port first
    database: 'postgres',
    user: 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false } // Supabase requires SSL
  });
  
  try {
    console.log('📡 Connecting to Supabase PostgreSQL...');
    await client.connect();
    console.log('✅ Connected successfully!');
    
    // Read and execute schema
    const schemaPath = path.join(__dirname, 'backend/supabase/migrations/20241201000000_initial_schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('⚡ Executing schema SQL...');
    console.log(`📄 Schema size: ${(schemaSql.length / 1024).toFixed(1)}KB`);
    
    const result = await client.query(schemaSql);
    console.log('✅ Schema executed successfully!');
    
    // Verify tables were created
    const { rows } = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    
    console.log(`🎉 Schema deployment completed!`);
    console.log(`📊 Created ${rows.length} tables:`);
    rows.forEach(row => console.log(`   ✓ ${row.table_name}`));
    
    await client.end();
    
  } catch (error) {
    console.error('❌ Direct connection failed:', error.message);
    
    // Try pooled connection port
    if (error.message.includes('connection') && client.port === 5432) {
      console.log('⚠️  Trying pooled connection port 6543...');
      
      const pooledClient = new Client({
        host: 'hunbahsnaeeztmzqpnrl.supabase.co',
        port: 6543,
        database: 'postgres',  
        user: 'postgres',
        password: process.env.DB_PASSWORD,
        ssl: { rejectUnauthorized: false }
      });
      
      try {
        await pooledClient.connect();
        console.log('✅ Pooled connection successful!');
        
        const schemaPath = path.join(__dirname, 'backend/supabase/migrations/20241201000000_initial_schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        
        await pooledClient.query(schemaSql);
        console.log('✅ Schema executed via pooled connection!');
        
        await pooledClient.end();
        return;
        
      } catch (pooledError) {
        console.error('❌ Pooled connection also failed:', pooledError.message);
      }
    }
    
    console.log('\n📋 Summary: Database connection is restricted');
    console.log('🔒 Supabase likely has connection restrictions for security');
    console.log('\n✅ SOLUTION: Use the Supabase SQL Editor (it\'s actually easier!)');
    console.log('1. Go to: https://supabase.com/dashboard/project/hunbahsnaeeztmzqpnrl/sql');
    console.log('2. Copy the schema from: backend/supabase/migrations/20241201000000_initial_schema.sql');
    console.log('3. Paste and click "Run"');
    console.log('\n💡 This is the standard way to deploy schemas to managed Supabase databases');
  }
}

deploySchemaDirectly().catch(console.error);
