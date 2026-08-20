const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlan, normalizeName, readManifest } = require('./split_reviewed_athlete');

test('split manifest is exact-row and rejects duplicate IDs', () => {
  const manifest = readManifest(require('path').join(__dirname, 'split-identity-decisions.json'));
  assert.equal(manifest.decisions.length, 1);
  assert.equal(new Set(manifest.decisions[0].result_ids).size, 8);
  assert.equal(manifest.decisions[0].relay_athlete_ids[0], 383280);
});

test('buildPlan holds a split when the old external identity changed', () => {
  const decision = {
    source_athlete_key: 'x', source_athlete_name: 'Josiah Adams', source_gender: 'M',
    old_athlete_id: 26355, old_tfrrs_athlete_id: '7980134', old_current_school_id: 1391, old_school_id: 493,
    new_tfrrs_athlete_id: '9288500', new_school_id: 1391, new_team_id: 2749,
    new_season_code: '2025-2026', result_ids: [1], relay_athlete_ids: [], evidence: ['a', 'b'],
  };
  const plan = buildPlan([decision], new Map([[26355, {
    old: { athlete_id: 26355, full_name: 'Josiah Adams', gender: 'M', school_id: 493, tfrrs_athlete_id: 'different' },
    targetRows: [], resultRows: [{ athlete_id: 26355, team_id: 2749 }], relayRows: [], alias: null,
    otherAthleteReferences: [{ count: 0 }],
  }]]));
  assert.equal(plan[0].action, 'hold');
  assert.equal(plan[0].reason, 'old_tfrrs_identity_changed');
});

test('normalizeName collapses source formatting differences', () => {
  assert.equal(normalizeName('  Josiah   Adams '), 'josiah adams');
});
