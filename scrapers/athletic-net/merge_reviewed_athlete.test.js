const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPlan, namesCompatible, resultKey } = require('./merge_reviewed_athlete');

test('builds a reviewed merge plan with explicit duplicate mappings', () => {
  const plan = buildPlan({
    old_athlete_id: 185262,
    target_athlete_id: 100290,
    source_athlete_key: '31347449',
    athletic_net_profile_id: '31347449',
    duplicate_result_mappings: [{ old_result_id: 1, target_result_id: 2 }],
  }, {
    athletes: [
      { athlete_id: 185262, full_name: 'BH Brooklyn Harmon', gender: 'F', athletic_net_url: 'https://www.athletic.net/athlete/31347449/track-and-field' },
      { athlete_id: 100290, full_name: 'Brooklyn Harmon', gender: 'F', athletic_net_url: null },
    ],
    results: [{ result_id: 1, meet_id: 11727, event_type_id: 45, mark_raw: '9.17a', place: 4 }],
    targetResults: [{ result_id: 2, meet_id: 11727, event_type_id: 45, mark_raw: '9.17', place: 4 }],
    profileOwners: [{ athlete_id: 185262, athletic_net_url: 'https://www.athletic.net/athlete/31347449/track-and-field' }],
    sourceLinks: [{ source_record_id: 3510, result_id: 1 }],
    dependentCounts: [{ dependency: 'relay_legs', count: 0 }],
  });
  assert.equal(plan.action, 'merge');
  assert.deepEqual(plan.delete_result_ids, [1]);
  assert.deepEqual(plan.move_result_ids, []);
  assert.deepEqual(plan.duplicate_source_record_ids, [3510]);
});

test('holds a merge when an unhandled dependency exists', () => {
  const plan = buildPlan({
    old_athlete_id: 1, target_athlete_id: 2, source_athlete_key: 'x', athletic_net_profile_id: '9',
    duplicate_result_mappings: [],
  }, {
    athletes: [
      { athlete_id: 1, full_name: 'A Person', gender: 'F', athletic_net_url: 'https://www.athletic.net/athlete/9/track-and-field' },
      { athlete_id: 2, full_name: 'A Person', gender: 'F', athletic_net_url: null },
    ], results: [], targetResults: [],
    profileOwners: [{ athlete_id: 1 }], sourceLinks: [],
    dependentCounts: [{ dependency: 'external_ids', count: 1 }],
  });
  assert.equal(plan.action, 'hold');
  assert.equal(plan.reason, 'old_athlete_has_unhandled_dependencies');
});

test('normalizes merge identity names and marks consistently', () => {
  assert.equal(namesCompatible('BH Brooklyn Harmon', 'Brooklyn Harmon'), true);
  assert.equal(resultKey({ meet_id: 1, event_type_id: 45, mark_raw: '9.17a', place: 4 }), resultKey({ meet_id: 1, event_type_id: 45, mark_raw: '9.17', place: 4 }));
});
