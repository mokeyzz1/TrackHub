const test = require('node:test');
const assert = require('node:assert/strict');

const {
  countScrapedObservations,
  controlledMeetStatus,
  controlledResolutionOptions,
  eventsForImportMode,
  resolveExistingAthlete,
  resolveIndividualTeam
} = require('./import_meet_results');

test('controlled outcome treats already-linked source rows as imported', () => {
  const status = controlledMeetStatus(12, { inserted: 0, skipped: 12 });
  assert.equal(status.results_status, 'imported');
  assert.equal(status.results_error, null);
  assert.ok(status.results_imported_at);
});

test('controlled outcome keeps quarantined and empty source states honest', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(controlledMeetStatus(8, { inserted: 7, quarantined: 1 })).filter(([key]) => !key.endsWith('_at'))),
    { results_status: 'partial', results_error: 'quarantined_observations=1' }
  );
  const empty = controlledMeetStatus(0, {});
  assert.equal(empty.results_status, 'no_results_at_source');
  assert.equal(empty.results_imported_at, null);
});

test('controlled Athletic.net imports require named teams to resolve', () => {
  const teamResolver = { resolve() {} };
  const athleteResolver = { resolve() {} };
  assert.deepEqual(controlledResolutionOptions(teamResolver, athleteResolver), {
    teamResolver,
    athleteResolver,
    requireNamedTeam: true,
  });
});

test('relay-only mode excludes individual events before athlete lookup', () => {
  const events = [
    { eventCode: '100m', results: [{ athlete_name: 'Runner', is_relay: false }] },
    { eventCode: '4x100m', results: [{ team_name: 'Relay Team', is_relay: true }] },
    { eventCode: 'empty', results: [] },
  ];

  assert.deepEqual(eventsForImportMode(events, true), [events[1]]);
  assert.deepEqual(eventsForImportMode(events, false), events);
});

test('counts published observations independently of new inserts', () => {
  assert.equal(
    countScrapedObservations({
      events: [
        { results: [{ athlete_name: 'Runner', is_relay: false }, { athlete_name: 'Relay', is_relay: true }] },
        { results: [{ athlete_name: 'Another Runner', is_relay: false }] },
      ],
    },
    { relays: 1 }
    ),
    3
  );
});

test('does not count blank or unnamed rows as published observations', () => {
  assert.equal(
    countScrapedObservations({ events: [{ results: [{ athlete_name: '', is_relay: false }, { is_relay: false }] }] }),
    0
  );
});

test('resolves an individual team only with athlete-school and team-name corroboration', () => {
  const teams = new Map([
    ['483|M', { teamId: 953, schoolName: 'Grand Valley State Grand Valley St.' }]
  ]);

  assert.equal(resolveIndividualTeam({
    schoolId: 483,
    scrapedTeam: 'Grand Valley State',
    gender: 'M'
  }, teams), 953);

  assert.equal(resolveIndividualTeam({
    schoolId: 483,
    scrapedTeam: 'Saginaw Valley',
    gender: 'M'
  }, teams), null);
});

test('resolves the one same-school athlete despite older unattached duplicates', () => {
  const byName = new Map([
    ['parker campbell|M', [
      { id: 100259, school_id: 483, school: 'Grand Valley State Grand Valley St.' },
      { id: 185238, school_id: 1835, school: 'Unattached Unattached' },
    ]],
  ]);

  assert.deepEqual(resolveExistingAthlete({
    name: 'Parker Campbell',
    gender: 'M',
    scrapedTeam: 'Grand Valley State Universit',
  }, byName), {
    athleteId: 100259,
    schoolId: 483,
    reason: 'name_school',
  });
});

test('keeps two same-school candidates quarantined', () => {
  const byName = new Map([
    ['nathan riddering|M', [
      { id: 45383, school_id: 483, school: 'Grand Valley State Grand Valley St.' },
      { id: 204853, school_id: 483, school: 'Grand Valley State Grand Valley St.' },
    ]],
  ]);

  assert.equal(resolveExistingAthlete({
    name: 'Nathan Riddering',
    gender: 'M',
    scrapedTeam: 'Grand Valley State',
  }, byName).reason, 'ambiguous_school');
});
