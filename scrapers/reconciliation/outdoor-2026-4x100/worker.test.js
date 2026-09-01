const test = require('node:test');
const assert = require('node:assert/strict');
const { ReconciliationWorker } = require('./worker');

test('combined-event child candidates never call the TFRRS result loader', async () => {
  let sourceCalls = 0;
  const database = {
    getLocalFacts: async () => [],
    getTeamCatalog: async () => { throw new Error('team catalog should not load'); },
  };
  const source = {
    load: async () => {
      sourceCalls++;
      return { snapshot: { status: 'present', event_count: 1 }, facts: [] };
    },
  };
  const worker = new ReconciliationWorker({ database, source, delayMs: 0 });
  const { result } = await worker.auditMeet({
    meet_id: 12908,
    name: 'MIAA Outdoor Championships [Combined Events]',
    tfrrs_url: 'https://www.tfrrs.org/results/96394',
  });
  assert.equal(sourceCalls, 0);
  assert.equal(result.status, 'needs_review');
  assert.equal(result.reason, 'combined_events_parent_not_verified');
});

test('the queue keeps processing after one meet fails', async () => {
  const jobs = [
    { job_id: 1, meet_id: 1, lease_token: 'one' },
    { job_id: 2, meet_id: 2, lease_token: 'two' },
  ];
  const finished = [];
  const failed = [];
  const database = {
    claimJob: async () => jobs.shift() || null,
    getMeet: async meetId => ({ meet_id: meetId, name: `Meet ${meetId}`, tfrrs_url: `https://tfrrs/${meetId}` }),
    getLocalFacts: async () => [],
    getTeamCatalog: async () => ({}),
    finishJob: async (job, result) => finished.push([job.meet_id, result.status]),
    failJob: async (job, error) => failed.push([job.meet_id, error.message]),
  };
  let calls = 0;
  const source = {
    load: async () => {
      calls++;
      if (calls === 1) throw new Error('temporary source failure');
      return { snapshot: { status: 'not_contested', event_count: 0 }, facts: [] };
    },
  };
  const worker = new ReconciliationWorker({ database, source, delayMs: 0 });
  const result = await worker.runQueue({ scope: 'test' });
  assert.deepEqual(result, { processed: 2, statuses: { failed: 1, not_contested: 1 } });
  assert.deepEqual(failed, [[1, 'temporary source failure']]);
  assert.deepEqual(finished, [[2, 'not_contested']]);
});
