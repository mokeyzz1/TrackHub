/**
 * Add new schools that don't exist in database
 * (Different schools, not just name variations)
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

async function addNewSchools(commit = false) {
  console.log('========================================');
  console.log(commit ? 'BLOCKED LEGACY SCHOOL CREATION' : 'SCHOOL IDENTITY REVIEW');
  console.log('========================================\n');
  assertLegacySchoolCreationDisabled(commit);

  // Load results
  const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));

  // Load all schools from database
  let allSchools = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('schools')
      .select('school_id, short_name, official_name, state, division')
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allSchools = allSchools.concat(data);
    offset += 1000;
  }
  console.log(`Loaded ${allSchools.length} schools from database`);

  const existingIndex = buildExistingSchoolIndex(allSchools);

  // Find truly new schools from results
  const seenAthletes = new Set();
  const reviewCandidates = new Map(); // school_name -> source evidence

  for (const r of results) {
    if (!r.athlete_id || seenAthletes.has(r.athlete_id)) continue;
    seenAthletes.add(r.athlete_id);
    if (!r.school_name) continue;

    if (!reviewCandidates.has(r.school_name)) {
      reviewCandidates.set(r.school_name, {
        school_name: r.school_name,
        team_state: r.team_state || null,
        team_slug: r.team_slug || null,
        count: 0,
        genders: new Set()
      });
    }
    const entry = reviewCandidates.get(r.school_name);
    entry.count++;
    if (r.team_gender) entry.genders.add(r.team_gender);
  }

  const reviews = [...reviewCandidates.values()].map(candidate => ({
    candidate,
    review: classifySchoolCandidate(candidate, existingIndex)
  }));
  const unresolved = reviews.filter(({ review }) => review.status !== 'blocked_existing_candidate');
  const existingCandidates = reviews.filter(({ review }) => review.status === 'blocked_existing_candidate');

  console.log(`Matched ${existingCandidates.length} names to existing-school candidates`);
  console.log(`Found ${unresolved.length} names requiring curated identity review\n`);

  // Sort by count (most athletes first)
  const sorted = unresolved.sort((a, b) => b.candidate.count - a.candidate.count);

  console.log('Review candidates:');
  sorted.slice(0, 20).forEach(({ candidate, review }) => {
    const genders = [...candidate.genders].join(',') || '?';
    console.log(
      `  ${candidate.count.toString().padStart(4)} athletes: ${candidate.school_name} ` +
      `(${genders}) [${review.status}; state=${candidate.team_state || '?'}; slug=${candidate.team_slug || '?'}]`
    );
  });
  if (sorted.length > 20) {
    console.log(`  ... and ${sorted.length - 20} more`);
  }

  if (!commit) {
    console.log('\n>>> REVIEW ONLY - No changes made <<<');
    console.log('Automatic school creation is intentionally disabled.');
    return;
  }
}

const commit = process.argv.includes('--commit');
addNewSchools(commit).catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
