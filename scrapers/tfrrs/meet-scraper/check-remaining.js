const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../../.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const results = JSON.parse(fs.readFileSync('output/meet-results.json'));

// Normalize school name for matching
function normalizeSchoolName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function check() {
  // Load all teams
  let allTeams = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('teams')
      .select('team_id, gender, school_id, schools(short_name, official_name)')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allTeams = allTeams.concat(data);
    offset += 1000;
  }

  // Build team lookup with normalized names
  const teamByName = new Map();
  for (const team of allTeams) {
    const shortName = team.schools?.short_name;
    const officialName = team.schools?.official_name;

    if (shortName) {
      teamByName.set(shortName.toLowerCase() + '|' + team.gender, team.team_id);
      teamByName.set(normalizeSchoolName(shortName) + '|' + team.gender, team.team_id);
    }
    if (officialName) {
      teamByName.set(officialName.toLowerCase() + '|' + team.gender, team.team_id);
      teamByName.set(normalizeSchoolName(officialName) + '|' + team.gender, team.team_id);
    }
  }

  // Find still unmatched
  const seenAthletes = new Set();
  const stillMissing = {};

  for (const r of results) {
    if (!r.athlete_id || seenAthletes.has(r.athlete_id)) continue;
    seenAthletes.add(r.athlete_id);

    if (!r.school_name) continue;

    const gender = r.team_gender || 'M';
    const exactKey = r.school_name.toLowerCase() + '|' + gender;
    const normKey = normalizeSchoolName(r.school_name) + '|' + gender;
    const teamId = teamByName.get(exactKey) || teamByName.get(normKey);

    if (!teamId) {
      stillMissing[r.school_name] = (stillMissing[r.school_name] || 0) + 1;
    }
  }

  const sorted = Object.entries(stillMissing).sort((a,b) => b[1] - a[1]);
  console.log('Still unmatched schools (' + sorted.length + ' total):\n');
  sorted.forEach(([name, count]) => console.log(count.toString().padStart(4) + '  ' + name));
}

check();
