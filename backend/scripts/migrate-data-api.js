#!/usr/bin/env node

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuration
const SQLITE_DB_PATH = path.join(__dirname, '../../backend/server/track_hub.db');
const BATCH_SIZE = 50; // Smaller batches for Supabase API

async function migrateDataViaSupabaseAPI() {
  console.log('🚀 Starting SQLite to Supabase migration via REST API...');
  
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
      { table: 'regions', deps: [] },
      { table: 'conferences', deps: [] },
      { table: 'schools', deps: ['regions', 'conferences'], mapping: { 'name': 'official_name' } },
      { table: 'teams', deps: ['schools'] },
      { table: 'athletes', deps: ['schools'], mapping: { 'name': 'full_name' } },
      { table: 'results', deps: ['athletes', 'teams'] },
    ];

    for (const migration of migrations) {
      await migrateTableViaAPI(sqlite, supabase, migration.table, migration.mapping || {});
    }

    console.log('🎉 Data migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    sqlite.close();
  }
}

async function migrateTableViaAPI(sqlite, supabase, tableName, columnMapping = {}) {
  console.log(`\n📊 Migrating table: ${tableName}`);
  
  return new Promise((resolve, reject) => {
    // First, get the count
    sqlite.get(`SELECT COUNT(*) as count FROM ${tableName}`, async (err, row) => {
      if (err) {
        if (err.message.includes('no such table')) {
          console.log(`⚠️  Table ${tableName} doesn't exist in SQLite, skipping...`);
          resolve();
          return;
        }
        reject(err);
        return;
      }
      
      const totalCount = row.count;
      console.log(`   📋 Found ${totalCount.toLocaleString()} records`);
      
      if (totalCount === 0) {
        console.log(`   ✅ Table ${tableName} is empty, skipping...`);
        resolve();
        return;
      }
      
      // For large tables, we'll do a smaller sample first
      const sampleSize = tableName === 'results' ? 100 : Math.min(totalCount, 500);
      
      // Get sample data
      sqlite.all(`SELECT * FROM ${tableName} LIMIT ${sampleSize}`, async (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        
        console.log(`   🔧 Processing ${sampleSize} sample records...`);
        
        try {
          // Transform data
          const transformedRows = rows.map(row => transformRow(row, columnMapping, tableName));
          
          // Insert in smaller batches via Supabase API
          let processed = 0;
          for (let i = 0; i < transformedRows.length; i += BATCH_SIZE) {
            const batch = transformedRows.slice(i, i + BATCH_SIZE);
            
            const { data, error } = await supabase
              .from(tableName)
              .upsert(batch, { onConflict: getConflictColumn(tableName) });
            
            if (error) {
              console.error(`   ❌ Error inserting batch:`, error.message);
              console.log(`   🔍 Sample record:`, JSON.stringify(batch[0], null, 2));
              
              // Try inserting records one by one to identify problematic ones
              for (const record of batch) {
                const { error: singleError } = await supabase
                  .from(tableName)
                  .upsert([record], { onConflict: getConflictColumn(tableName) });
                
                if (singleError) {
                  console.error(`   ⚠️  Skipping problematic record:`, singleError.message);
                  console.log(`   📝 Record:`, JSON.stringify(record, null, 2));
                }
              }
            } else {
              processed += batch.length;
              console.log(`   ⏳ Progress: ${processed}/${sampleSize} records`);
            }
          }
          
          console.log(`   ✅ Completed ${tableName}: ${processed} records migrated (sample)`);
          
          if (totalCount > sampleSize && processed > 0) {
            console.log(`   📊 Sample successful! Full migration would process ${totalCount.toLocaleString()} records`);
            console.log(`   💡 To migrate all data, increase BATCH_SIZE and remove LIMIT in production`);
          }
          
          resolve();
          
        } catch (error) {
          console.error(`   ❌ Error processing ${tableName}:`, error.message);
          reject(error);
        }
      });
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
  if (transformed[`${tableName.slice(0, -1)}_id`]) {
    delete transformed[`${tableName.slice(0, -1)}_id`];
  }
  
  return transformed;
}

function getConflictColumn(tableName) {
  const conflictColumns = {
    'regions': 'region_name',
    'conferences': 'name',
    'schools': 'official_name', 
    'teams': 'school_id,gender',
    'athletes': 'full_name,school_id',
    'results': 'athlete_id,event_name,date,mark_raw'
  };
  
  return conflictColumns[tableName] || `${tableName.slice(0, -1)}_id`;
}

// Run the migration
if (require.main === module) {
  migrateDataViaSupabaseAPI().catch(console.error);
}

module.exports = { migrateDataViaSupabaseAPI };
