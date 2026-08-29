const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPlan,
  identityFromRow,
  profileFromHref,
} = require('./promote_historical_athlete_aliases');

test('recovers a full athlete name from a shortened historical TFRRS anchor', () => {
  const profile = profileFromHref(
    '/athletes/9018581/San_Diego_Mesa/Ryan_Mann.html',
    'Mann'
  );

  assert.deepEqual(profile, {
    id: '9018581',
    name: 'Ryan Mann',
    profileUrl: 'https://www.tfrrs.org/athletes/9018581/San_Diego_Mesa/Ryan_Mann.html',
  });
});

test('builds a scoped identity key for a relay leg without changing its raw name', () => {
  const identity = identityFromRow({
    entity_type: 'relay_leg',
    target_team_id: 8,
    target_school_id: 22,
    source_meet_key: 'tfrrs-42',
    tfrrs_team_url: 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_San_Diego_Mesa.html',
    payload: {
      team_gender: 'M',
      leg: { athlete_name: 'Ryan Mann' },
    },
  });

  assert.equal(identity.sourceAthleteName, 'Ryan Mann');
  assert.equal(identity.sourceAthleteKey,
    'tfrrs:meet=tfrrs-42|team=8|gender=M|name=ryan mann');
});

test('only promotes an exact profile that points to the same team school', () => {
  const row = {
    entity_type: 'individual_result',
    target_team_id: 8,
    target_school_id: 22,
    source_meet_key: 'tfrrs-42',
    tfrrs_team_url: 'https://www.tfrrs.org/teams/tf/CA_jcollege_m_San_Diego_Mesa.html',
    payload: { team_gender: 'M', athlete_name: 'Ryan Mann' },
  };
  const key = 'M|ca_jcollege_m_san_diego_mesa|ryan mann';
  const profiles = new Map([
    ['9018581', {
      id: '9018581',
      name: 'Ryan Mann',
      profileUrl: 'https://www.tfrrs.org/athletes/9018581/San_Diego_Mesa/Ryan_Mann.html',
    }],
  ]);
  const targets = [{
    athlete_id: 7,
    full_name: 'Ryan Mann',
    gender: 'M',
    school_id: 22,
    tfrrs_athlete_id: '9018581',
  }];

  const [safe] = buildPlan([row], new Map([[key, profiles]]), targets, []);
  assert.equal(safe.action, 'insert');
  assert.equal(safe.reason, 'verified_historical_profile');

  const [held] = buildPlan([row], new Map([[key, profiles]]), [{
    ...targets[0],
    school_id: 99,
  }], []);
  assert.equal(held.action, 'hold');
  assert.equal(held.reason, 'public_school_mismatch');
});
