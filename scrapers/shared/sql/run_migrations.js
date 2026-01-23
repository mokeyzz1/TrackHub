#!/usr/bin/env node
/**
 * Run SQL migrations for live results scraper
 *
 * Usage: node run_migrations.js
 *
 * This script reads the SQL file and executes it against Supabase.
 * Alternatively, you can copy the SQL and run it directly in Supabase SQL Editor.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// Extract hostname from URL
const hostname = SUPABASE_URL.replace('https://', '').replace('http://', '');

function executeSQL(sql) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ query: sql });

    const options = {
      hostname: hostname,
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          // RPC might not exist, that's okay - we'll provide manual instructions
          reject({ status: res.statusCode, body: body });
        } else {
          resolve({ status: res.statusCode, body: body });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('========================================');
  console.log('Live Results Scraper - Schema Migration');
  console.log('========================================\n');

  const sqlFile = path.join(__dirname, '001_schema_updates.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  console.log('SQL file loaded: 001_schema_updates.sql\n');

  // Try to execute via RPC (might not work if exec_sql doesn't exist)
  try {
    await executeSQL(sql);
    console.log('Migration executed successfully!\n');
  } catch (e) {
    console.log('Could not execute via RPC (this is normal).\n');
    console.log('Please run the SQL manually in Supabase SQL Editor:');
    console.log('https://supabase.com/dashboard/project/' + hostname.split('.')[0] + '/sql/new\n');
    console.log('----------------------------------------');
    console.log('Copy the contents of:');
    console.log(sqlFile);
    console.log('----------------------------------------\n');
  }

  // Show summary of what the migration does
  console.log('MIGRATION SUMMARY:');
  console.log('------------------');
  console.log('1. meets table:');
  console.log('   + timing_platform (athletic_net, milesplit, etc.)');
  console.log('   + source_url (original USTFCCCA link)');
  console.log('');
  console.log('2. meet_entries table (NEW):');
  console.log('   - Stores athlete entries before meet');
  console.log('   - Links to athletes via athlete_id');
  console.log('   - Used for athlete name matching');
  console.log('');
  console.log('3. live_results table:');
  console.log('   + meet_id (foreign key to meets)');
  console.log('   + entry_id (link to matched entry)');
  console.log('   + result_type (live/final)');
  console.log('');
}

main().catch(console.error);
