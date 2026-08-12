/**
 * Import only NEW athletes and their results
 * (Athletes that now have matched schools after adding new schools)
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { parseName } = require('../../shared/name_parser');

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

async function importNewAthletes(commit = false) {
  console.log('========================================');
  console.log(commit ? 'IMPORTING NEW ATHLETES' : 'DRY RUN');
  console.log('========================================\n');

  // Load scraped results
  const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
  console.log(`Loaded ${results.length.toLocaleString()} results\n`);

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
  const teamToSchool = new Map();
  for (const team of allTeams) {
    const shortName = team.schools?.short_name;
    const officialName = team.schools?.official_name;
    teamToSchool.set(team.team_id, team.school_id);

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

  // Load existing athletes
  console.log('Loading existing athletes...');
  const tfrrsIds = [...new Set(results.map(r => r.athlete_id).filter(id => id != null))];
  const tfrrsToInternalId = new Map();

  for (let i = 0; i < tfrrsIds.length; i += 1000) {
    const chunk = tfrrsIds.slice(i, i + 1000).map(String);
    const { data } = await supabase
      .from('athletes')
      .select('athlete_id, tfrrs_athlete_id')
      .in('tfrrs_athlete_id', chunk);
    if (data) {
      data.forEach(a => tfrrsToInternalId.set(parseInt(a.tfrrs_athlete_id), a.athlete_id));
    }
  }
  console.log(`Found ${tfrrsToInternalId.size} existing athletes\n`);

  // Find NEW athletes (not in DB, have matched school)
  const newAthletes = [];
  const seenAthletes = new Set();
  const newAthleteResults = []; // Results for new athletes only

  for (const r of results) {
    if (!r.athlete_id) continue;

    // Skip if athlete already in DB
    if (tfrrsToInternalId.has(r.athlete_id)) continue;

    // Find team
    let teamId = null;
    if (r.school_name) {
      const isFemale = r.event_name?.toLowerCase().includes('women') || r.team_gender === 'F';
      const gender = isFemale ? 'F' : 'M';
      const exactKey = `${r.school_name.toLowerCase()}|${gender}`;
      const normKey = `${normalizeSchoolName(r.school_name)}|${gender}`;
      teamId = teamByName.get(exactKey) || teamByName.get(normKey);
    }

    const schoolId = teamId ? teamToSchool.get(teamId) : null;
    if (!schoolId) continue; // Can't create athlete without school

    // Collect new athlete
    if (!seenAthletes.has(r.athlete_id)) {
      seenAthletes.add(r.athlete_id);
      newAthletes.push({
        tfrrs_athlete_id: String(r.athlete_id),
        full_name: r.athlete_name,
        ...(parseName(r.athlete_name) || {}),  // first_name/last_name on insert
        gender: r.team_gender || null,
        school_id: schoolId,
        is_active: true
      });
    }

    // Collect result
    newAthleteResults.push({
      tfrrs_athlete_id: r.athlete_id,
      event_name: r.event_name,
      mark_raw: r.mark_raw,
      mark_seconds: r.mark_seconds,
      mark_meters: r.mark_meters,
      place: r.place,
      meet_name: r.meet_name,
      meet_id: r.meet_id,
      event_id: r.event_id,
      date: r.date,
      team_id: teamId,
      round: r.round
    });
  }

  console.log(`New athletes to create: ${newAthletes.length}`);
  console.log(`Results for new athletes: ${newAthleteResults.length}\n`);

  if (!commit) {
    console.log('>>> DRY RUN - No changes made <<<');
    console.log('Run with --commit to import');
    return;
  }

  // Create athletes
  console.log('Creating new athletes...');
  let athletesCreated = 0;

  for (let i = 0; i < newAthletes.length; i += 500) {
    const batch = newAthletes.slice(i, i + 500);
    const { data, error } = await supabase
      .from('athletes')
      .insert(batch)
      .select('athlete_id, tfrrs_athlete_id');

    if (error) {
      console.log(`  Batch error: ${error.message}`);
    } else {
      athletesCreated += batch.length;
      data.forEach(a => tfrrsToInternalId.set(parseInt(a.tfrrs_athlete_id), a.athlete_id));
    }

    if ((i + 500) % 1000 === 0) {
      console.log(`  ${athletesCreated}/${newAthletes.length} created`);
    }
  }
  console.log(`Created ${athletesCreated} athletes\n`);

  // Map results to internal athlete IDs and import
  console.log('Importing results...');
  const validResults = newAthleteResults
    .map(r => ({
      athlete_id: tfrrsToInternalId.get(r.tfrrs_athlete_id),
      event_name: r.event_name,
      mark_raw: r.mark_raw,
      mark_seconds: r.mark_seconds,
      mark_meters: r.mark_meters,
      place: r.place,
      meet_name: r.meet_name,
      meet_id: r.meet_id,
      event_id: r.event_id,
      date: r.date,
      team_id: r.team_id,
      round: r.round
    }))
    .filter(r => r.athlete_id != null);

  let imported = 0;
  let errors = 0;

  for (let i = 0; i < validResults.length; i += 500) {
    const batch = validResults.slice(i, i + 500);
    const { error } = await supabase.from('results').insert(batch);

    if (error) {
      errors += batch.length;
    } else {
      imported += batch.length;
    }

    if ((i + 500) % 5000 === 0) {
      console.log(`  ${imported.toLocaleString()}/${validResults.length.toLocaleString()} imported`);
    }
  }

  console.log('\n========================================');
  console.log('COMPLETE');
  console.log('========================================');
  console.log(`Athletes created: ${athletesCreated}`);
  console.log(`Results imported: ${imported}`);
  console.log(`Errors: ${errors}`);
}

const commit = process.argv.includes('--commit');
importNewAthletes(commit).catch(console.error);
