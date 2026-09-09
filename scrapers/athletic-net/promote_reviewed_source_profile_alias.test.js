const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPlan, namesCompatible } = require('./promote_reviewed_source_profile_alias');

const decision = {
  source_athlete_key: '44333243',
  source_athlete_name: 'Adysen Daman',
  source_gender: 'F',
  target_athlete_id: 194310,
  athletic_net_profile_id: '30056518',
  match_method: 'verified_source_profile',
  evidence: ['source', 'candidate', 'existing profile'],
};

test('allows a verified exact profile alias even when the existing athlete has history', () => {
  const plan = buildPlan([decision], {
    targets: [{
      athlete_id: 194310,
      full_name: 'AD Adysen Daman',
      gender: 'F',
      athletic_net_url: 'https://www.athletic.net/athlete/30056518/track-and-field',
    }],
    profileMatches: [{
      athlete_id: 194310,
      full_name: 'AD Adysen Daman',
      gender: 'F',
      athletic_net_url: 'https://www.athletic.net/athlete/30056518/track-and-field',
    }],
    aliases: [],
  });
  assert.equal(plan[0].action, 'insert_alias');
  assert.equal(plan[0].reason, 'verified_unique_source_profile');
});

test('holds when the profile is owned by another athlete', () => {
  const plan = buildPlan([decision], {
    targets: [{
      athlete_id: 194310,
      full_name: 'AD Adysen Daman',
      gender: 'F',
      athletic_net_url: 'https://www.athletic.net/athlete/30056518/track-and-field',
    }],
    profileMatches: [
      { athlete_id: 194310, athletic_net_url: 'https://www.athletic.net/athlete/30056518/track-and-field' },
      { athlete_id: 200000, athletic_net_url: 'https://www.athletic.net/athlete/30056518/track-and-field' },
    ],
    aliases: [],
  });
  assert.equal(plan[0].action, 'hold');
  assert.equal(plan[0].reason, 'profile_url_not_unique');
});

test('recognizes harmless public display prefixes and parenthetical names', () => {
  assert.equal(namesCompatible('Matthew (Matt) Nowak', 'Matt Nowak'), true);
  assert.equal(namesCompatible('Adysen Daman', 'AD Adysen Daman'), true);
  assert.equal(namesCompatible('Parker Campbell', 'Parker Campbell'), true);
  assert.equal(namesCompatible('Ava Crews', 'Ava Cross'), false);
});
