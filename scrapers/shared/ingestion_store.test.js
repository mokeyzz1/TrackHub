const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_QUERY_TIMEOUT_MS,
  IngestionStore,
  connectionStringFromEnv,
  queryTimeoutFromEnv,
} = require('./ingestion_store');
const { CanonicalFactWriter } = require('./canonical_fact_writer');

function record(key, source = 'tfrrs') {
  const identity = { source, source_record_key: key };
  return { sourceRecord: { ...identity }, observation: { ...identity } };
}

test('rejects duplicates across SQL chunk boundaries before connecting', async () => {
  const store = new IngestionStore({ pool: {
    connect() { assert.fail('invalid input must not open a transaction'); }
  } });
  const rows = Array.from({ length: 500 }, (_, i) => record(String(i)));
  rows.push(record('0'));
  await assert.rejects(store.persistObservations('run', rows), /duplicate source record/);
});

test('rejects mismatched observation provenance before connecting', async () => {
  const store = new IngestionStore({ pool: {
    connect() { assert.fail('invalid input must not open a transaction'); }
  } });
  for (const field of ['source', 'source_record_key']) {
    const row = record('7');
    row.observation[field] = 'different';
    await assert.rejects(store.persistObservations('run', [row]), /identity mismatch/);
  }
});

test('keeps same local ID from different providers and commits both observations', async () => {
  const calls = [];
  let released = false;
  const store = new IngestionStore({ pool: { async connect() {
    return { async query(sql, params) { calls.push({ sql, params }); return { rowCount: params ? JSON.parse(params[0]).length : 0 }; },
      release() { released = true; } };
  } } });
  assert.deepEqual(await store.persistObservations('run', [record('7'), record('7', 'athletic_net')]),
    { sourceRecords: 2, observations: 2 });
  assert.equal(calls[0].sql, 'BEGIN');
  assert.equal(calls.at(-1).sql, 'COMMIT');
  assert.equal(JSON.parse(calls[2].params[0]).length, 2);
  assert.equal(released, true);
});

test('a failed observation write rolls back source records and releases the connection', async () => {
  const calls = [];
  let released = false;
  const store = new IngestionStore({ pool: { async connect() {
    return { async query(sql) {
      calls.push(sql);
      if (sql.includes('INSERT INTO ingest.observations')) throw new Error('write failed');
    }, release() { released = true; } };
  } } });
  await assert.rejects(store.persistObservations('run', [record('7')]), /write failed/);
  assert.equal(calls.at(-1), 'ROLLBACK');
  assert.equal(calls.includes('COMMIT'), false);
  assert.equal(released, true);
});

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
