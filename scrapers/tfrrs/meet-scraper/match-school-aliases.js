/**
 * Match school name variations to existing schools in database
 * Distinguishes between:
 * - Punctuation variations (same school, create alias)
 * - Different schools with same base name (need to add as new)
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

// Normalize to just alphanumeric + space for comparison
function normalizeForMatch(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')  // Replace punctuation with space
    .replace(/\s+/g, ' ')          // Collapse multiple spaces
    .trim();
}

// Extract state qualifier like (Ill.) or (Minn.) or (N.Y.)
function extractStateQualifier(name) {
  const match = name.match(/\(([A-Za-z.]+)\)$/);
  if (match) {
    return match[1].replace('.', '').toLowerCase();
  }
  return null;
}

// State abbreviation mapping
const STATE_MAP = {
  'ill': 'il', 'minn': 'mn', 'ind': 'in', 'wis': 'wi', 'tex': 'tx',
  'pa': 'pa', 'ny': 'ny', 'mass': 'ma', 'conn': 'ct', 'kan': 'ks',
  'tenn': 'tn', 'mo': 'mo', 'cal': 'ca', 'ore': 'or', 'ga': 'ga',
  'ky': 'ky', 'wv': 'wv', 'va': 'va', 'md': 'md', 'me': 'me',
  'ohio': 'oh', 'neb': 'ne', 'ark': 'ar', 'iowa': 'ia', 'utah': 'ut',
  'sd': 'sd', 'nd': 'nd', 'az': 'az', 'sc': 'sc', 'colo': 'co',
  'mont': 'mt', 'ri': 'ri', 'fla': 'fl', 'okla': 'ok', 'ont': 'on',
};

function normalizeState(state) {
  if (!state) return null;
  const s = state.toLowerCase();
  return STATE_MAP[s] || s;
}

async function matchSchoolAliases() {
  console.log('========================================');
  console.log('MATCHING SCHOOL NAME VARIATIONS');
  console.log('========================================\n');

  // Load results and find unmatched schools
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
  console.log(`Loaded ${allSchools.length} schools from database\n`);

  // Build lookup by normalized name
  const schoolByNormalizedName = new Map();
  for (const school of allSchools) {
    const shortNorm = normalizeForMatch(school.short_name || '');
    const officialNorm = normalizeForMatch(school.official_name || '');

    // Extract any state qualifier from DB school
    const shortState = extractStateQualifier(school.short_name || '');
    const officialState = extractStateQualifier(school.official_name || '');
    const dbState = normalizeState(shortState) || normalizeState(officialState);

    if (shortNorm) {
      if (!schoolByNormalizedName.has(shortNorm)) {
        schoolByNormalizedName.set(shortNorm, []);
      }
      schoolByNormalizedName.get(shortNorm).push({ ...school, state: dbState });
    }
    if (officialNorm && officialNorm !== shortNorm) {
      if (!schoolByNormalizedName.has(officialNorm)) {
        schoolByNormalizedName.set(officialNorm, []);
      }
      schoolByNormalizedName.get(officialNorm).push({ ...school, state: dbState });
    }
  }

  // Load all teams for matching check
  let allTeams = [];
  offset = 0;
  while (true) {
    const { data } = await supabase
      .from('teams')
      .select('team_id, gender, school_id, schools(short_name, official_name)')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allTeams = allTeams.concat(data);
    offset += 1000;
  }

  // Build team lookup
  const teamByName = new Map();
  for (const team of allTeams) {
    const shortName = team.schools?.short_name?.toLowerCase();
    const officialName = team.schools?.official_name?.toLowerCase();
    if (shortName) teamByName.set(shortName + '|' + team.gender, team.team_id);
    if (officialName) teamByName.set(officialName + '|' + team.gender, team.team_id);
  }

  // Find unmatched school names
  const seenAthletes = new Set();
  const unmatchedSchools = new Map(); // school_name -> count

  for (const r of results) {
    if (!r.athlete_id || seenAthletes.has(r.athlete_id)) continue;
    seenAthletes.add(r.athlete_id);
    if (!r.school_name) continue;

    const gender = r.team_gender || 'M';
    const key = r.school_name.toLowerCase() + '|' + gender;

    if (!teamByName.has(key)) {
      unmatchedSchools.set(r.school_name, (unmatchedSchools.get(r.school_name) || 0) + 1);
    }
  }

  console.log(`Found ${unmatchedSchools.size} unmatched school names\n`);

  // Categorize each unmatched school
  const exactAliases = [];      // Punctuation difference only (same school)
  const newSchoolsNeeded = [];  // Different school, needs to be added
  const uncertain = [];         // Need human review

  for (const [unmatchedName, count] of unmatchedSchools) {
    const normalizedUnmatched = normalizeForMatch(unmatchedName);
    const unmatchedState = normalizeState(extractStateQualifier(unmatchedName));

    // Check for exact normalized match
    const candidates = schoolByNormalizedName.get(normalizedUnmatched) || [];

    if (candidates.length === 0) {
      // No match at all - check for base name without state
      const baseNameMatch = unmatchedName.replace(/\s*\([^)]+\)\s*$/, '');
      const baseNormalized = normalizeForMatch(baseNameMatch);
      const baseCandidates = schoolByNormalizedName.get(baseNormalized) || [];

      if (baseCandidates.length > 0 && unmatchedState) {
        // Has state qualifier but base name exists - different branch of same school
        newSchoolsNeeded.push({ name: unmatchedName, count, reason: 'Different location/branch' });
      } else if (baseCandidates.length === 0) {
        // No match even on base name
        newSchoolsNeeded.push({ name: unmatchedName, count, reason: 'No match found' });
      } else {
        uncertain.push({ name: unmatchedName, count, candidates: baseCandidates });
      }
    } else if (candidates.length === 1) {
      // Single exact match - likely punctuation difference
      const candidate = candidates[0];
      if (unmatchedState && candidate.state && unmatchedState !== candidate.state) {
        // State qualifiers don't match - different school
        newSchoolsNeeded.push({
          name: unmatchedName,
          count,
          reason: `State mismatch: ${unmatchedState} vs ${candidate.state}`,
          nearMatch: candidate.short_name
        });
      } else {
        // Good match
        exactAliases.push({
          unmatched: unmatchedName,
          count,
          matchedTo: candidate.short_name || candidate.official_name,
          school_id: candidate.school_id
        });
      }
    } else {
      // Multiple candidates - try to pick best by state
      const stateMatches = candidates.filter(c => c.state === unmatchedState);
      if (stateMatches.length === 1) {
        exactAliases.push({
          unmatched: unmatchedName,
          count,
          matchedTo: stateMatches[0].short_name || stateMatches[0].official_name,
          school_id: stateMatches[0].school_id
        });
      } else if (unmatchedState) {
        // Has state qualifier but no state match among candidates
        newSchoolsNeeded.push({
          name: unmatchedName,
          count,
          reason: 'State not found among candidates',
          candidates: candidates.map(c => c.short_name)
        });
      } else {
        uncertain.push({ name: unmatchedName, count, candidates });
      }
    }
  }

  // Print results
  console.log('=== EXACT ALIASES (punctuation differences) ===');
  console.log('These can be safely added as aliases\n');
  exactAliases.sort((a, b) => b.count - a.count);
  for (const a of exactAliases) {
    console.log(`${a.count.toString().padStart(4)} | "${a.unmatched}" => "${a.matchedTo}"`);
  }

  console.log(`\n=== NEW SCHOOLS NEEDED (${newSchoolsNeeded.length}) ===`);
  console.log('These are different schools that need to be added\n');
  newSchoolsNeeded.sort((a, b) => b.count - a.count);
  for (const s of newSchoolsNeeded) {
    let extra = s.nearMatch ? ` (near: ${s.nearMatch})` : '';
    if (s.candidates) extra = ` (candidates: ${s.candidates.join(', ')})`;
    console.log(`${s.count.toString().padStart(4)} | "${s.name}" - ${s.reason}${extra}`);
  }

  console.log(`\n=== UNCERTAIN (${uncertain.length}) ===`);
  console.log('Need human review\n');
  uncertain.sort((a, b) => b.count - a.count);
  for (const u of uncertain) {
    console.log(`${u.count.toString().padStart(4)} | "${u.name}" - candidates: ${u.candidates.map(c => c.short_name).join(', ')}`);
  }

  // Save results
  const output = { exactAliases, newSchoolsNeeded, uncertain };
  fs.writeFileSync(
    path.join(__dirname, 'output/school-matching-results.json'),
    JSON.stringify(output, null, 2)
  );

  console.log(`\n========================================`);
  console.log(`Summary:`);
  console.log(`  Exact aliases: ${exactAliases.length} (can apply)`);
  console.log(`  New schools needed: ${newSchoolsNeeded.length}`);
  console.log(`  Uncertain: ${uncertain.length}`);
  console.log(`========================================`);
}

matchSchoolAliases().catch(console.error);
