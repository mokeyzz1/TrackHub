/**
 * Add new schools that don't exist in database
 * (Different schools, not just name variations)
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

async function addNewSchools(commit = false) {
  console.log('========================================');
  console.log(commit ? 'ADDING NEW SCHOOLS' : 'DRY RUN');
  console.log('========================================\n');

  // Load results
  const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));

  // Load all schools from database
  let allSchools = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('schools')
      .select('school_id, short_name, official_name')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allSchools = allSchools.concat(data);
    offset += 1000;
  }
  console.log(`Loaded ${allSchools.length} schools from database`);

  // Build normalized lookup
  const existingNormalized = new Set();
  for (const school of allSchools) {
    existingNormalized.add(normalizeSchoolName(school.short_name));
    existingNormalized.add(normalizeSchoolName(school.official_name));
  }

  // Find truly new schools from results
  const seenAthletes = new Set();
  const newSchoolCounts = new Map(); // school_name -> { count, genders }

  for (const r of results) {
    if (!r.athlete_id || seenAthletes.has(r.athlete_id)) continue;
    seenAthletes.add(r.athlete_id);
    if (!r.school_name) continue;

    const normalized = normalizeSchoolName(r.school_name);
    if (!existingNormalized.has(normalized)) {
      if (!newSchoolCounts.has(r.school_name)) {
        newSchoolCounts.set(r.school_name, { count: 0, genders: new Set() });
      }
      const entry = newSchoolCounts.get(r.school_name);
      entry.count++;
      if (r.team_gender) entry.genders.add(r.team_gender);
    }
  }

  console.log(`Found ${newSchoolCounts.size} new schools to add\n`);

  // Sort by count (most athletes first)
  const sorted = [...newSchoolCounts.entries()].sort((a, b) => b[1].count - a[1].count);

  console.log('Schools to add:');
  sorted.slice(0, 20).forEach(([name, info]) => {
    const genders = [...info.genders].join(',') || 'M,F';
    console.log(`  ${info.count.toString().padStart(4)} athletes: ${name} (${genders})`);
  });
  if (sorted.length > 20) {
    console.log(`  ... and ${sorted.length - 20} more`);
  }

  if (!commit) {
    console.log('\n>>> DRY RUN - No changes made <<<');
    console.log('Run with --commit to add schools');
    return;
  }

  // Prepare school records
  const schoolsToAdd = sorted.map(([name, info]) => ({
    official_name: name,
    short_name: name,
    division: 'Other', // Unknown division
    is_active: true
  }));

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

  // Create teams for each school
  console.log('\nCreating teams...');
  const teamsToAdd = [];
  for (const school of newSchools) {
    const info = newSchoolCounts.get(school.short_name);
    const genders = info && info.genders.size > 0 ? [...info.genders] : ['M', 'F'];
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
    .select('team_id');

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
  console.log('\nNow re-run the import to add the new athletes.');
}

const commit = process.argv.includes('--commit');
addNewSchools(commit).catch(console.error);
