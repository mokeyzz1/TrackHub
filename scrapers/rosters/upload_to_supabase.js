#!/usr/bin/env node
/**
 * Upload 2026 Roster Data to Supabase
 *
 * This script:
 * 1. Backfills 2024-2025 data into athlete_team_seasons
 * 2. Adds new athletes to athletes table
 * 3. Adds 2025-2026 season records for all current athletes
 * 4. Updates transfers (school_id changes)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Supabase credentials from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL?.replace('https://', '') || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: Missing Supabase credentials. Check your .env file.');
  process.exit(1);
}

// File paths
const diffPath = path.join(__dirname, '../output/diff_2026_indoor_2026-01-20_183605.json');
const newRostersPath = path.join(__dirname, '../output/rosters_2026_indoor_latest.json');

// Helper: Make Supabase REST API request
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
            reject({ status: res.statusCode, message: result.message || body });
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

// Helper: Query with count
async function queryWithCount(table, params = '') {
  const res = await supabaseRequest('GET', table + '?' + params, null, { 'Prefer': 'count=exact' });
  const countMatch = res.headers['content-range']?.match(/\/(\d+)/);
  return { data: res.data, count: countMatch ? parseInt(countMatch[1]) : 0 };
}

// Helper: Batch insert
async function batchInsert(table, records, batchSize = 500) {
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    try {
      await supabaseRequest('POST', table, batch);
      inserted += batch.length;
    } catch (e) {
      console.error(`  Batch error: ${e.message}`);
      errors += batch.length;
    }
    process.stdout.write(`\r  Progress: ${Math.min(i + batchSize, records.length)}/${records.length}`);
  }

  return { inserted, errors };
}

// Load JSON file
function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Build team lookup: school_id + gender -> team_id
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

// Step 1: Backfill 2024-2025 into athlete_team_seasons
async function backfill2024Season(teamLookup) {
  console.log('\n=== STEP 1: Backfill 2024-2025 Season ===');

  // Check if already backfilled
  const { count } = await queryWithCount('athlete_team_seasons', 'season_code=eq.2024-2025&limit=1');
  if (count > 0) {
    console.log(`  Already have ${count} records for 2024-2025. Skipping.`);
    return;
  }

  // Get all athletes in batches
  console.log('  Fetching athletes from Supabase...');
  const allAthletes = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const res = await supabaseRequest('GET', `athletes?select=athlete_id,school_id,class_year,gender&offset=${offset}&limit=${limit}`);
    allAthletes.push(...res.data);
    process.stdout.write(`\r  Fetched ${allAthletes.length} athletes...`);
    if (res.data.length < limit) break;
    offset += limit;
  }
  console.log(`\n  Total: ${allAthletes.length} athletes`);

  // Create season records
  const records = [];
  let skipped = 0;
  for (const athlete of allAthletes) {
    const teamId = teamLookup[`${athlete.school_id}_${athlete.gender}`];
    if (!teamId) {
      skipped++;
      continue;
    }
    records.push({
      athlete_id: athlete.athlete_id,
      team_id: teamId,
      season_code: '2024-2025',
      year_in_school: athlete.class_year,
      status: 'active'
    });
  }

  console.log(`  Inserting ${records.length} season records (skipping ${skipped})...`);
  const { inserted, errors } = await batchInsert('athlete_team_seasons', records);
  console.log(`\n  Done: ${inserted} inserted, ${errors} errors`);
}

// Step 2: Add new athletes
async function addNewAthletes(diff, teamLookup) {
  console.log('\n=== STEP 2: Add New Athletes ===');

  const newAthletes = diff.added_athletes || [];
  console.log(`  ${newAthletes.length} new athletes to add`);

  // Check for existing tfrrs_athlete_ids to avoid duplicates
  const existingIds = new Set();
  let offset = 0;
  const limit = 1000;

  console.log('  Checking for existing athletes...');
  while (true) {
    const res = await supabaseRequest('GET', `athletes?select=tfrrs_athlete_id&offset=${offset}&limit=${limit}`);
    for (const a of res.data) {
      if (a.tfrrs_athlete_id) existingIds.add(a.tfrrs_athlete_id);
    }
    if (res.data.length < limit) break;
    offset += limit;
  }
  console.log(`  Found ${existingIds.size} existing tfrrs_athlete_ids`);

  // Filter out already existing
  const toAdd = newAthletes.filter(a => !existingIds.has(a.tfrrs_athlete_id));
  console.log(`  ${toAdd.length} truly new athletes (${newAthletes.length - toAdd.length} already exist)`);

  if (toAdd.length === 0) {
    console.log('  Nothing to add.');
    return;
  }

  // Insert in batches and collect inserted athlete_ids
  const batchSize = 100;
  let totalInserted = 0;
  const insertedAthletes = [];

  for (let i = 0; i < toAdd.length; i += batchSize) {
    const batch = toAdd.slice(i, i + batchSize);
    const athleteRecords = batch.map(a => ({
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
    } catch (e) {
      console.error(`  Error inserting batch: ${e.message}`);
    }

    process.stdout.write(`\r  Inserted: ${totalInserted}/${toAdd.length}`);
  }
  console.log('');

  // Add 2025-2026 season records
  console.log('  Adding season records for new athletes...');
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

  const { inserted } = await batchInsert('athlete_team_seasons', seasonRecords);
  console.log(`\n  Added ${inserted} season records`);
}

// Step 3: Add 2025-2026 for returning athletes
async function addReturningAthletes(diff, teamLookup) {
  console.log('\n=== STEP 3: Add 2025-2026 for Returning Athletes ===');

  const newRosters = loadJson(newRostersPath);
  const newAthleteTfrrsIds = new Set((diff.added_athletes || []).map(a => a.tfrrs_athlete_id));
  const transferTfrrsIds = new Set((diff.transfers || []).map(t => t.tfrrs_athlete_id));

  // Returning = in new roster, not new, not transfer
  const returningAthletes = newRosters.athletes.filter(a =>
    !newAthleteTfrrsIds.has(a.tfrrs_athlete_id) &&
    !transferTfrrsIds.has(a.tfrrs_athlete_id)
  );
  console.log(`  ${returningAthletes.length} returning athletes`);

  // Check what 2025-2026 records already exist
  const { count: existing2026 } = await queryWithCount('athlete_team_seasons', 'season_code=eq.2025-2026&limit=1');
  console.log(`  Already have ${existing2026} records for 2025-2026`);

  // Get athlete_id mapping by tfrrs_athlete_id
  console.log('  Building tfrrs_id -> athlete_id map...');
  const idMap = {};
  let offset = 0;
  const limit = 1000;

  while (true) {
    const res = await supabaseRequest('GET', `athletes?select=athlete_id,tfrrs_athlete_id,school_id,gender&offset=${offset}&limit=${limit}`);
    for (const a of res.data) {
      if (a.tfrrs_athlete_id) {
        idMap[a.tfrrs_athlete_id] = a;
      }
    }
    if (res.data.length < limit) break;
    offset += limit;
  }
  console.log(`  Mapped ${Object.keys(idMap).length} athletes`);

  // Create season records
  const seasonRecords = [];
  for (const roster of returningAthletes) {
    const dbAthlete = idMap[roster.tfrrs_athlete_id];
    if (!dbAthlete) continue;

    const teamId = teamLookup[`${dbAthlete.school_id}_${dbAthlete.gender}`];
    if (!teamId) continue;

    seasonRecords.push({
      athlete_id: dbAthlete.athlete_id,
      team_id: teamId,
      season_code: '2025-2026',
      year_in_school: roster.class_year,
      status: 'active'
    });
  }

  console.log(`  Inserting ${seasonRecords.length} season records...`);
  const { inserted, errors } = await batchInsert('athlete_team_seasons', seasonRecords);
  console.log(`\n  Done: ${inserted} inserted, ${errors} errors`);
}

// Step 4: Handle transfers
async function handleTransfers(diff, teamLookup) {
  console.log('\n=== STEP 4: Handle Transfers ===');

  const transfers = diff.transfers || [];
  console.log(`  ${transfers.length} transfers to process`);

  // Get athlete_id mapping
  const idMap = {};
  let offset = 0;
  const limit = 1000;

  while (true) {
    const res = await supabaseRequest('GET', `athletes?select=athlete_id,tfrrs_athlete_id,gender&offset=${offset}&limit=${limit}`);
    for (const a of res.data) {
      if (a.tfrrs_athlete_id) idMap[a.tfrrs_athlete_id] = a;
    }
    if (res.data.length < limit) break;
    offset += limit;
  }

  let updated = 0;
  let seasonAdded = 0;

  for (let i = 0; i < transfers.length; i++) {
    const transfer = transfers[i];
    const dbAthlete = idMap[transfer.tfrrs_athlete_id];
    if (!dbAthlete) continue;

    // Update school_id
    try {
      await supabaseRequest('PATCH', `athletes?athlete_id=eq.${dbAthlete.athlete_id}`, {
        school_id: transfer.new_school_id
      });
      updated++;
    } catch (e) {
      // Ignore errors
    }

    // Add 2025-2026 season record
    const teamId = teamLookup[`${transfer.new_school_id}_${dbAthlete.gender}`];
    if (teamId) {
      try {
        await supabaseRequest('POST', 'athlete_team_seasons', {
          athlete_id: dbAthlete.athlete_id,
          team_id: teamId,
          season_code: '2025-2026',
          year_in_school: transfer.class_year,
          status: 'active'
        });
        seasonAdded++;
      } catch (e) {
        // Might be duplicate
      }
    }

    process.stdout.write(`\r  Progress: ${i + 1}/${transfers.length}`);
  }

  console.log(`\n  Updated ${updated} athletes, added ${seasonAdded} season records`);
}

// Main
async function main() {
  console.log('='.repeat(60));
  console.log('SUPABASE ROSTER UPLOAD - 2026 Indoor Season');
  console.log('='.repeat(60));

  try {
    // Load diff
    console.log('\nLoading diff file...');
    const diff = loadJson(diffPath);
    console.log(`  Added: ${diff.metadata.summary.added}`);
    console.log(`  Transfers: ${diff.metadata.summary.transfers}`);
    console.log(`  Updated: ${diff.metadata.summary.updated}`);
    console.log(`  Removed: ${diff.metadata.summary.removed}`);

    // Build team lookup
    const teamLookup = await buildTeamLookup();

    // Run steps
    await backfill2024Season(teamLookup);
    await addNewAthletes(diff, teamLookup);
    await addReturningAthletes(diff, teamLookup);
    await handleTransfers(diff, teamLookup);

    console.log('\n' + '='.repeat(60));
    console.log('UPLOAD COMPLETE!');
    console.log('='.repeat(60));

    // Final counts
    const { count: totalAthletes } = await queryWithCount('athletes', 'limit=1');
    const { count: total2024 } = await queryWithCount('athlete_team_seasons', 'season_code=eq.2024-2025&limit=1');
    const { count: total2026 } = await queryWithCount('athlete_team_seasons', 'season_code=eq.2025-2026&limit=1');

    console.log(`\nFinal Counts:`);
    console.log(`  Athletes: ${totalAthletes}`);
    console.log(`  2024-2025 season records: ${total2024}`);
    console.log(`  2025-2026 season records: ${total2026}`);

  } catch (error) {
    console.error('\nError:', error);
    process.exit(1);
  }
}

main();
