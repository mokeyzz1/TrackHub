const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlan } = require('./backfill_reviewed_athlete_prs');

test('PR plan inserts only missing verified facts', () => {
  const plan = buildPlan([{
    new_tfrrs_athlete_id: '9288500', new_athlete_id: 206885, new_school_id: 1391,
    source_athlete_name: 'Josiah Adams', verified_prs: [
      { event_name: '200', mark_raw: '22.98', mark_seconds: 22.98, season: 'all' },
      { event_name: '400', mark_raw: '49.27', mark_seconds: 49.27, season: 'all' },
    ],
  }], {
    targets: [{ athlete_id: 206885, full_name: 'Josiah Adams', school_id: 1391, tfrrs_athlete_id: '9288500' }],
    existingPrs: [{ athlete_id: 206885, event_name: '200', mark_raw: '22.98', mark_seconds: 22.98, season: 'all' }],
  });
  assert.equal(plan[0].action, 'insert');
  assert.equal(plan[0].already.length, 1);
  assert.equal(plan[0].inserts.length, 1);
  assert.equal(plan[0].inserts[0].event_name, '400');
});

test('PR plan holds a conflicting existing fact', () => {
  const plan = buildPlan([{
    new_tfrrs_athlete_id: '9288500', new_school_id: 1391, source_athlete_name: 'Josiah Adams',
    verified_prs: [{ event_name: '200', mark_raw: '22.98', mark_seconds: 22.98, season: 'all' }],
  }], {
    targets: [{ athlete_id: 206885, full_name: 'Josiah Adams', school_id: 1391, tfrrs_athlete_id: '9288500' }],
    existingPrs: [{ athlete_id: 206885, event_name: '200', mark_raw: '23.00', mark_seconds: 23, season: 'all' }],
  });
  assert.equal(plan[0].action, 'hold');
  assert.equal(plan[0].reason, 'existing_pr_conflict');
});
