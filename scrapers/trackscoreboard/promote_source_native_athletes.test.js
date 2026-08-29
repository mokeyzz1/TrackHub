const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPlan,
  normalizeName,
  summarizePlan,
} = require('./promote_source_native_athletes');

const groups = [{
  source: 'trackscoreboard',
  source_athlete_key: 'tiempodellegada|123',
  source_athlete_name: 'Ana Rivera',
  source_gender: 'F',
  target_meet_id: 11948,
  target_team_id: 200,
  source_team_name: 'UPR Ponce',
  source_url: 'https://tiempo.trackscoreboard.com/meets/734',
  observation_ids: [1],
  source_record_keys: ['record-1'],
  inconsistent: [],
}];

const team = { team_id: 200, school_id: 300, official_name: 'P.R.-Ponce', short_name: 'UPR Ponce' };

test('normalizes source-native names consistently', () => {
  assert.equal(normalizeName('José  Rivera Jr.'), 'jose rivera');
});

test('creates only a unique source-native identity with a verified team', () => {
  const [row] = buildPlan(groups, { teams: [team], existingAthletes: [], existingAliases: [] });
  assert.equal(row.action, 'create_and_alias');
  assert.equal(row.athlete.school_id, 300);
  assert.equal(row.athlete.gender, 'F');
});

test('allows a mixed relay identity to use both gender-specific teams at one school', () => {
  const mixedGroup = { ...groups[0], target_team_ids: [200, 201] };
  const mixedTeam = { ...team, team_id: 201, gender: 'M' };
  const [row] = buildPlan([mixedGroup], {
    teams: [team, mixedTeam],
    existingAthletes: [],
    existingAliases: [],
  });
  assert.equal(row.action, 'create_and_alias');
  assert.equal(row.athlete.school_id, 300);
});

test('holds an identity whose source teams resolve to different schools', () => {
  const crossSchoolGroup = { ...groups[0], target_team_ids: [200, 201] };
  const otherSchoolTeam = { ...team, team_id: 201, school_id: 301 };
  const [row] = buildPlan([crossSchoolGroup], {
    teams: [team, otherSchoolTeam],
    existingAthletes: [],
    existingAliases: [],
  });
  assert.equal(row.action, 'hold');
  assert.equal(row.reason, 'canonical_team_school_inconsistent');
});

test('holds a source-native identity when the name already exists anywhere', () => {
  const [row] = buildPlan(groups, {
    teams: [team],
    existingAthletes: [{ athlete_id: 44, full_name: 'Ana Rivera', gender: 'F', school_id: 999 }],
    existingAliases: [],
  });
  assert.equal(row.action, 'hold');
  assert.equal(row.reason, 'same_name_gender_exists');
});

test('holds duplicate source identities in one batch', () => {
  const duplicate = { ...groups[0], source_athlete_key: 'tiempodellegada|124', observation_ids: [2] };
  const plan = buildPlan([...groups, duplicate], { teams: [team], existingAthletes: [], existingAliases: [] });
  assert.deepEqual(summarizePlan(plan), { hold: 2 });
  assert.equal(plan[0].reason, 'same_name_gender_in_batch');
});
