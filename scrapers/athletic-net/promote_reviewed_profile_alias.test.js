const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlan } = require('./promote_reviewed_profile_alias');

test('exact profile match can normalize an empty display-prefix row', () => {
  const plan = buildPlan([{
    source_athlete_key: '49173402', source_athlete_name: 'Christopher Kocher', source_gender: 'M',
    target_athlete_id: 195965, athletic_net_profile_id: '19401430', evidence: ['a', 'b'],
  }], {
    targets: [{ athlete_id: 195965, full_name: 'CK Christopher Kocher', gender: 'M', athletic_net_url: 'https://www.athletic.net/athlete/19401430/track-and-field', results_count: 0, relay_legs_count: 0, prs_count: 0, seasons_count: 0, live_refs_count: 0 }],
    aliases: [],
  });
  assert.equal(plan[0].action, 'insert_alias');
  assert.equal(plan[0].normalize_public_name, true);
});

test('profile alias refuses a non-empty target row', () => {
  const plan = buildPlan([{
    source_athlete_key: 'x', source_athlete_name: 'Christopher Kocher', source_gender: 'M',
    target_athlete_id: 195965, athletic_net_profile_id: '19401430', evidence: ['a', 'b'],
  }], {
    targets: [{ athlete_id: 195965, full_name: 'Christopher Kocher', gender: 'M', athletic_net_url: 'https://www.athletic.net/athlete/19401430/track-and-field', results_count: 1, relay_legs_count: 0, prs_count: 0, seasons_count: 0, live_refs_count: 0 }],
    aliases: [],
  });
  assert.equal(plan[0].action, 'hold');
  assert.equal(plan[0].reason, 'target_row_not_empty');
});

test('profile alias is idempotent after alias and name normalization', () => {
  const plan = buildPlan([{
    source_athlete_key: '49173402', source_athlete_name: 'Christopher Kocher', source_gender: 'M',
    target_athlete_id: 195965, athletic_net_profile_id: '19401430', evidence: ['a', 'b'],
  }], {
    targets: [{ athlete_id: 195965, full_name: 'Christopher Kocher', gender: 'M', athletic_net_url: 'https://www.athletic.net/athlete/19401430/track-and-field', results_count: 2, relay_legs_count: 0, prs_count: 0, seasons_count: 0, live_refs_count: 0 }],
    aliases: [{ source_athlete_key: '49173402', target_athlete_id: 195965, status: 'active' }],
  });
  assert.equal(plan[0].action, 'already_active');
  assert.equal(plan[0].reason, 'existing_alias_and_normalized_name');
});
