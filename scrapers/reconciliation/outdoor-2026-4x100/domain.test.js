const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TeamCatalog,
  buildRepairActions,
  classifyMeet,
  normalizeSourceFact,
  reconcileMeet,
} = require('./domain');

function local(overrides = {}) {
  return {
    relay_result_id: 1,
    team_id: 10,
    canonical_team_id: 10,
    school_id: 100,
    canonical_school_id: 100,
    official_name: 'Example State',
    gender: 'M',
    mark_raw: '40.00',
    mark_seconds: 40,
    place: 1,
    round: 'Finals',
    relay_athletes: [],
    ...overrides,
  };
}

function source(overrides = {}) {
  return {
    source_meet_key: '999',
    event_id: '1001',
    source_url: 'https://www.tfrrs.org/results/999/1001',
    team_gender: 'M',
    school_name: 'Example State',
    source_team_key: 'Example_State',
    mark_raw: '40.00',
    mark_seconds: 40,
    place: 1,
    round: 'Finals',
    relay_athletes: [],
    ...overrides,
  };
}

const catalog = new TeamCatalog({
  teams: [{
    team_id: 10,
    gender: 'M',
    official_name: 'Example State',
    short_name: 'Example St.',
    tfrrs_team_url: 'https://www.tfrrs.org/teams/tf/KS_college_m_Example_State.html',
  }],
});

test('classifies championship combined-event children without classifying standalone multis as parents', () => {
  assert.equal(classifyMeet({ name: 'MIAA Outdoor Championships [Combined Events]' }).kind,
    'combined_child_candidate');
  assert.equal(classifyMeet({ name: 'GNAC Outdoor Championships Combined Events' }).kind,
    'combined_child_candidate');
  assert.equal(classifyMeet({ name: 'Dutch Spring Multi' }).kind, 'multi_only');
  assert.equal(classifyMeet({ name: 'OEC Championships Prelims' }).kind, 'preliminary');
  assert.equal(classifyMeet({ name: 'MIAA Outdoor Championships' }).kind, 'canonical');
});

test('treats a source-verified absent event as not contested, not missing data', () => {
  const result = reconcileMeet({
    meet: { meet_id: 12206, name: 'ALTIS Spring Tune-Up' },
    relationship: classifyMeet({ name: 'ALTIS Spring Tune-Up' }),
    sourceSnapshot: { status: 'not_contested', event_count: 0 },
    sourceFacts: [],
    localFacts: [],
  });
  assert.equal(result.status, 'not_contested');
  assert.equal(result.missing_result_count, 0);
});

test('preserves and matches DNS as a legitimate result', () => {
  const sourceFact = normalizeSourceFact(source({ mark_raw: 'DNS', mark_seconds: null, place: null }), 1, catalog);
  const result = reconcileMeet({
    meet: { meet_id: 1, name: 'Status Meet' },
    sourceSnapshot: { status: 'present', event_count: 1 },
    sourceFacts: [sourceFact],
    localFacts: [local({ mark_raw: 'DNS', mark_seconds: null, place: null })],
  });
  assert.equal(result.status, 'matched');
  assert.equal(result.matched_result_count, 1);
  assert.equal(result.missing_result_count, 0);
});

test('finds a timed source result missing beside an existing status result', () => {
  const status = normalizeSourceFact(source({ mark_raw: 'DNF', mark_seconds: null, place: null }), 1, catalog);
  const timed = normalizeSourceFact(source({
    source_team_key: 'Second_State', school_name: 'Second State', mark_raw: '41.00', mark_seconds: 41, place: 1,
  }), 2, new TeamCatalog({ teams: [
    { team_id: 10, gender: 'M', official_name: 'Example State' },
    { team_id: 11, gender: 'M', official_name: 'Second State' },
  ] }));
  const result = reconcileMeet({
    meet: { meet_id: 2, name: 'Partial Meet' },
    sourceSnapshot: { status: 'present', event_count: 1 },
    sourceFacts: [status, timed],
    localFacts: [local({ mark_raw: 'DNF', mark_seconds: null, place: null })],
  });
  assert.equal(result.status, 'repair_ready');
  assert.equal(result.matched_result_count, 1);
  assert.equal(result.missing_result_count, 1);
});

test('MIAA-shaped corruption cannot be counted as complete', () => {
  const teams = [];
  const sourceRows = [
    ['Pittsburg St.', 101, 'M', '39.61', 1],
    ['Missouri Southern', 102, 'M', '40.09', 2],
    ['Emporia St.', 103, 'M', '40.40', 3],
    ['Central Missouri', 104, 'M', '40.56', 4],
    ['Fort Hays St.', 105, 'M', '40.87', 5],
    ['Nebraska-Kearney', 106, 'M', '41.59', 6],
    ['NW Missouri', 107, 'M', '42.62', 7],
    ['Washburn', 108, 'M', 'DNF', null],
    ['Central Missouri', 204, 'F', '44.74', 1],
    ['NW Missouri', 207, 'F', '44.90', 2],
    ['Pittsburg St.', 201, 'F', '45.27', 3],
    ['Washburn', 208, 'F', '45.76', 4],
    ['Emporia St.', 203, 'F', '46.16', 5],
    ['Fort Hays St.', 205, 'F', '46.67', 6],
    ['Nebraska-Kearney', 206, 'F', '49.34', null],
  ];
  for (const [name, id, gender] of sourceRows) teams.push({ team_id: id, gender, official_name: name });
  const miaaCatalog = new TeamCatalog({ teams });
  const sourceFacts = sourceRows.map(([name, id, gender, mark, place], index) => normalizeSourceFact(source({
    school_name: name,
    source_team_key: name,
    team_gender: gender,
    mark_raw: mark,
    mark_seconds: /\d/.test(mark) ? Number(mark) : null,
    place,
  }), index + 1, miaaCatalog));
  const localFacts = [
    local({ relay_result_id: 1, team_id: null, canonical_team_id: null, school_id: null, canonical_school_id: null, mark_raw: '39.88', mark_seconds: 39.88 }),
    local({ relay_result_id: 2, team_id: null, canonical_team_id: null, school_id: null, canonical_school_id: null, mark_raw: '40.83', mark_seconds: 40.83 }),
    local({ relay_result_id: 3, team_id: null, canonical_team_id: null, school_id: null, canonical_school_id: null, mark_raw: '40.86', mark_seconds: 40.86 }),
    local({ relay_result_id: 4, team_id: null, canonical_team_id: null, school_id: null, canonical_school_id: null, mark_raw: '46.88', mark_seconds: 46.88 }),
    local({ relay_result_id: 5, team_id: null, canonical_team_id: null, school_id: null, canonical_school_id: null, mark_raw: '48.04', mark_seconds: 48.04 }),
    local({ relay_result_id: 6, team_id: 108, canonical_team_id: 108, school_id: 1080, canonical_school_id: 1080, official_name: 'Washburn', mark_raw: 'DNF', mark_seconds: null, place: null }),
  ];
  const result = reconcileMeet({
    meet: { meet_id: 12810, name: 'MIAA Outdoor Championships' },
    sourceSnapshot: { status: 'present', event_count: 1 },
    sourceFacts,
    localFacts,
  });
  assert.equal(result.status, 'repair_ready');
  assert.equal(result.matched_result_count, 1);
  assert.equal(result.missing_result_count, 14);
  assert.equal(result.invalid_team_result_count, 5);
  const actions = buildRepairActions(result);
  assert.equal(actions.filter(action => action.action_type === 'insert_missing').length, 14);
  assert.equal(actions.filter(action => action.action_type === 'manual_review').length, 5);
});
