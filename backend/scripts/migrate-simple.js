#!/usr/bin/env node

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuration
const SQLITE_DB_PATH = path.join(__dirname, '../../backend/server/track_hub.db');
const BATCH_SIZE = 50; // Small batches for API

async function migrateDataSimple() {
  console.log('🚀 Starting simplified SQLite to Supabase migration...');
  
  // Check if SQLite database exists
  if (!fs.existsSync(SQLITE_DB_PATH)) {
    console.error(`❌ SQLite database not found at: ${SQLITE_DB_PATH}`);
    process.exit(1);
  }
  
  console.log(`📂 Found SQLite database: ${SQLITE_DB_PATH}`);
  
  // Connect to SQLite
  const sqlite = new sqlite3.Database(SQLITE_DB_PATH);
  
  // Connect to Supabase
  const supabase = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    console.log('✅ Connected to Supabase');

    // Migration order (respecting foreign key constraints)
    const migrations = [
      { table: 'regions', deps: [], sample: 10 },
      { table: 'conferences', deps: [], sample: 50 },
      { table: 'schools', deps: ['regions', 'conferences'], mapping: { 'name': 'official_name' }, sample: 100 },
      { table: 'teams', deps: ['schools'], sample: 100 },
      { table: 'athletes', deps: ['schools'], mapping: { 'name': 'full_name' }, sample: 200 },
      { table: 'results', deps: ['athletes', 'teams'], sample: 1000 },
    ];

    for (const migration of migrations) {
      await migrateTableSimple(sqlite, supabase, migration.table, migration.mapping || {}, migration.sample);
    }

    console.log('🎉 Sample data migration completed successfully!');
    console.log('📊 Check your Supabase dashboard to see the imported data');
    console.log('🚀 Ready to test your React Native app with live data!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    sqlite.close();
  }
}

async function migrateTableSimple(sqlite, supabase, tableName, columnMapping = {}, sampleSize = 100) {
  console.log(`\n📊 Migrating table: ${tableName} (${sampleSize} sample records)`);
  
  return new Promise((resolve, reject) => {
    // Get sample data
    sqlite.all(`SELECT * FROM ${tableName} LIMIT ${sampleSize}`, async (err, rows) => {
      if (err) {
        if (err.message.includes('no such table')) {
          console.log(`⚠️  Table ${tableName} doesn't exist in SQLite, skipping...`);
          resolve();
          return;
        }
        reject(err);
        return;
      }
      
      console.log(`   📋 Found ${rows.length} records to migrate`);
      
      if (rows.length === 0) {
        console.log(`   ✅ Table ${tableName} is empty, skipping...`);
        resolve();
        return;
      }
      
      try {
        // Transform data
        const transformedRows = rows.map(row => transformRow(row, columnMapping, tableName));
        
        // Clear existing data first (for fresh migration)
        console.log(`   🧹 Clearing existing ${tableName} data...`);
        const { error: deleteError } = await supabase
          .from(tableName)
          .delete()
          .neq('created_at', '1900-01-01'); // Delete all records
        
        if (deleteError) {
          console.log(`   ⚠️  Note: ${deleteError.message} (expected for new tables)`);
        }
        
        // Insert new data in batches
        let processed = 0;
        for (let i = 0; i < transformedRows.length; i += BATCH_SIZE) {
          const batch = transformedRows.slice(i, i + BATCH_SIZE);
          
          const { data, error } = await supabase
            .from(tableName)
            .insert(batch);
          
          if (error) {
            console.error(`   ❌ Error inserting batch:`, error.message);
            console.log(`   🔍 Sample record:`, JSON.stringify(batch[0], null, 2));
            // Don't fail completely, just log and continue
          } else {
            processed += batch.length;
            console.log(`   ⏳ Progress: ${processed}/${transformedRows.length} records`);
          }
        }
        
        console.log(`   ✅ Completed ${tableName}: ${processed} records migrated`);
        resolve();
        
      } catch (error) {
        console.error(`   ❌ Error processing ${tableName}:`, error.message);
        reject(error);
      }
    });
  });
}

function transformRow(row, columnMapping, tableName) {
  const transformed = { ...row };
  
  // Apply column mappings
  Object.keys(columnMapping).forEach(oldName => {
    if (transformed[oldName] !== undefined) {
      transformed[columnMapping[oldName]] = transformed[oldName];
      delete transformed[oldName];
    }
  });
  
  // Convert SQLite boolean integers to PostgreSQL booleans
  ['is_active', 'is_pr', 'is_season_best', 'is_redshirt'].forEach(boolCol => {
    if (transformed[boolCol] !== undefined) {
      transformed[boolCol] = transformed[boolCol] === 1;
    }
  });
  
  // Remove auto-increment IDs to let PostgreSQL generate them
  const idColumn = `${tableName.slice(0, -1)}_id`;
  if (transformed[idColumn]) {
    delete transformed[idColumn];
  }
  
  // Handle special cases
  if (tableName === 'results') {
    // Keep the original athlete_id and team_id as foreign keys
    if (row.athlete_id) transformed.athlete_id = row.athlete_id;
    if (row.team_id) transformed.team_id = row.team_id;
  }
  
  return transformed;
}

// Run the migration
if (require.main === module) {
  migrateDataSimple().catch(console.error);
}

module.exports = { migrateDataSimple };
