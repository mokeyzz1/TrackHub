/**
 * Add missing schools (community colleges, junior colleges) to database
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const {
  buildExistingSchoolIndex,
  classifySchoolCandidate,
  assertLegacySchoolCreationDisabled
} = require('./school-creation-guard');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RESULTS_FILE = path.join(__dirname, 'output/meet-results.json');

async function loadAllSchools() {
  const schools = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('schools')
      .select('school_id, official_name, short_name, state, division')
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    schools.push(...data);
  }
  return schools;
}

async function addMissingSchools(commit = false) {
  console.log('========================================');
  console.log(commit ? 'BLOCKED LEGACY SCHOOL CREATION' : 'SCHOOL IDENTITY REVIEW');
  console.log('========================================\n');
  assertLegacySchoolCreationDisabled(commit);

  // Load results and find missing schools
  const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));

  const seenAthletes = new Set();
  const sourceCandidates = new Map(); // school_name -> source evidence

  for (const r of results) {
    if (r.athlete_id && !seenAthletes.has(r.athlete_id)) {
      seenAthletes.add(r.athlete_id);
      if (r.school_name && r.team_state === null) {
        if (!sourceCandidates.has(r.school_name)) {
          sourceCandidates.set(r.school_name, {
            school_name: r.school_name,
            team_state: r.team_state,
            team_slug: r.team_slug || null,
            count: 0,
            genders: new Set()
          });
        }
        const entry = sourceCandidates.get(r.school_name);
        entry.count++;
        if (r.team_gender) entry.genders.add(r.team_gender);
      }
    }
  }

  const existingSchools = await loadAllSchools();
  const existingIndex = buildExistingSchoolIndex(existingSchools);
  const reviews = [...sourceCandidates.values()].map(candidate => ({
    candidate,
    review: classifySchoolCandidate(candidate, existingIndex)
  }));

  console.log(`Found ${reviews.length} source rows requiring identity review\n`);
  for (const { candidate, review } of reviews.slice(0, 30)) {
    const matches = review.existingMatches
      .map(s => `${s.school_id}:${s.official_name} (${s.state || '?'}/${s.division || '?'})`)
      .join(' | ');
    console.log(`  ${review.status}: ${candidate.school_name}${matches ? ` -> ${matches}` : ''}`);
  }
  if (reviews.length > 30) console.log(`  ... and ${reviews.length - 30} more`);

  if (!commit) {
    console.log('\n>>> REVIEW ONLY - No changes made <<<');
    console.log('Automatic school creation is intentionally disabled.');
    return;
  }
}

const commit = process.argv.includes('--commit');
addMissingSchools(commit).catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
