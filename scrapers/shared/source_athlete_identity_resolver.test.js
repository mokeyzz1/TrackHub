const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SourceAthleteIdentityResolver,
  queryIdentityRows
} = require('./source_athlete_identity_resolver');

test('a reviewed secondary source ID resolves to the canonical athlete instead of the legacy profile row', () => {
  const resolver = new SourceAthleteIdentityResolver([
    { source_athlete_key: '9261451', athlete_id: 203305, school_id: 1453, identity_method: 'direct_profile' },
    { source_athlete_key: '9261451', athlete_id: 32807, school_id: 1453, identity_method: 'verified_alias' },
    { source_athlete_key: '9261451', athlete_id: 32807, school_id: 1453, identity_method: 'verified_external_id' },
  ]);

  assert.deepEqual(resolver.resolve('9261451'), {
    athlete_id: 32807,
    school_id: 1453,
    identity_method: 'reviewed_identity'
  });
  assert.equal(resolver.toAthleteIdMap(['9261451']).get('9261451'), 32807);
});

test('a resolved secondary ID is absent from the importer creation set', () => {
  const resolver = new SourceAthleteIdentityResolver([
    { source_athlete_key: '30057910', athlete_id: 75313, school_id: 1556, identity_method: 'verified_external_id' }
  ]);
  const requested = ['30057910', 'new-profile'];
  const lookup = resolver.toAthleteIdMap(requested);
  const needsCreation = requested.filter(sourceKey => !lookup.has(sourceKey));

  assert.deepEqual(needsCreation, ['new-profile']);
});

test('conflicting reviewed mappings fail closed even when a direct profile exists', () => {
  const resolver = new SourceAthleteIdentityResolver([
    { source_athlete_key: '9020036', athlete_id: 10, identity_method: 'direct_profile' },
    { source_athlete_key: '9020036', athlete_id: 20, identity_method: 'verified_alias' },
    { source_athlete_key: '9020036', athlete_id: 30, identity_method: 'verified_external_id' },
  ]);

  assert.equal(resolver.resolve('9020036'), null);
  assert.equal(resolver.hasConflict('9020036'), true);
  assert.equal(resolver.inspect('not-present').status, 'missing');
  assert.equal(resolver.toAthleteIdMap(['9020036']).has('9020036'), false);
});

test('database lookup reads aliases, verified external IDs, and the source-specific direct column', async () => {
  const calls = [];
  const pool = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [] };
    }
  };

  await queryIdentityRows(pool, 'athletic_net', ['30057910', '30057910']);
  assert.deepEqual(calls[0].values, ['athletic_net', ['30057910']]);
  assert.match(calls[0].sql, /ingest\.athlete_aliases/);
  assert.match(calls[0].sql, /public\.external_ids/);
  assert.match(calls[0].sql, /athletic_net_url/);
  assert.match(calls[0].sql, /x\.verified IS TRUE/);
});
