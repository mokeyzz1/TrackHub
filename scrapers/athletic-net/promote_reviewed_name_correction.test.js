const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlan } = require('./promote_reviewed_name_correction');

test('exact TFRRS identity permits a guarded spelling correction', () => {
  const plan = buildPlan([{
    source_athlete_key: '49173263', source_athlete_name: 'Aaron Dickhart', source_gender: 'M',
    target_athlete_id: 75313, target_tfrrs_athlete_id: '9250900', expected_current_name: 'Aaron Dickart',
    expected_school_id: 1556, expected_athletic_net_profile_id: '30057910', evidence: ['a', 'b'],
  }], {
    targets: [{ athlete_id: 75313, full_name: 'Aaron Dickart', gender: 'M', school_id: 1556, tfrrs_athlete_id: '9250900', athletic_net_url: 'https://www.athletic.net/athlete/30057910/track-and-field' }],
    aliases: [],
  });
  assert.equal(plan[0].action, 'correct_name_and_alias');
});

test('name correction refuses an unexpected current spelling', () => {
  const plan = buildPlan([{
    source_athlete_key: 'x', source_athlete_name: 'Aaron Dickhart', source_gender: 'M',
    target_athlete_id: 75313, target_tfrrs_athlete_id: '9250900', expected_current_name: 'Wrong Name',
    expected_school_id: 1556, evidence: ['a', 'b'],
  }], {
    targets: [{ athlete_id: 75313, full_name: 'Aaron Dickart', gender: 'M', school_id: 1556, tfrrs_athlete_id: '9250900' }],
    aliases: [],
  });
  assert.equal(plan[0].action, 'hold');
  assert.equal(plan[0].reason, 'current_name_guard_failed');
});

test('name correction is idempotent after alias and spelling are applied', () => {
  const plan = buildPlan([{
    source_athlete_key: '49173263', source_athlete_name: 'Aaron Dickhart', source_gender: 'M',
    target_athlete_id: 75313, target_tfrrs_athlete_id: '9250900', expected_current_name: 'Aaron Dickart',
    expected_school_id: 1556, evidence: ['a', 'b'],
  }], {
    targets: [{ athlete_id: 75313, full_name: 'Aaron Dickhart', gender: 'M', school_id: 1556, tfrrs_athlete_id: '9250900' }],
    aliases: [{ source_athlete_key: '49173263', target_athlete_id: 75313, status: 'active' }],
  });
  assert.equal(plan[0].action, 'already_active');
  assert.equal(plan[0].reason, 'existing_alias_and_corrected_name');
});
