const test = require('node:test');
const assert = require('node:assert/strict');

const { ControlledIngestion } = require('./controlled_ingestion');

function fixture() {
  const finished = [];
  const store = {
    env: {}, pool: {}, closed: 0,
    async startRun() { return 'run-1'; },
    async persistObservations() { return { sourceRecords: 0, observations: 0 }; },
    async finishRun(_id, result) { finished.push(result); },
    async close() { this.closed++; },
  };
  const writer = { async commitRun() { return { inserted: 1 }; } };
  return { store, writer, finished, controlled: new ControlledIngestion({ store, writer }) };
}

test('run creation failure closes an owned store without inventing a run status', async () => {
  const f = fixture();
  f.controlled.ownsStore = true;
  const original = new Error('start failed');
  f.store.startRun = async () => { throw original; };
  await assert.rejects(f.controlled.run({ records: [] }), e => e === original);
  assert.equal(f.store.closed, 1);
  assert.deepEqual(f.finished, []);
});

test('failure reporting preserves the original work error when reporting also fails', async () => {
  const f = fixture();
  const original = new Error('staging failed');
  const reporting = new Error('status failed');
  f.store.persistObservations = async () => { throw original; };
  f.store.finishRun = async () => { throw reporting; };
  await assert.rejects(f.controlled.run({ records: [] }), e => {
    assert.deepEqual(e.errors, [original, reporting]);
    assert.equal(e.cause, original);
    return true;
  });
  assert.equal(f.store.closed, 0);
});

for (const commit of [false, true]) {
  test(`completed ${commit ? 'promotion' : 'staging'} is not relabeled failed after status failure`, async () => {
    const f = fixture();
    const reporting = new Error('status failed');
    f.store.finishRun = async (_id, result) => { f.finished.push(result); throw reporting; };
    await assert.rejects(f.controlled.run({ records: [], commit }), e => {
      assert.equal(e.cause, reporting);
      assert.equal(e.runId, 'run-1');
      assert.equal(e.committed, commit);
      return true;
    });
    assert.deepEqual(f.finished.map(r => r.status), ['succeeded']);
  });
}

test('cleanup errors retain a work failure as their cause', async () => {
  const f = fixture();
  f.controlled.ownsStore = true;
  const original = new Error('writer failed');
  const cleanup = new Error('close failed');
  f.writer.commitRun = async () => { throw original; };
  f.store.close = async () => { throw cleanup; };
  await assert.rejects(f.controlled.run({ records: [], commit: true }), e => {
    assert.deepEqual(e.errors, [original, cleanup]);
    return true;
  });
  assert.equal(f.finished[0].status, 'failed');
});

test('dry-run metrics report contract quarantines before public commit', async () => {
  const finished = [];
  const store = {
    env: {},
    pool: {},
    async startRun() { return 'run-1'; },
    async persistObservations(_runId, records) {
      return { sourceRecords: records.length, observations: records.length };
    },
    async finishRun(runId, result) { finished.push({ runId, result }); },
  };
  const writer = { commitRun: async () => { throw new Error('writer must not run in dry-run'); } };
  const controlled = new ControlledIngestion({ store, writer });

  const outcome = await controlled.run({
    source: 'athletic_net',
    parserVersion: 'test',
    records: [
      { observation: { decision: 'quarantine', validation_errors: [{ code: 'missing_athlete' }] } },
      { observation: { decision: 'pending', validation_errors: [] } },
    ],
    commit: false,
  });

  assert.equal(outcome.runId, 'run-1');
  assert.equal(outcome.invalid, 1);
  assert.equal(outcome.quarantined, 1);
  assert.equal(outcome.committed, false);
  assert.equal(finished[0].result.status, 'succeeded');
  assert.equal(finished[0].result.metrics.quarantined, 1);
});
