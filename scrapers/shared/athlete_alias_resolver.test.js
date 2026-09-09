const test = require('node:test');
const assert = require('node:assert/strict');

const { AthleteAliasResolver } = require('./athlete_alias_resolver');
const { normalizeSourceRow } = require('./source_observation_adapter');

function events() {
  return {
    resolve: () => 1,
    detailsById: () => ({ event_type_id: 1, measure: 'time' })
  };
}

test('resolves only one active exact external athlete alias', () => {
  const resolver = new AthleteAliasResolver([
    {
      athlete_alias_id: 4,
      source: 'tfrrs',
      source_athlete_key: '9020036',
      target_athlete_id: 190997,
      match_method: 'verified_alias',
      status: 'active'
    }
  ]);

  assert.equal(resolver.resolve({ source: 'tfrrs', sourceAthleteKey: '9020036' }).athlete_id, 190997);
  assert.equal(resolver.resolve({ source: 'tfrrs', sourceAthleteKey: '9020037' }), null);
  assert.equal(resolver.resolve({ source: 'athletic_net', sourceAthleteKey: '9020036' }), null);
});

test('uses an athlete alias for a relay leg without changing the public athlete row', () => {
  const resolver = new AthleteAliasResolver([
    {
      athlete_alias_id: 4,
      source: 'tfrrs',
      source_athlete_key: '9020036',
      target_athlete_id: 190997,
      match_method: 'verified_alias',
      status: 'active'
    }
  ]);
  const [parent, leg] = normalizeSourceRow('tfrrs', {
    meet_id: 12387,
    source_meet_key: '96384',
    event_id: 7,
    event_name: '4x100m',
    team_id: 2423,
    source_team_key: 'Concordia_TX',
    team_gender: 'M',
    mark_raw: '44.97',
    mark_seconds: 44.97,
    place: 2,
    is_relay: true,
    relay_athletes: [{ athlete_id: null, tfrrs_athlete_id: '9020036', athlete_name: 'Caleb Prim', leg_order: 1 }]
  }, events(), undefined, { athleteResolver: resolver });

  assert.equal(parent.observation.target_team_id, 2423);
  assert.equal(leg.observation.target_athlete_id, 190997);
  assert.equal(leg.sourceRecord.source_record_key.endsWith(':leg:1'), true);
});

test('prefers a meet-and-team scoped alias for a name-only TFRRS row', () => {
  const resolver = new AthleteAliasResolver([
    {
      athlete_alias_id: 9,
      source: 'tfrrs',
      source_athlete_key: 'tfrrs:meet=tfrrs-42|team=8|gender=M|name=ryan mann',
      target_athlete_id: 183844,
      match_method: 'verified_alias',
      status: 'active'
    }
  ]);
  const [record] = normalizeSourceRow('tfrrs', {
    meet_id: 42,
    source_meet_key: 'tfrrs-42',
    source_team_key: 'San Diego Mesa',
    team_id: 8,
    team_gender: 'M',
    event_id: 7,
    event_name: '200 Meters',
    athlete_name: 'Ryan Mann',
    mark_raw: '22.15',
    mark_seconds: 22.15,
    place: 1,
    date: '2026-08-19'
  }, {
    resolve: () => 1,
    detailsById: () => ({ event_type_id: 1, measure: 'time' })
  }, undefined, { athleteResolver: resolver });

  assert.equal(record.observation.target_athlete_id, 183844);
  assert.equal(record.observation.source_athlete_key, 'Ryan Mann');
});
