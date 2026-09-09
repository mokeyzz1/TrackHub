const test = require('node:test');
const assert = require('node:assert/strict');

const {
  athleticSourceUrl,
  availableSourceJobs,
  parseArgs,
  sourceCommand,
  syncMeet,
} = require('./sync-dual-source-results');

const meet = {
  meet_id: 42,
  name: 'Dual Source Invitational',
  tfrrs_url: 'https://www.tfrrs.org/results/12345',
  athletic_net_results_url: 'https://www.athletic.net/TrackAndField/meet/67890/results',
  meet_url: 'https://timer.example/results',
};

test('selects every available result provider in deterministic order', () => {
  assert.deepEqual(availableSourceJobs(meet), [
    { source: 'tfrrs', url: meet.tfrrs_url },
    { source: 'athletic_net', url: meet.athletic_net_results_url },
  ]);
  assert.equal(athleticSourceUrl({ meet_url: 'https://tenant.anet.live/meets/55' }), 'https://tenant.anet.live/meets/55');
  assert.equal(athleticSourceUrl({ meet_url: 'https://example.com/meets/55' }), null);
});

test('builds controlled compare commands for both providers', () => {
  const tfrrs = sourceCommand(availableSourceJobs(meet)[0], meet, { commit: true });
  assert.ok(tfrrs.args.includes('--compare'));
  assert.ok(tfrrs.args.includes('--control-plane'));
  assert.ok(tfrrs.args.includes('--commit'));

  const athletic = sourceCommand(availableSourceJobs(meet)[1], meet, { commit: false });
  assert.ok(athletic.args.includes('--control-plane'));
  assert.equal(athletic.args.includes('--commit'), false);
});

test('runs both sources even when the first source reports a failure', async () => {
  const calls = [];
  const result = await syncMeet(meet, {
    commit: true,
    runSource: async job => {
      calls.push(job.source);
      if (job.source === 'tfrrs') throw new Error('source unavailable');
      return { source: job.source, code: 0 };
    },
  });
  assert.deepEqual(calls, ['tfrrs', 'athletic_net']);
  assert.equal(result.outcomes[0].code, 1);
  assert.equal(result.outcomes[1].code, 0);
});

test('validates bounded CLI inputs', () => {
  assert.deepEqual(parseArgs(['--days', '3', '--limit', '5', '--meet', '42', '--commit']), {
    commit: true, days: 3, limit: 5, meetId: 42,
  });
  assert.throws(() => parseArgs(['--days', '0']), /positive whole number/);
});
