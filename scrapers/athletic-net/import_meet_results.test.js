const test = require('node:test');
const assert = require('node:assert/strict');

const {
  countScrapedObservations,
  resolveExistingAthlete,
  resolveIndividualTeam
} = require('./import_meet_results');

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
