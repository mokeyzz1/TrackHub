/**
 * Add missing schools (community colleges, junior colleges) to database
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

async function addMissingSchools(commit = false) {
  console.log('========================================');
  console.log(commit ? 'ADDING MISSING SCHOOLS' : 'DRY RUN');
  console.log('========================================\n');

  // Load results and find missing schools
  const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));

  const seenAthletes = new Set();
  const missingSchools = new Map(); // school_name -> { count, genders }

  for (const r of results) {
    if (r.athlete_id && !seenAthletes.has(r.athlete_id)) {
      seenAthletes.add(r.athlete_id);
      if (r.school_name && r.team_state === null) {
        if (!missingSchools.has(r.school_name)) {
          missingSchools.set(r.school_name, { count: 0, genders: new Set() });
        }
        const entry = missingSchools.get(r.school_name);
        entry.count++;
        if (r.team_gender) entry.genders.add(r.team_gender);
      }
    }
  }

  console.log(`Found ${missingSchools.size} missing schools\n`);

  // Prepare school records
  const schoolsToAdd = [];
  for (const [name, info] of missingSchools) {
    schoolsToAdd.push({
      official_name: name,
      short_name: name,
      division: 'NJCAA', // Most are community colleges
      is_active: true
    });
  }

  console.log('Schools to add:');
  schoolsToAdd.slice(0, 10).forEach(s => console.log(`  ${s.short_name}`));
  if (schoolsToAdd.length > 10) console.log(`  ... and ${schoolsToAdd.length - 10} more`);

  if (!commit) {
    console.log('\n>>> DRY RUN - No changes made <<<');
    console.log('Run with --commit to add schools');
    return;
  }

  // Insert schools
  console.log('\nCreating schools...');
  const { data: newSchools, error: schoolError } = await supabase
    .from('schools')
    .insert(schoolsToAdd)
    .select('school_id, short_name');

  if (schoolError) {
    console.error('Error creating schools:', schoolError.message);
    return;
  }

  console.log(`Created ${newSchools.length} schools`);

  // Create teams for each school (M and F)
  console.log('\nCreating teams...');
  const teamsToAdd = [];
  for (const school of newSchools) {
    const info = missingSchools.get(school.short_name);
    // Create both genders if we have athletes, otherwise just the ones we know about
    const genders = info.genders.size > 0 ? [...info.genders] : ['M', 'F'];
    for (const gender of genders) {
      teamsToAdd.push({
        school_id: school.school_id,
        gender: gender,
        is_active: true
      });
    }
  }

  const { data: newTeams, error: teamError } = await supabase
    .from('teams')
    .insert(teamsToAdd)
    .select('team_id, school_id, gender');

  if (teamError) {
    console.error('Error creating teams:', teamError.message);
    return;
  }

  console.log(`Created ${newTeams.length} teams`);

  console.log('\n========================================');
  console.log('COMPLETE');
  console.log('========================================');
  console.log(`Schools added: ${newSchools.length}`);
  console.log(`Teams added: ${newTeams.length}`);
  console.log('\nNow re-run the import to add the missing athletes.');
}

const commit = process.argv.includes('--commit');
addMissingSchools(commit).catch(console.error);
