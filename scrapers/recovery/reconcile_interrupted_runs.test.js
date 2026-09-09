const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertAllEligible,
  parseArgs,
  reconcileInterruptedRuns,
  withDerivedIngestDatabaseUrl,
} = require('./reconcile_interrupted_runs');

function id(suffix) {
  return `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
}

function fakeClient({ runRows = [], countRows = [], updateRows = [] } = {}) {
  const queries = [];
  return {
    queries,
    async query(text, values) {
      queries.push({ text, values });
      if (/SELECT run_id, source/.test(text)) return { rows: runRows };
      if (/SELECT r\.run_id/.test(text)) return { rows: countRows };
      if (/UPDATE ingest\.runs/.test(text)) return { rows: updateRows };
      return { rows: [] };
    },
  };
}

test('explicit run IDs and dry-run are required by default', () => {
  assert.throws(() => parseArgs([]), /--run-id is required/);
  assert.throws(() => parseArgs(['--run-id', 'abc']), /must be a UUID/);
  const args = parseArgs(['--run-id', id('1')]);
  assert.equal(args.commit, false);
  assert.equal(args.olderThanHours, 24);
  assert.equal(args.operator, null);
});

test('commit requires an operator and rejects ambiguous flags', () => {
  assert.throws(() => parseArgs(['--run-id', id('1'), '--commit']), /--operator is required/);
  assert.throws(() => parseArgs(['--run-id', id('1'), '--commit', '--dry-run']), /either --dry-run or --commit/);
  assert.equal(parseArgs(['--run-id', id('1'), '--commit', '--operator', 'reviewer']).operator, 'reviewer');
});

test('reconciliation derives the private URL without replacing an explicit URL', () => {
  assert.equal(
    withDerivedIngestDatabaseUrl({ DB_PASSWORD: 'p@ss word' }).INGEST_DATABASE_URL,
    'postgresql://postgres:p%40ss%20word@db.hunbahsnaeeztmzqpnrl.supabase.co:5432/postgres'
  );
  assert.equal(withDerivedIngestDatabaseUrl({ INGEST_DATABASE_URL: 'postgresql://private', DB_PASSWORD: 'new' }).INGEST_DATABASE_URL, 'postgresql://private');
});

test('dry-run reports eligible stale zero-observation runs and rolls back', async () => {
  const runId = id('2');
  const client = fakeClient({
    runRows: [{ run_id: runId, source: 'pt_timing', mode: 'dry_run', status: 'running', started_at: '2026-08-31T17:38:39.988Z', finished_at: null, scope: { meet_id: 12226 }, metrics: { source_observation_count: 189 }, error_message: null }],
    countRows: [{ run_id: runId, observation_count: 0, recovery_queue_reference_count: 0 }],
  });
  const result = await reconcileInterruptedRuns({ connect: async () => ({ ...client, release() {} }) }, parseArgs(['--run-id', runId]));
  assert.equal(result.committed, false);
  assert.equal(result.plan[0].eligible, true);
  assert.equal(result.plan[0].reportedObservationCount, 189);
  assert.match(client.queries[0].text, /BEGIN READ ONLY/);
  assert.equal(client.queries.filter(q => /UPDATE ingest\.runs/.test(q.text)).length, 0);
});

test('dry-run holds runs with observations, queue references, or a young start', async () => {
  const runId = id('3');
  const client = fakeClient({
    runRows: [{ run_id: runId, source: 'pt_timing', mode: 'dry_run', status: 'running', started_at: new Date().toISOString(), finished_at: null, scope: {}, metrics: {}, error_message: null }],
    countRows: [{ run_id: runId, observation_count: 2, recovery_queue_reference_count: 1 }],
  });
  const result = await reconcileInterruptedRuns({ connect: async () => ({ ...client, release() {} }) }, parseArgs(['--run-id', runId]));
  assert.equal(result.plan[0].eligible, false);
  assert.equal(result.plan[0].reason, 'not_older_than_threshold');
});

test('commit refuses any held row before issuing an update', async () => {
  const runId = id('4');
  const client = fakeClient({
    runRows: [{ run_id: runId, source: 'pt_timing', mode: 'dry_run', status: 'succeeded', started_at: '2026-08-31T17:38:39.988Z', finished_at: null, scope: {}, metrics: {}, error_message: null }],
    countRows: [{ run_id: runId, observation_count: 0, recovery_queue_reference_count: 0 }],
  });
  await assert.rejects(
    reconcileInterruptedRuns({ connect: async () => ({ ...client, release() {} }) }, parseArgs(['--run-id', runId, '--commit', '--operator', 'reviewer'])),
    /not eligible.*status_succeeded/
  );
  assert.equal(client.queries.filter(q => /UPDATE ingest\.runs/.test(q.text)).length, 0);
});

test('commit aborts only the locked, eligible run and records reconciliation metadata', async () => {
  const runId = id('5');
  const client = fakeClient({
    runRows: [{ run_id: runId, source: 'pt_timing', mode: 'dry_run', status: 'running', started_at: '2026-08-31T17:38:39.988Z', finished_at: null, scope: { meet_id: 12226 }, metrics: {}, error_message: null }],
    countRows: [{ run_id: runId, observation_count: 0, recovery_queue_reference_count: 0 }],
    updateRows: [{ run_id: runId, status: 'aborted', finished_at: '2026-09-08T12:00:00.000Z' }],
  });
  const result = await reconcileInterruptedRuns({ connect: async () => ({ ...client, release() {} }) }, parseArgs(['--run-id', runId, '--commit', '--operator', 'reviewer']));
  assert.equal(result.committed, true);
  assert.equal(result.plan[0].status, 'aborted');
  assert.match(client.queries[0].text, /^BEGIN$/);
  assert.match(client.queries.find(q => /UPDATE ingest\.runs/.test(q.text)).text, /status = 'aborted'/);
  assert.deepEqual(client.queries.find(q => /UPDATE ingest\.runs/.test(q.text)).values.slice(0, 2), [runId, 'interrupted_run_reconciled:reviewer']);
  assert.match(client.queries.at(-1).text, /COMMIT/);
});

test('all-or-none eligibility guard is explicit', () => {
  assert.doesNotThrow(() => assertAllEligible([{ eligible: true }]));
  assert.throws(() => assertAllEligible([{ runId: id('6'), eligible: false, reason: 'has_staged_observations' }]), /has_staged_observations/);
});
