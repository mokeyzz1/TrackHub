const test = require('node:test');
const assert = require('node:assert/strict');

const { IngestionStore, connectionStringFromEnv } = require('./ingestion_store');
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
