const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlan } = require('./promote_reviewed_directathletics_identity');

const decision = {
  source_athlete_key: '49173315',
  source_athlete_name: 'Brayden Murray',
  source_gender: 'M',
  target_athlete_id: 140989,
  directathletics_profile_id: '9219354',
  expected_school: 'Unattached',
  public_name: 'Brayden Murray',
  evidence: ['meet', 'profile'],
};

const emptyTarget = {
  athlete_id: 140989,
  full_name: 'Brayden Murray',
  gender: null,
  school_name: 'Unattached',
  results_count: 0,
  relay_legs_count: 0,
  prs_count: 0,
  seasons_count: 0,
  live_refs_count: 0,
};

test('promotes only an empty Unattached placeholder', () => {
  const plan = buildPlan([decision], { targets: [emptyTarget] });
  assert.equal(plan[0].action, 'insert_identity');
  assert.equal(plan[0].reason, 'verified_directathletics_identity');
});

test('holds a target that already contains facts', () => {
  const plan = buildPlan([decision], {
    targets: [{ ...emptyTarget, results_count: 1 }],
  });
  assert.equal(plan[0].action, 'hold');
  assert.equal(plan[0].reason, 'target_row_not_empty');
});

test('holds a DirectAthletics identity already attached to another athlete', () => {
  const plan = buildPlan([decision], {
    targets: [emptyTarget],
    externalIds: [{ source: 'directathletics', external_key: '9219354', athlete_id: 999, verified: true }],
  });
  assert.equal(plan[0].action, 'hold');
  assert.equal(plan[0].reason, 'existing_external_identity_conflict');
});

test('is idempotent after alias and verified external identity exist', () => {
  const plan = buildPlan([decision], {
    targets: [{ ...emptyTarget, gender: 'M', results_count: 2 }],
    aliases: [{ source_athlete_key: '49173315', target_athlete_id: 140989, status: 'active' }],
    externalIds: [{ source: 'directathletics', external_key: '9219354', athlete_id: 140989, verified: true }],
  });
  assert.equal(plan[0].action, 'already_active');
  assert.equal(plan[0].reason, 'existing_alias_and_external_identity');
});
