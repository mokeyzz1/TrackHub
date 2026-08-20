const test = require('node:test');
const assert = require('node:assert/strict');

const { ControlledIngestion } = require('./controlled_ingestion');

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
