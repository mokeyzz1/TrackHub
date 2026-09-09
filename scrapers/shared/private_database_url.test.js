const test = require('node:test');
const assert = require('node:assert/strict');

const { ensureIngestDatabaseUrl } = require('./private_database_url');

test('derives the private database URL from DB_PASSWORD and encodes credentials', () => {
  const env = { DB_PASSWORD: 'p@ss word' };
  assert.equal(
    ensureIngestDatabaseUrl(env),
    'postgresql://postgres:p%40ss%20word@db.hunbahsnaeeztmzqpnrl.supabase.co:5432/postgres'
  );
  assert.equal(env.INGEST_DATABASE_URL, ensureIngestDatabaseUrl(env));
});

test('preserves an explicit private database URL', () => {
  const env = { DB_PASSWORD: 'ignored', INGEST_DATABASE_URL: 'postgresql://private' };
  assert.equal(ensureIngestDatabaseUrl(env), 'postgresql://private');
  assert.equal(env.INGEST_DATABASE_URL, 'postgresql://private');
});

test('uses explicit connection overrides when deriving the URL', () => {
  assert.equal(
    ensureIngestDatabaseUrl({
      DB_PASSWORD: 'secret',
      INGEST_DATABASE_HOST: 'db.example.test',
      INGEST_DATABASE_PORT: '6543',
      INGEST_DATABASE_NAME: 'trackhub',
      INGEST_DATABASE_USER: 'ingest',
    }),
    'postgresql://ingest:secret@db.example.test:6543/trackhub'
  );
});
