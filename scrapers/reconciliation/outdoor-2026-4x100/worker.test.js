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

test('staged candidates are passed to the source without changing the public meet', async () => {
  let claimedOptions;
  let loadedMeet;
  const job = {
    job_id: 3,
    meet_id: 3,
    lease_token: 'three',
    source_candidates: {
      reconciliation: {
        tfrrs_candidate: { url: 'https://www.tfrrs.org/results/3' },
      },
    },
  };
  const database = {
    claimJob: async options => { claimedOptions = options; return claimedOptions.includeStaged ? job : null; },
    getMeetForJob: async queuedJob => ({
      meet_id: queuedJob.meet_id,
      name: 'Staged Meet',
      tfrrs_url: queuedJob.source_candidates.reconciliation.tfrrs_candidate.url,
    }),
    getLocalFacts: async () => [],
    getTeamCatalog: async () => ({}),
    finishJob: async () => {},
  };
  const source = {
    load: async meet => {
      loadedMeet = meet;
      return { snapshot: { status: 'not_contested', event_count: 0 }, facts: [] };
    },
  };
  const worker = new ReconciliationWorker({ database, source, delayMs: 0 });
  const result = await worker.runQueue({ scope: 'test', includeStaged: true, maxJobs: 1 });
  assert.equal(result.processed, 1);
  assert.equal(claimedOptions.includeStaged, true);
  assert.equal(loadedMeet.tfrrs_url, 'https://www.tfrrs.org/results/3');
});

test('recheck mode queues staged candidates once before processing', async () => {
  let queued = 0;
  let claimed = 0;
  const database = {
    queueStagedForRecheck: async () => { queued++; return 1; },
    claimJob: async () => (claimed++ === 0 ? { job_id: 4, meet_id: 4, lease_token: 'four' } : null),
    getMeet: async () => ({ meet_id: 4, name: 'Recheck Meet', tfrrs_url: 'https://tfrrs/4' }),
    getLocalFacts: async () => [],
    getTeamCatalog: async () => ({}),
    finishJob: async () => {},
  };
  const source = { load: async () => ({ snapshot: { status: 'not_contested', event_count: 0 }, facts: [] }) };
  const worker = new ReconciliationWorker({ database, source, delayMs: 0 });
  await worker.runQueue({ scope: 'test', recheckStaged: true, maxJobs: 1 });
  assert.equal(queued, 1);
});

test('needs-review recheck queues finished review jobs once before processing', async () => {
  let queued = 0;
  let force;
  const database = {
    queueNeedsReviewForRecheck: async options => { queued++; force = options.force; return 2; },
    claimJob: async () => null,
  };
  const source = { load: async () => ({ snapshot: { status: 'not_contested', event_count: 0 }, facts: [] }) };
  const worker = new ReconciliationWorker({ database, source, delayMs: 0 });
  await worker.runQueue({ scope: 'test', recheckNeedsReview: true });
  assert.equal(queued, 1);
  assert.equal(force, false);
});

test('force recheck passes an explicit override for a corrected private meet', async () => {
  let force;
  const database = {
    queueNeedsReviewForRecheck: async options => { force = options.force; return 1; },
    claimJob: async () => null,
  };
  const worker = new ReconciliationWorker({ database, source: {}, delayMs: 0 });
  await worker.runQueue({ scope: 'test', recheckNeedsReview: true, forceRecheck: true });
  assert.equal(force, true);
});
