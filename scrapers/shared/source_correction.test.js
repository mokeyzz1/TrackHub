const test = require('node:test');
const assert = require('node:assert/strict');
const { sourceCorrectionFields } = require('./source_correction');
const row = { entity_type: 'individual_result', target_meet_id: 1, target_athlete_id: 2,
  target_team_id: 3, event_type_id: 4, measure: 'time', mark_raw: '10.50', mark_seconds: 10.5,
  place: 1, result_date: '2026-09-01', linked_fact: { meet_id: 1, athlete_id: '2', team_id: 3,
    event_type_id: 4, mark_raw: '10.5', mark_seconds: 10.5, place: 1, date: '2026-09-01' } };
test('linked replay accepts equivalent IDs and numeric mark formatting', () => {
  assert.deepEqual(sourceCorrectionFields(row), []);
  assert.deepEqual(sourceCorrectionFields({ ...row, result_date: null }), []);
  assert.deepEqual(sourceCorrectionFields({ ...row, linked_entity_type: 'relay_leg' }), ['entity_type']);
});
test('changed mark, identity, placing or date requires correction review', () => {
  assert.deepEqual(sourceCorrectionFields({ ...row, mark_seconds: 10.6 }), ['mark']);
  assert.deepEqual(sourceCorrectionFields({ ...row, target_athlete_id: 5, place: 2, result_date: '2026-09-02' }), ['athlete', 'place', 'date']);
});
test('supplied points annotations are not combined into a new score', () => {
  const points = { ...row, measure: 'points', mark_raw: '7499 (+1.0)', mark_seconds: null,
    linked_fact: { ...row.linked_fact, mark_raw: '7499', mark_seconds: null } };
  assert.deepEqual(sourceCorrectionFields(points), []);
  assert.deepEqual(sourceCorrectionFields({ ...points, mark_raw: '7500' }), ['mark']);
});
