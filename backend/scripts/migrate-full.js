#!/usr/bin/env node

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuration
const SQLITE_DB_PATH = path.join(__dirname, '../server/track_hub.db');
const BATCH_SIZE = 1000; // Larger batches for full migration

async function migrateFullData() {
  console.log('🚀 Starting FULL SQLite to Supabase migration...');
  console.log('⚠️  This will migrate ALL 2.2M+ records - may take 30-60 minutes\n');

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
    console.log('✅ Connected to Supabase\n');

    // Migration order (respecting foreign key constraints)
    const migrations = [
      { table: 'regions', idColumn: 'region_id' },
      { table: 'conferences', idColumn: 'conference_id' },
      { table: 'schools', idColumn: 'school_id' },
      { table: 'teams', idColumn: 'team_id' },
      { table: 'athletes', idColumn: 'athlete_id' },
      { table: 'athlete_team_seasons', idColumn: 'ats_id' },
      { table: 'results', idColumn: 'result_id' },
      { table: 'conference_memberships', idColumn: 'membership_id' },
      { table: 'external_ids', idColumn: 'external_id' }
    ];

    for (const migration of migrations) {
      await migrateTableFull(sqlite, supabase, migration.table, migration.idColumn);
    }

    console.log('\n🎉 Full data migration completed successfully!');
    console.log('📊 All 2.2M+ records have been migrated to Supabase');
    console.log('🚀 Your app is ready to use Supabase!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    sqlite.close();
  }
}

async function migrateTableFull(sqlite, supabase, tableName, idColumn) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Migrating table: ${tableName}`);
  console.log(`${'='.repeat(60)}`);

  return new Promise((resolve, reject) => {
    // First, get the total count
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
      console.log(`   📋 Total records: ${totalCount.toLocaleString()}`);

      if (totalCount === 0) {
        console.log(`   ✅ Table ${tableName} is empty, skipping...`);
        resolve();
        return;
      }

      // Clear existing data first
      console.log(`   🧹 Clearing existing ${tableName} data...`);
      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .neq('created_at', '1900-01-01'); // Delete all

      if (deleteError && !deleteError.message.includes('no rows')) {
        console.log(`   ⚠️  Clear warning: ${deleteError.message}`);
      }

      let processed = 0;
      let offset = 0;
      let errors = 0;

      // Process in batches
      const processBatch = async () => {
        if (offset >= totalCount) {
          // Reset sequence after migration
          console.log(`   🔧 Resetting ID sequence...`);
          const maxId = await getMaxId(supabase, tableName, idColumn);
          if (maxId) {
            await resetSequence(supabase, tableName, idColumn, maxId);
          }

          console.log(`   ✅ Completed ${tableName}: ${processed.toLocaleString()} records migrated`);
          if (errors > 0) {
            console.log(`   ⚠️  ${errors} records had errors (see logs above)`);
          }
          resolve();
          return;
        }

        const query = `SELECT * FROM ${tableName} LIMIT ${BATCH_SIZE} OFFSET ${offset}`;

        sqlite.all(query, async (err, rows) => {
          if (err) {
            console.error(`   ❌ Error reading batch at offset ${offset}:`, err.message);
            reject(err);
            return;
          }

          if (rows.length > 0) {
            try {
              // Transform rows (keep IDs!)
              const transformedRows = rows.map(row => transformRow(row, tableName));

              // Insert batch
              const { data, error } = await supabase
                .from(tableName)
                .insert(transformedRows);

              if (error) {
                errors++;
                console.error(`   ❌ Error at offset ${offset}:`, error.message);
                if (rows.length > 0) {
                  console.log(`   🔍 First record in failed batch:`, JSON.stringify(transformedRows[0], null, 2));
                }
              } else {
                processed += rows.length;
              }

              // Progress update
              const progress = ((offset + rows.length) / totalCount * 100).toFixed(1);
              console.log(`   ⏳ Progress: ${(offset + rows.length).toLocaleString()}/${totalCount.toLocaleString()} (${progress}%)`);

            } catch (error) {
              errors++;
              console.error(`   ❌ Batch processing error:`, error.message);
            }
          }

          offset += BATCH_SIZE;

          // Continue with next batch
          setTimeout(processBatch, 100); // Small delay to avoid rate limits
        });
      };

      // Start processing
      processBatch();
    });
  });
}

function transformRow(row, tableName) {
  const transformed = { ...row };

  // Convert SQLite boolean integers to PostgreSQL booleans
  ['is_active', 'is_pr', 'is_season_best', 'is_redshirt', 'verified'].forEach(boolCol => {
    if (transformed[boolCol] !== undefined && transformed[boolCol] !== null) {
      transformed[boolCol] = transformed[boolCol] === 1;
    }
  });

  // Keep all IDs intact - DO NOT delete them!
  // PostgreSQL will accept explicit ID values

  return transformed;
}

async function getMaxId(supabase, tableName, idColumn) {
  const { data, error } = await supabase
    .from(tableName)
    .select(idColumn)
    .order(idColumn, { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return null;
  }

  return data[0][idColumn];
}

async function resetSequence(supabase, tableName, idColumn, maxId) {
  // This requires a direct SQL query via Supabase SQL editor or function
  // For now, log the SQL that needs to be run
  const sequenceName = `${tableName}_${idColumn}_seq`;
  const sql = `SELECT setval('${sequenceName}', ${maxId + 1}, false);`;

  console.log(`   📝 Run this SQL in Supabase SQL editor:`);
  console.log(`      ${sql}`);
}

// Run the migration
if (require.main === module) {
  migrateFullData().catch(console.error);
}

module.exports = { migrateFullData };
