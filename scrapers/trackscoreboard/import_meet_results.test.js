const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractRelayRows,
  parseSourceUrl,
  sourceEventName,
  toRows,
} = require('./import_meet_results');

test('normalizes TrackScoreboard event phrases without collapsing mixed relays', () => {
  assert.equal(sourceEventName("Women's 4x100 Relay"), '4 x 100 Relay');
  assert.equal(sourceEventName("Men's 4x110 Shuttle Hurdle Relay"), '4x110 Shuttle Hurdles');
  assert.equal(sourceEventName('Mixed 4x400 Relay'), 'Mixed 4x400m Relay');
  assert.equal(sourceEventName('Womens 1600 Mixto Corto'), '1600m Mixto Corto');
  assert.equal(sourceEventName('Mens 4000 Mixto Largo'), '4000m Mixto Largo');
});

test('normalizes accent differences without weakening exact identity matching', () => {
  const { normalizeName } = require('./import_meet_results');
  assert.equal(normalizeName('José Rodríguez'), 'jose rodriguez');
  assert.equal(normalizeName('Jose Rodriguez'), 'jose rodriguez');
});

test('extracts each nested relay result once', () => {
  const rows = extractRelayRows({
    results: [
      {
        id: 10,
        teamName: 'UPR MAYAGUEZ',
        teamsAbbr: 'UPRM',
        mark: '46.78',
        place: 1,
        athletes: [{ id: 1, fname: 'A', lname: 'Runner' }],
      },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].teamName, 'UPR MAYAGUEZ');
});

test('accepts only canonical TrackScoreboard meet URLs', () => {
  assert.deepEqual(parseSourceUrl('https://tiempo.trackscoreboard.com/meets/734'), {
    url: 'https://tiempo.trackscoreboard.com/meets/734',
    host: 'tiempo.trackscoreboard.com',
    sourceMeetId: 734,
  });
  assert.throws(
    () => parseSourceUrl('https://example.com/meets/734'),
    /unsupported TrackScoreboard URL/
  );
});

test('allows only an explicit 4x100 event scope', () => {
  const { parseArgs } = require('./import_meet_results');
  assert.equal(parseArgs(['--meet', '12417', '--control-plane', '--event-code', '4x100m']).eventCode, '4x100m');
  assert.throws(
    () => parseArgs(['--meet', '12417', '--control-plane', '--event-code', '4x400m']),
    /supports only 4x100m/
  );
});

test('normalizes verified TrackScoreboard compact status codes', () => {
  const { trackScoreboardMark } = require('./import_meet_results');
  assert.equal(trackScoreboardMark({ status: 'D' }), 'DNF');
  assert.equal(trackScoreboardMark({ status: 'Q', note: 'Zone Violation' }), 'DQ');
  assert.equal(trackScoreboardMark({ status: 'S' }), 'SCR');
  assert.equal(trackScoreboardMark({ mark: '41.51', status: '' }), '41.51');
});

test('prefers a verified private athlete alias over exact public-name lookup', () => {
  const result = toRows({
    sourceMeetId: 734,
    sourceUrl: 'https://tiempo.trackscoreboard.com/meets/734',
    tenant: 'tiempodellegada',
    meet: { meet_id: 11948, name: 'LAI', date: '2026-03-07' },
    events: [{ id: 1, name: '4x100 Relay', gender: 'M' }],
    eventPayloads: new Map([[1, {
      results: [{
        id: 10,
        teamName: 'UPR Ponce',
        teamsAbbr: 'UPRP',
        mark: '40.00',
        place: 1,
        athletes: [{ id: 99, fname: 'Ana', lname: 'Rivera', gender: 'F', athlete_position: 1 }],
      }],
    }]]),
    teamAliases: {
      resolve: () => ({ team_id: 200 }),
    },
    athleteAliases: {
      resolve: () => ({ athlete_id: 44, school_id: 300 }),
    },
    athleteByKey: new Map(),
    teamSchools: new Map([[200, 300]]),
  });
  assert.equal(result.athleteMatched, 1);
  assert.equal(result.rows[0].relay_athletes[0].athlete_id, 44);
});

test('allows a verified alias to preserve an explicit Unattached public affiliation', () => {
  const result = toRows({
    sourceMeetId: 734,
    sourceUrl: 'https://tiempo.trackscoreboard.com/meets/734',
    tenant: 'tiempodellegada',
    meet: { meet_id: 11948, name: 'LAI', date: '2026-03-07' },
    events: [{ id: 1, name: '4x100 Relay', gender: 'M' }],
    eventPayloads: new Map([[1, {
      results: [{
        id: 10,
        teamName: 'UPR Ponce',
        teamsAbbr: 'UPRP',
        mark: '40.00',
        place: 1,
        athletes: [{ id: 99, fname: 'Ana', lname: 'Rivera', gender: 'F', athlete_position: 1 }],
      }],
    }]]),
    teamAliases: {
      resolve: () => ({ team_id: 200 }),
    },
    athleteAliases: {
      resolve: () => ({ athlete_id: 44, school_id: 1835 }),
    },
    athleteByKey: new Map(),
    teamSchools: new Map([[200, 300]]),
  });
  assert.equal(result.athleteMatched, 1);
  assert.equal(result.rows[0].relay_athletes[0].athlete_id, 44);
});

test('infers a team only from two or more matched legs at one canonical school', () => {
  const result = toRows({
    sourceMeetId: 476,
    sourceUrl: 'https://lancer.trackscoreboard.com/meets/476/events',
    tenant: 'lancer',
    meet: { meet_id: 12417, name: 'Ed Daniels Classic', date: '2026-04-11' },
    events: [{ id: 35, name: '4x100 Relay', gender: 'M' }],
    eventPayloads: new Map([[35, {
      results: [{
        id: 10,
        teamName: 'Example College',
        teamsAbbr: 'EXAM',
        mark: '40.00',
        place: 1,
        athletes: [
          { id: 1, fname: 'First', lname: 'Runner', gender: 'M', athlete_position: 1 },
          { id: 2, fname: 'Second', lname: 'Runner', gender: 'M', athlete_position: 2 },
        ],
      }],
    }]]),
    teamAliases: { resolve: () => null },
    athleteAliases: { resolve: () => null },
    athleteByKey: new Map([
      ['first runner|M', [{ athlete_id: 11, school_id: 300 }]],
      ['second runner|M', [{ athlete_id: 12, school_id: 300 }]],
    ]),
    teamSchools: new Map(),
    teamBySchoolGender: new Map([['300|M', 200]]),
  });
  assert.equal(result.teamMatched, 1);
  assert.equal(result.rows[0].team_id, 200);
});

test('does not infer a team from mixed-school relay legs', () => {
  const result = toRows({
    sourceMeetId: 476,
    sourceUrl: 'https://lancer.trackscoreboard.com/meets/476/events',
    tenant: 'lancer',
    meet: { meet_id: 12417, name: 'Ed Daniels Classic', date: '2026-04-11' },
    events: [{ id: 35, name: '4x100 Relay', gender: 'M' }],
    eventPayloads: new Map([[35, {
      results: [{
        id: 10,
        teamName: 'Ambiguous Club',
        teamsAbbr: 'AMB',
        mark: '40.00',
        place: 1,
        athletes: [
          { id: 1, fname: 'First', lname: 'Runner', gender: 'M', athlete_position: 1 },
          { id: 2, fname: 'Second', lname: 'Runner', gender: 'M', athlete_position: 2 },
        ],
      }],
    }]]),
    teamAliases: { resolve: () => null },
    athleteAliases: { resolve: () => null },
    athleteByKey: new Map([
      ['first runner|M', [{ athlete_id: 11, school_id: 300 }]],
      ['second runner|M', [{ athlete_id: 12, school_id: 301 }]],
    ]),
    teamSchools: new Map(),
    teamBySchoolGender: new Map([['300|M', 200], ['301|M', 201]]),
  });
  assert.equal(result.teamMatched, 0);
  assert.equal(result.rows[0].team_id, null);
});

test('retries unresolved athletes against a safely inferred relay school', () => {
  const result = toRows({
    sourceMeetId: 476,
    sourceUrl: 'https://lancer.trackscoreboard.com/meets/476/events',
    tenant: 'lancer',
    meet: { meet_id: 12417, name: 'Ed Daniels Classic', date: '2026-04-11' },
    events: [{ id: 35, name: '4x100 Relay', gender: 'F' }],
    eventPayloads: new Map([[35, {
      results: [{
        id: 10,
        teamName: 'Example College',
        teamsAbbr: 'EXAM',
        mark: '48.00',
        place: 1,
        athletes: [
          { id: 1, fname: 'First', lname: 'Runner', gender: 'F', athlete_position: 1 },
          { id: 2, fname: 'Second', lname: 'Runner', gender: 'F', athlete_position: 2 },
          { id: 3, fname: 'Shared', lname: 'Name', gender: 'F', athlete_position: 3 },
        ],
      }],
    }]]),
    teamAliases: { resolve: () => null },
    athleteAliases: { resolve: () => null },
    athleteByKey: new Map([
      ['first runner|F', [{ athlete_id: 11, school_id: 300 }]],
      ['second runner|F', [{ athlete_id: 12, school_id: 300 }]],
      ['shared name|F', [
        { athlete_id: 13, school_id: 300 },
        { athlete_id: 14, school_id: 301 },
      ]],
    ]),
    teamSchools: new Map(),
    teamBySchoolGender: new Map([['300|F', 201]]),
  });
  assert.equal(result.rows[0].team_id, 201);
  assert.equal(result.rows[0].relay_athletes[2].athlete_id, 13);
  assert.equal(result.athleteMatched, 3);
});

test('uses unique participation in the exact meet to resolve duplicate athlete rows', () => {
  const { chooseAthlete } = require('./import_meet_results');
  const chosen = chooseAthlete({
    alias: null,
    schoolId: 300,
    candidates: [
      { athlete_id: 21, school_id: 300, meet_participant: true },
      { athlete_id: 22, school_id: 300, meet_participant: false },
    ],
  });
  assert.equal(chosen.athlete_id, 21);
  assert.equal(chooseAthlete({
    alias: null,
    schoolId: 300,
    candidates: [
      { athlete_id: 21, school_id: 300, meet_participant: false },
      { athlete_id: 22, school_id: 300, meet_participant: false },
    ],
  }), null);
});
