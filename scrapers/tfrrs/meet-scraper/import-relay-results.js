/**
 * Import relay results to database
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RESULTS_FILE = path.join(__dirname, 'output/meet-results.json');

// Normalize school name for matching
function normalizeSchoolName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function importRelayResults(commit = false) {
  console.log('========================================');
  console.log(commit ? 'IMPORTING RELAY RESULTS' : 'DRY RUN');
  console.log('========================================\n');

  // Load scraped results
  const allResults = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
  const relayResults = allResults.filter(r => r.is_relay === true);
  console.log(`Loaded ${relayResults.length.toLocaleString()} relay results\n`);

  // Load all teams for matching
  console.log('Loading teams from database...');
  let allTeams = [];
  let offset = 0;
  while (true) {
    const { data: batch } = await supabase
      .from('teams')
      .select('team_id, gender, school_id, schools(short_name, official_name)')
      .range(offset, offset + 999);
    if (!batch || batch.length === 0) break;
    allTeams = allTeams.concat(batch);
    offset += 1000;
  }
  console.log(`Loaded ${allTeams.length} teams\n`);

  // Build team lookup
  const teamByName = new Map();
  for (const team of allTeams) {
    const shortName = team.schools?.short_name;
    const officialName = team.schools?.official_name;

    if (shortName) {
      const exactKey = `${shortName.toLowerCase()}|${team.gender}`;
      const normKey = `${normalizeSchoolName(shortName)}|${team.gender}`;
      if (!teamByName.has(exactKey)) teamByName.set(exactKey, team.team_id);
      if (!teamByName.has(normKey)) teamByName.set(normKey, team.team_id);
    }
    if (officialName) {
      const exactKey = `${officialName.toLowerCase()}|${team.gender}`;
      const normKey = `${normalizeSchoolName(officialName)}|${team.gender}`;
      if (!teamByName.has(exactKey)) teamByName.set(exactKey, team.team_id);
      if (!teamByName.has(normKey)) teamByName.set(normKey, team.team_id);
    }
  }

  // Load existing athletes to map tfrrs_athlete_id -> athlete_id
  console.log('Loading existing athletes...');
  const tfrrsToInternalId = new Map();
  offset = 0;
  while (true) {
    const { data } = await supabase
      .from('athletes')
      .select('athlete_id, tfrrs_athlete_id')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    data.forEach(a => {
      if (a.tfrrs_athlete_id) {
        tfrrsToInternalId.set(parseInt(a.tfrrs_athlete_id), a.athlete_id);
      }
    });
    offset += 1000;
  }
  console.log(`Loaded ${tfrrsToInternalId.size} athletes\n`);

  // Process relay results
  let matched = 0;
  let noTeam = 0;

  const dbRelayResults = [];

  for (const r of relayResults) {
    // Find team_id
    let teamId = null;
    if (r.school_name) {
      const gender = r.team_gender || 'M';
      const exactKey = `${r.school_name.toLowerCase()}|${gender}`;
      const normKey = `${normalizeSchoolName(r.school_name)}|${gender}`;
      teamId = teamByName.get(exactKey) || teamByName.get(normKey);
    }

    if (teamId) {
      matched++;
    } else {
      noTeam++;
    }

    // Map relay athletes to internal IDs
    const relayAthletes = (r.relay_athletes || []).map((a, idx) => ({
      tfrrs_athlete_id: String(a.athlete_id),
      athlete_id: tfrrsToInternalId.get(a.athlete_id) || null,
      athlete_name: a.name,
      leg_order: idx + 1
    }));

    dbRelayResults.push({
      team_id: teamId,
      event_name: r.event_name,
      mark_raw: r.mark_raw,
      mark_seconds: r.mark_seconds,
      place: r.place,
      meet_name: r.meet_name,
      meet_id: r.meet_id,
      event_id: r.event_id,
      date: r.date,
      round: r.round,
      relay_athletes: relayAthletes
    });
  }

  console.log('Processing summary:');
  console.log(`  Team matched: ${matched.toLocaleString()}`);
  console.log(`  No team match: ${noTeam.toLocaleString()}`);

  // Sample
  console.log('\nSample relay results (first 3):');
  dbRelayResults.slice(0, 3).forEach(r => {
    const athletes = r.relay_athletes.map(a => a.athlete_name).join(', ');
    console.log(`  ${r.event_name} | ${r.mark_raw} | ${athletes.slice(0, 50)}...`);
  });

  if (!commit) {
    console.log('\n>>> DRY RUN - No changes made <<<');
    console.log('Run with --commit to import');
    return;
  }

  // Import relay results
  console.log('\nImporting relay results...');
  let imported = 0;
  let errors = 0;

  for (let i = 0; i < dbRelayResults.length; i += 100) {
    const batch = dbRelayResults.slice(i, i + 100);

    // Insert relay results
    const relayInserts = batch.map(r => ({
      team_id: r.team_id,
      event_name: r.event_name,
      mark_raw: r.mark_raw,
      mark_seconds: r.mark_seconds,
      place: r.place,
      meet_name: r.meet_name,
      meet_id: r.meet_id,
      event_id: r.event_id,
      date: r.date,
      round: r.round
    }));

    const { data: insertedRelays, error: relayError } = await supabase
      .from('relay_results')
      .insert(relayInserts)
      .select('relay_result_id');

    if (relayError) {
      console.log(`  Batch ${Math.floor(i/100) + 1} error: ${relayError.message}`);
      errors += batch.length;
      continue;
    }

    // Insert relay athletes
    const athleteInserts = [];
    insertedRelays.forEach((relay, idx) => {
      const originalRelay = batch[idx];
      originalRelay.relay_athletes.forEach(a => {
        athleteInserts.push({
          relay_result_id: relay.relay_result_id,
          athlete_id: a.athlete_id,
          tfrrs_athlete_id: a.tfrrs_athlete_id,
          athlete_name: a.athlete_name,
          leg_order: a.leg_order
        });
      });
    });

    if (athleteInserts.length > 0) {
      const { error: athleteError } = await supabase
        .from('relay_athletes')
        .insert(athleteInserts);

      if (athleteError) {
        console.log(`  Relay athletes error: ${athleteError.message}`);
      }
    }

    imported += batch.length;

    if ((i + 100) % 1000 === 0) {
      console.log(`  ${imported.toLocaleString()}/${dbRelayResults.length.toLocaleString()} imported`);
    }
  }

  console.log('\n========================================');
  console.log('COMPLETE');
  console.log('========================================');
  console.log(`Relay results imported: ${imported.toLocaleString()}`);
  console.log(`Errors: ${errors}`);
}

const commit = process.argv.includes('--commit');
importRelayResults(commit).catch(console.error);
