#!/usr/bin/env node
/**
 * Fix sequence and upload new athletes
 *
 * Since the athletes table sequence is out of sync, we'll manually assign athlete_ids
 * starting from max(athlete_id) + 1
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Supabase config from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL?.replace('https://', '') || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: Missing Supabase credentials. Check your .env file.');
  process.exit(1);
}

const diffPath = path.join(__dirname, '../output/diff_2026_indoor_2026-01-20_183605.json');

function supabaseRequest(method, endpoint, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SUPABASE_URL,
      path: '/rest/v1/' + endpoint,
      method: method,
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        ...headers
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = body ? JSON.parse(body) : {};
          if (res.statusCode >= 400) {
            reject({ status: res.statusCode, message: result.message || body, details: result.details });
          } else {
            resolve({ data: result, headers: res.headers, status: res.statusCode });
          }
        } catch (e) {
          resolve({ data: body, headers: res.headers, status: res.statusCode });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function queryWithCount(table, params = '') {
  const res = await supabaseRequest('GET', table + '?' + params, null, { 'Prefer': 'count=exact' });
  const countMatch = res.headers['content-range']?.match(/\/(\d+)/);
  return { data: res.data, count: countMatch ? parseInt(countMatch[1]) : 0 };
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function buildTeamLookup() {
  console.log('Building team lookup...');
  const allTeams = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const res = await supabaseRequest('GET', `teams?select=team_id,school_id,gender&offset=${offset}&limit=${limit}`);
    allTeams.push(...res.data);
    if (res.data.length < limit) break;
    offset += limit;
  }

  const lookup = {};
  for (const team of allTeams) {
    lookup[`${team.school_id}_${team.gender}`] = team.team_id;
  }
  console.log(`  Loaded ${allTeams.length} teams`);
  return lookup;
}

async function main() {
  console.log('='.repeat(60));
  console.log('FIX AND UPLOAD NEW ATHLETES');
  console.log('='.repeat(60));

  // Load diff
  const diff = loadJson(diffPath);
  const newAthletes = diff.added_athletes || [];
  console.log(`\nNew athletes in diff: ${newAthletes.length}`);

  // Get max athlete_id
  const maxRes = await supabaseRequest('GET', 'athletes?select=athlete_id&order=athlete_id.desc&limit=1');
  const maxAthleteId = maxRes.data[0]?.athlete_id || 0;
  console.log(`Max athlete_id in DB: ${maxAthleteId}`);

  // Get existing tfrrs_athlete_ids
  console.log('\nFetching existing tfrrs_athlete_ids...');
  const existingIds = new Set();
  let offset = 0;
  const limit = 1000;

  while (true) {
    const res = await supabaseRequest('GET', `athletes?select=tfrrs_athlete_id&offset=${offset}&limit=${limit}`);
    for (const a of res.data) {
      if (a.tfrrs_athlete_id) existingIds.add(a.tfrrs_athlete_id);
    }
    process.stdout.write(`\r  Fetched ${existingIds.size}...`);
    if (res.data.length < limit) break;
    offset += limit;
  }
  console.log(`\n  Total existing: ${existingIds.size}`);

  // Filter to truly new athletes
  const toAdd = newAthletes.filter(a => !existingIds.has(a.tfrrs_athlete_id));
  console.log(`\nTruly new athletes: ${toAdd.length}`);

  if (toAdd.length === 0) {
    console.log('Nothing to add!');
    return;
  }

  // Build team lookup
  const teamLookup = await buildTeamLookup();

  // Insert athletes with manual athlete_id
  console.log('\nInserting new athletes...');
  let nextAthleteId = maxAthleteId + 1;
  const batchSize = 50;
  let totalInserted = 0;
  let totalErrors = 0;
  const insertedAthletes = [];

  for (let i = 0; i < toAdd.length; i += batchSize) {
    const batch = toAdd.slice(i, i + batchSize);
    const athleteRecords = batch.map((a, idx) => ({
      athlete_id: nextAthleteId + idx,
      full_name: a.full_name,
      school_id: a.school_id,
      class_year: a.class_year,
      gender: a.gender,
      tfrrs_athlete_id: a.tfrrs_athlete_id,
      tfrrs_profile_url: a.tfrrs_profile_url,
      is_active: true
    }));

    try {
      const res = await supabaseRequest('POST', 'athletes', athleteRecords);
      insertedAthletes.push(...res.data.map((r, idx) => ({
        ...r,
        class_year: batch[idx].class_year
      })));
      totalInserted += res.data.length;
      nextAthleteId += batch.length;
    } catch (e) {
      console.error(`\n  Error at batch ${i}: ${e.message}`);
      if (e.details) console.error(`  Details: ${e.details}`);
      totalErrors += batch.length;
      // Try to recover by checking max again
      const newMax = await supabaseRequest('GET', 'athletes?select=athlete_id&order=athlete_id.desc&limit=1');
      nextAthleteId = (newMax.data[0]?.athlete_id || nextAthleteId) + 1;
    }

    process.stdout.write(`\r  Progress: ${Math.min(i + batchSize, toAdd.length)}/${toAdd.length} (inserted: ${totalInserted}, errors: ${totalErrors})`);
  }
  console.log('');

  // Add 2025-2026 season records for newly inserted athletes
  console.log('\nAdding season records for new athletes...');
  const seasonRecords = insertedAthletes
    .map(a => {
      const teamId = teamLookup[`${a.school_id}_${a.gender}`];
      return teamId ? {
        athlete_id: a.athlete_id,
        team_id: teamId,
        season_code: '2025-2026',
        year_in_school: a.class_year,
        status: 'active'
      } : null;
    })
    .filter(Boolean);

  let seasonInserted = 0;
  for (let i = 0; i < seasonRecords.length; i += 500) {
    const batch = seasonRecords.slice(i, i + 500);
    try {
      await supabaseRequest('POST', 'athlete_team_seasons', batch);
      seasonInserted += batch.length;
    } catch (e) {
      console.error(`  Season batch error: ${e.message}`);
    }
    process.stdout.write(`\r  Progress: ${Math.min(i + 500, seasonRecords.length)}/${seasonRecords.length}`);
  }
  console.log('');

  // Final counts
  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE!');
  console.log('='.repeat(60));

  const { count: totalAthletes } = await queryWithCount('athletes', 'limit=1');
  const { count: total2024 } = await queryWithCount('athlete_team_seasons', 'season_code=eq.2024-2025&limit=1');
  const { count: total2026 } = await queryWithCount('athlete_team_seasons', 'season_code=eq.2025-2026&limit=1');

  console.log(`\nFinal Counts:`);
  console.log(`  Athletes: ${totalAthletes}`);
  console.log(`  2024-2025 season records: ${total2024}`);
  console.log(`  2025-2026 season records: ${total2026}`);
  console.log(`\n  New athletes inserted: ${totalInserted}`);
  console.log(`  New season records: ${seasonInserted}`);
}

main().catch(console.error);
