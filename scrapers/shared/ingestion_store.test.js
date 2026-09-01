const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_QUERY_TIMEOUT_MS,
  IngestionStore,
  connectionStringFromEnv,
  queryTimeoutFromEnv,
} = require('./ingestion_store');
const { CanonicalFactWriter } = require('./canonical_fact_writer');

test('controlled ingestion requires an explicit private database URL', () => {
  assert.equal(connectionStringFromEnv({ DATABASE_URL: 'postgresql://localhost/dev' }), null);
  assert.equal(connectionStringFromEnv({ SUPABASE_DB_URL: 'postgresql://other/dev' }), null);
  assert.equal(
    connectionStringFromEnv({ INGEST_DATABASE_URL: 'postgresql://private/prod' }),
    'postgresql://private/prod'
  );

  assert.throws(
    () => new IngestionStore({ env: { DATABASE_URL: 'postgresql://localhost/dev' } }),
    /INGEST_DATABASE_URL is required/
  );
  assert.throws(
    () => new CanonicalFactWriter({ env: { SUPABASE_DB_URL: 'postgresql://other/dev' } }),
    /INGEST_DATABASE_URL is required/
  );
});

test('controlled ingestion uses a bounded configurable query timeout', () => {
  assert.equal(queryTimeoutFromEnv({}), DEFAULT_QUERY_TIMEOUT_MS);
  assert.equal(queryTimeoutFromEnv({ INGEST_QUERY_TIMEOUT_MS: '12000' }), 12000);
  assert.equal(queryTimeoutFromEnv({ INGEST_QUERY_TIMEOUT_MS: '0' }), DEFAULT_QUERY_TIMEOUT_MS);
  assert.equal(queryTimeoutFromEnv({ INGEST_QUERY_TIMEOUT_MS: 'not-a-number' }), DEFAULT_QUERY_TIMEOUT_MS);
});
