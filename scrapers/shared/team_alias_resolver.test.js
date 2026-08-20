const test = require('node:test');
const assert = require('node:assert/strict');

const { TeamAliasResolver, normalizeTeamAlias } = require('./team_alias_resolver');
const { normalizeSourceRow } = require('./source_observation_adapter');

function events() {
  return {
    resolve: () => 1,
    detailsById: () => ({ event_type_id: 1, measure: 'time' })
  };
}

test('normalizes source key punctuation consistently', () => {
  assert.equal(normalizeTeamAlias('Concordia_TX'), 'concordia tx');
  assert.equal(normalizeTeamAlias('Concordia (Tex.)'), 'concordia tex');
});

test('resolves only the exact source and gender mapping', () => {
  const resolver = new TeamAliasResolver([
    {
      team_alias_id: 10,
      source: 'tfrrs',
      source_team_key: 'Concordia_TX',
      source_team_name: 'Concordia (Tex.)',
      source_gender: 'M',
      team_id: 2423,
      match_method: 'verified_alias',
      status: 'active'
    }
  ]);

  assert.equal(resolver.resolve({
    source: 'tfrrs', sourceTeamKey: 'Concordia_TX', sourceTeamName: 'Concordia (Tex.)', sourceGender: 'M'
  }).team_id, 2423);
  assert.equal(resolver.resolve({
    source: 'tfrrs', sourceTeamKey: 'Concordia_TX', sourceTeamName: 'Concordia (Tex.)', sourceGender: 'F'
  }), null);
  assert.equal(resolver.resolve({
    source: 'athletic_net', sourceTeamKey: 'Concordia_TX', sourceTeamName: 'Concordia (Tex.)', sourceGender: 'M'
  }), null);
});

test('uses a verified alias only when the row has no team id', () => {
  const resolver = new TeamAliasResolver([
    {
      team_alias_id: 10,
      source: 'tfrrs',
      source_team_key: 'Concordia_TX',
      source_team_name: 'Concordia (Tex.)',
      source_gender: 'M',
      team_id: 2423,
      match_method: 'verified_alias',
      status: 'active'
    }
  ]);
  const [row] = normalizeSourceRow('tfrrs', {
    meet_id: 12387,
    source_meet_key: '12387',
    event_id: 7,
    event_name: '4x100m',
    source_team_key: 'Concordia_TX',
    school_name: 'Concordia (Tex.)',
    team_gender: 'M',
    mark_raw: '42.10',
    mark_seconds: 42.1,
    place: 2,
    is_relay: true,
    relay_athletes: []
  }, events(), undefined, { teamResolver: resolver });

  assert.equal(row.observation.target_team_id, 2423);
  assert.equal(row.observation.decision, 'pending');
  assert.equal(row.sourceRecord.payload.ingestion_team_resolution.team_alias_id, 10);
});

test('does not override an explicit scraper team id', () => {
  const resolver = new TeamAliasResolver([
    {
      team_alias_id: 10,
      source: 'tfrrs',
      source_team_key: 'Concordia_TX',
      source_team_name: 'Concordia (Tex.)',
      source_gender: 'M',
      team_id: 2423,
      match_method: 'verified_alias',
      status: 'active'
    }
  ]);
  const [row] = normalizeSourceRow('tfrrs', {
    meet_id: 12387,
    source_meet_key: '12387',
    event_id: 7,
    event_name: '4x100m',
    team_id: 999,
    source_team_key: 'Concordia_TX',
    school_name: 'Concordia (Tex.)',
    team_gender: 'M',
    mark_raw: '42.10',
    mark_seconds: 42.1,
    place: 2,
    is_relay: true,
    relay_athletes: []
  }, events(), undefined, { teamResolver: resolver });

  assert.equal(row.observation.target_team_id, 999);
  assert.equal(row.sourceRecord.payload.ingestion_team_resolution, undefined);
});
