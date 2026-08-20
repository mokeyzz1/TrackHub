const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPlan } = require('./promote_reviewed_tfrrs_identity');

const decision = {
  source_athlete_key: '49173264',
  source_athlete_name: 'Lawrence Durski',
  source_gender: 'M',
  target_athlete_id: 181016,
  tfrrs_athlete_id: '8526889',
  tfrrs_profile_slug: 'Buffalo_State/Lawrence_Durski.html',
  expected_school: 'Unattached',
  public_name: 'Lawrence Durski',
  evidence: ['meet', 'profile'],
};

const emptyTarget = {
  athlete_id: 181016,
  full_name: 'Lawrence Durski',
  gender: null,
  tfrrs_athlete_id: null,
  tfrrs_profile_url: null,
  school_name: 'Unattached',
  results_count: 0,
  relay_legs_count: 0,
  prs_count: 0,
  seasons_count: 0,
  live_refs_count: 0,
};

test('promotes only a unique reviewed TFRRS identity for an empty placeholder', () => {
  const [row] = buildPlan([decision], { targets: [emptyTarget] });
  assert.equal(row.action, 'insert_identity');
  assert.equal(row.reason, 'verified_tfrrs_identity');
});

test('holds a target that already contains facts', () => {
  const [row] = buildPlan([decision], { targets: [{ ...emptyTarget, results_count: 1 }] });
  assert.equal(row.action, 'hold');
  assert.equal(row.reason, 'target_row_not_empty');
});

test('holds a TFRRS identity already attached to another athlete', () => {
  const [row] = buildPlan([decision], {
    targets: [emptyTarget],
    tfrrsIdentities: [{ athlete_id: 999, tfrrs_athlete_id: '8526889' }],
  });
  assert.equal(row.action, 'hold');
  assert.equal(row.reason, 'existing_tfrrs_identity_conflict');
});

test('is idempotent once profile and alias are active', () => {
  const [row] = buildPlan([decision], {
    targets: [{ ...emptyTarget, gender: 'M', tfrrs_athlete_id: '8526889', tfrrs_profile_url: 'https://www.tfrrs.org/athletes/8526889/Buffalo_State/Lawrence_Durski.html' }],
    aliases: [{ source_athlete_key: '49173264', target_athlete_id: 181016, status: 'active' }],
  });
  assert.equal(row.action, 'already_active');
  assert.equal(row.reason, 'existing_alias_and_tfrrs_identity');
});
