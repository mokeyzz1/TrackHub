const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPlan, historyKey } = require('./promote_reviewed_directathletics_history_identity');

const decision = {
  source_athlete_key: '49173268',
  source_athlete_name: 'Isaac Eugene',
  source_gender: 'M',
  target_athlete_id: 146908,
  directathletics_profile_id: '8865824',
  expected_school: 'Unattached',
  public_name: 'Isaac Eugene',
  evidence: ['meet', 'profile'],
  history_matches: [
    { meet_id: 3795, event_type_id: 23, mark_raw: '22.39', place: 7, round: 'Finals' },
    { meet_id: 3795, event_type_id: 38, mark_raw: '50.49', place: 7, round: 'Finals' },
  ],
};

const target = {
  athlete_id: 146908,
  full_name: 'Isaac Eugene',
  gender: null,
  school_name: 'Unattached',
  results_count: 7,
};

test('attaches a DirectAthletics identity only with two existing history overlaps', () => {
  const resultMatches = decision.history_matches.map(match => ({ athlete_id: 146908, ...match }));
  const plan = buildPlan([decision], { targets: [target], resultMatches });
  assert.equal(plan[0].action, 'attach_existing_identity');
  assert.equal(plan[0].reason, 'verified_directathletics_history_overlap');
  assert.equal(plan[0].normalize_gender, true);
});

test('holds an existing target without the reviewed history overlaps', () => {
  const plan = buildPlan([decision], {
    targets: [target],
    resultMatches: [{ athlete_id: 146908, ...decision.history_matches[0] }],
  });
  assert.equal(plan[0].action, 'hold');
  assert.equal(plan[0].reason, 'history_overlap_not_found');
});

test('holds a DirectAthletics identity already attached to another athlete', () => {
  const resultMatches = decision.history_matches.map(match => ({ athlete_id: 146908, ...match }));
  const plan = buildPlan([decision], {
    targets: [target],
    resultMatches,
    externalIds: [{ source: 'directathletics', external_key: '8865824', athlete_id: 7, verified: true }],
  });
  assert.equal(plan[0].action, 'hold');
  assert.equal(plan[0].reason, 'existing_external_identity_conflict');
});

test('is idempotent after alias and external identity are active', () => {
  const resultMatches = decision.history_matches.map(match => ({ athlete_id: 146908, ...match }));
  const plan = buildPlan([decision], {
    targets: [target],
    resultMatches,
    aliases: [{ source_athlete_key: '49173268', target_athlete_id: 146908, status: 'active' }],
    externalIds: [{ source: 'directathletics', external_key: '8865824', athlete_id: 146908, verified: true }],
  });
  assert.equal(plan[0].action, 'already_active');
  assert.equal(historyKey({ athlete_id: 146908, ...decision.history_matches[0] }), '146908|3795|23|22.39|7|Finals');
});
