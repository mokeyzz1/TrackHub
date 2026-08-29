const test = require('node:test');
const assert = require('node:assert/strict');

const {
  connectionString,
  parseArgs,
  resolveSupersededQuarantines,
  resolveSupersededOpenQuarantines,
  scopeMeetIds,
  syncRecoveryQueueAfterPromotion,
  validateReview,
  withDerivedIngestDatabaseUrl,
} = require('./promote_ingest_run');

test('derives the private database URL from the root password when needed', () => {
  const env = withDerivedIngestDatabaseUrl({ DB_PASSWORD: 'p@ss word' });
  assert.equal(
    env.INGEST_DATABASE_URL,
    'postgresql://postgres:p%40ss%20word@db.hunbahsnaeeztmzqpnrl.supabase.co:5432/postgres'
  );
});

test('promotion requires an explicit run and commit flag', () => {
  assert.throws(() => parseArgs([]), /--run-id is required/);
  assert.throws(() => parseArgs(['--run-id', 'abc']), /pass --commit/);
  assert.deepEqual(parseArgs(['--run-id', 'abc', '--commit']), {
    runId: 'abc',
    allowQuarantines: false,
    allowMultiMeet: false,
    statementTimeoutMs: 600000,
  });
  assert.throws(
    () => parseArgs(['--run-id', 'abc', '--commit', '--statement-timeout-ms', '999999999']),
    /statement-timeout-ms must be an integer/
  );
});

test('promotion extracts one or more meet IDs from importer scopes', () => {
  assert.deepEqual(scopeMeetIds({ meet_id: 13051 }), [13051]);
  assert.deepEqual(scopeMeetIds({ meet_ids: [13051, '13051', 13052] }), [13051, 13052]);
});

test('promotion accepts only a successful single-meet dry run by default', () => {
  const review = {
    run: { mode: 'dry_run', status: 'succeeded', source: 'tfrrs', scope: { meet_ids: [13051] } },
    decisions: { pending: 230 },
  };
  assert.deepEqual(validateReview(review, { allowQuarantines: false, allowMultiMeet: false }), { meetIds: [13051] });
  assert.throws(
    () => validateReview({ ...review, run: { ...review.run, status: 'failed' } }, { allowQuarantines: false, allowMultiMeet: false }),
    /succeeded dry_run/
  );
});

test('promotion rejects quarantines unless explicitly allowed', () => {
  const review = {
    run: { mode: 'dry_run', status: 'succeeded', source: 'athletic_net', scope: { meet_id: 1 } },
    decisions: { pending: 4, quarantine: 1 },
  };
  assert.throws(() => validateReview(review, { allowQuarantines: false, allowMultiMeet: false }), /quarantined observations/);
  assert.deepEqual(validateReview(review, { allowQuarantines: true, allowMultiMeet: false }), { meetIds: [1] });
});

test('explicit quarantine-only promotion is allowed for review-only runs', () => {
  const review = {
    run: { mode: 'dry_run', status: 'succeeded', source: 'athletic_net', scope: { meet_id: 12061 } },
    decisions: { quarantine: 5 },
  };
  assert.throws(
    () => validateReview(review, { allowQuarantines: false, allowMultiMeet: false }),
    /no pending observations/
  );
  assert.deepEqual(
    validateReview(review, { allowQuarantines: true, allowMultiMeet: false }),
    { meetIds: [12061] }
  );
});

test('controlled promotion requires the private database URL', () => {
  assert.equal(connectionString({ DATABASE_URL: 'postgresql://local' }), null);
});

test('queue promotion sync preserves open quarantines and checks relay coverage', async () => {
  const queries = [];
  const pool = {
    async query(text, values) {
      queries.push({ text, values });
      return { rows: [{ queue_id: 1959, status: 'partial', quarantined_observation_count: 1 }] };
    },
  };

  const rows = await syncRecoveryQueueAfterPromotion(pool, 'run-1', [13096]);
  assert.equal(rows.length, 1);
  assert.match(queries[0].text, /individual_facts/);
  assert.match(queries[0].text, /relay_facts/);
  assert.match(queries[0].text, /open_quarantines/);
  assert.match(queries[0].text, /needs_relays/);
  assert.deepEqual(queries[0].values, ['run-1', [13096]]);
});

test('promotion resolves only older open quarantines superseded by a linked source record', async () => {
  const queries = [];
  const pool = {
    async query(text, values) {
      queries.push({ text, values });
      return { rows: [{ resolved_count: 12 }] };
    },
  };

  assert.equal(await resolveSupersededQuarantines(pool, 'run-2'), 12);
  assert.match(queries[0].text, /current_links/);
  assert.match(queries[0].text, /old\.run_id <> \$1/);
  assert.match(queries[0].text, /old\.decision = 'quarantine'/);
  assert.deepEqual(queries[0].values, ['run-2']);
});

test('promotion resolves older duplicate open reviews for the same source record', async () => {
  const queries = [];
  const pool = {
    async query(text, values) {
      queries.push({ text, values });
      return { rows: [{ resolved_count: 7 }] };
    },
  };

  assert.equal(await resolveSupersededOpenQuarantines(pool, 'run-3'), 7);
  assert.match(queries[0].text, /current_open/);
  assert.match(queries[0].text, /old\.run_id <> \$1/);
  assert.match(queries[0].text, /q\.status = 'open'/);
  assert.deepEqual(queries[0].values, ['run-3']);
});
