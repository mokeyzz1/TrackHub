#!/usr/bin/env node

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuration
const SQLITE_DB_PATH = path.join(__dirname, '../../backend/server/track_hub.db');
const BATCH_SIZE = 1000; // Process records in batches to avoid memory issues

async function migrateData() {
  console.log('🚀 Starting SQLite to PostgreSQL data migration...');
  
  // Check if SQLite database exists
  if (!fs.existsSync(SQLITE_DB_PATH)) {
    console.error(`❌ SQLite database not found at: ${SQLITE_DB_PATH}`);
    process.exit(1);
  }
  
  console.log(`📂 Found SQLite database: ${SQLITE_DB_PATH}`);
  
  // Connect to SQLite
  const sqlite = new sqlite3.Database(SQLITE_DB_PATH);
  
  // Connect to PostgreSQL via Supabase
  const pg = new Client({
    host: process.env.EXPO_PUBLIC_SUPABASE_URL.replace('https://', '').replace('.supabase.co', '') + '.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pg.connect();
    console.log('✅ Connected to PostgreSQL');

    // Migration order (respecting foreign key constraints)
    const migrations = [
      { table: 'regions', deps: [] },
      { table: 'conferences', deps: [] },
      { table: 'schools', deps: ['regions', 'conferences'] },
      { table: 'teams', deps: ['schools'] },
      { table:'athletes', deps: ['schools'] },
      { table: 'results', deps: ['athletes', 'teams'] },
      { table: 'athlete_team_seasons', deps: ['athletes', 'teams'] },
      { table: 'conference_memberships', deps: ['schools', 'conferences'] },
      { table: 'external_ids', deps: ['schools', 'athletes', 'teams', 'conferences'] }
    ];

    for (const migration of migrations) {
      await migrateTable(sqlite, pg, migration.table);
    }

    console.log('🎉 Data migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    sqlite.close();
    await pg.end();
  }
}

async function migrateTable(sqlite, pg, tableName) {
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
      
      // Get table structure
      sqlite.all(`PRAGMA table_info(${tableName})`, async (err, columns) => {
        if (err) {
          reject(err);
          return;
        }
        
        const columnNames = columns.map(col => col.name);
        console.log(`   🔧 Columns: ${columnNames.join(', ')}`);
        
        let processed = 0;
        let offset = 0;
        
        // Process in batches
        while (processed < totalCount) {
          const query = `SELECT * FROM ${tableName} LIMIT ${BATCH_SIZE} OFFSET ${offset}`;
          
          try {
            const rows = await new Promise((resolve, reject) => {
              sqlite.all(query, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
              });
            });
            
            if (rows.length > 0) {
              await insertBatch(pg, tableName, rows, columnNames);
              processed += rows.length;
              
              const progress = ((processed / totalCount) * 100).toFixed(1);
              console.log(`   ⏳ Progress: ${processed.toLocaleString()}/${totalCount.toLocaleString()} (${progress}%)`);
            }
            
            offset += BATCH_SIZE;
            
          } catch (error) {
            console.error(`   ❌ Error processing batch at offset ${offset}:`, error.message);
            reject(error);
            return;
          }
        }
        
        console.log(`   ✅ Completed ${tableName}: ${processed.toLocaleString()} records migrated`);
        resolve();
      });
    });
  });
}

async function insertBatch(pg, tableName, rows, columnNames) {
  if (rows.length === 0) return;
  
  // Handle special column mappings for different tables
  const specialMappings = {
    'schools': {
      'name': 'official_name', // SQLite 'name' -> PostgreSQL 'official_name'
    },
    'athletes': {
      'name': 'full_name', // SQLite 'name' -> PostgreSQL 'full_name'
    }
  };
  
  // Map column names if needed
  const mappedColumns = columnNames.map(col => {
    if (specialMappings[tableName] && specialMappings[tableName][col]) {
      return specialMappings[tableName][col];
    }
    return col;
  });
  
  // Create parameterized query
  const placeholders = rows.map((_, i) => 
    `(${columnNames.map((_, j) => `$${i * columnNames.length + j + 1}`).join(', ')})`
  ).join(', ');
  
  const query = `
    INSERT INTO ${tableName} (${mappedColumns.join(', ')}) 
    VALUES ${placeholders}
    ON CONFLICT DO NOTHING
  `;
  
  // Flatten values array
  const values = rows.flatMap(row => 
    columnNames.map(col => {
      let value = row[col];
      
      // Handle different data types
      if (value === null || value === undefined) {
        return null;
      }
      
      // Convert SQLite boolean integers to PostgreSQL booleans
      if (tableName === 'schools' && (col === 'is_active')) {
        return value === 1;
      }
      if (tableName === 'athletes' && (col === 'is_active')) {
        return value === 1;
      }
      if (tableName === 'results' && (col === 'is_pr' || col === 'is_season_best')) {
        return value === 1;
      }
      
      return value;
    })
  );
  
  try {
    await pg.query(query, values);
  } catch (error) {
    // Log the first few problematic rows for debugging
    console.error(`   ⚠️  Batch insert error for ${tableName}:`, error.message);
    console.log(`   🔍 Sample row:`, JSON.stringify(rows[0], null, 2));
    throw error;
  }
}

// Run the migration
if (require.main === module) {
  migrateData().catch(console.error);
}

module.exports = { migrateData };
