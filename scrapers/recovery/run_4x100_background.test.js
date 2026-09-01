const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SourceRateLimiter,
  build4x100ImporterCommand,
  claimJob,
  cleanAudit,
  filterSourceCandidates,
  fullySuccessfulPromotion,
  isCleanNoResultError,
  noSourceError,
  parseArgs,
  partiallySuccessfulPromotion,
  promotableAudit,
  refreshQueue,
  sourceReturnedNo4x100,
  sourceUrlForJob,
} = require('./run_4x100_background');

test('background worker defaults to a full historical, single-worker drain', () => {
  const args = parseArgs(['--scope', 'all-4x100', '--from', '2000-01-01', '--to', '2026-08-28']);
  assert.equal(args.scope, 'all-4x100');
  assert.equal(args.from, '2000-01-01');
  assert.equal(args.to, '2026-08-28');
  assert.equal(args.season, null);
  assert.equal(args.source, 'auto');
  assert.equal(args.meetId, null);
  assert.equal(args.concurrency, 1);
  assert.equal(args.autoPromote, false);
  assert.equal(args.maxJobs, 0);
  assert.equal(args.skipRefresh, false);
  assert.equal(args.inProcess, true);
});

test('background worker supports a source- and meet-scoped drain', () => {
  const args = parseArgs([
    '--scope', 'smoke', '--from', '2026-03-07', '--to', '2026-03-07',
    '--source', 'milesplit', '--meet', '11929', '--auto-promote',
  ]);
  assert.equal(args.source, 'milesplit');
  assert.equal(args.meetId, 11929);
  assert.equal(args.autoPromote, true);
});

test('background worker can drain an already prepared queue without refreshing the full scope', () => {
  const args = parseArgs(['--scope', 'prepared', '--skip-refresh', '--source', 'tfrrs']);
  assert.equal(args.skipRefresh, true);
  assert.equal(args.source, 'tfrrs');
});

test('primary source policy uses only TFRRS and Athletic.net', () => {
  const args = parseArgs(['--scope', 'primary', '--source', 'primary']);
  assert.equal(args.source, 'primary');
  assert.deepEqual(filterSourceCandidates({
    source_candidates: {
      tfrrs_url: 'https://www.tfrrs.org/results/12345',
      athletic_net_results_url: 'https://www.athletic.net/TrackAndField/meet/634818/results',
      pt_timing_url: 'https://results.example.com/meet/1',
    },
  }, 'primary'), [
    { source: 'tfrrs', url: 'https://www.tfrrs.org/results/12345' },
    { source: 'athletic_net', url: 'https://www.athletic.net/TrackAndField/meet/634818/results' },
  ]);
});

test('background worker can discover sources for a season before recovery', () => {
  const args = parseArgs([
    '--scope', 'outdoor-2026-4x100', '--season', 'Outdoor 2026',
    '--from', '2026-04-01', '--to', '2026-06-27',
    '--discover-sources', '--discover-only',
  ]);
  assert.equal(args.season, 'Outdoor 2026');
  assert.equal(args.discoverSources, true);
  assert.equal(args.discoverOnly, true);
  assert.equal(args.blockedOnly, false);
  assert.equal(parseArgs(['--scope', 'discovery', '--blocked-only']).blockedOnly, true);
});

test('passes the requested season into the queue refresh boundary', async () => {
  const calls = [];
  const pool = {
    query: async (...args) => {
      calls.push(args);
      return { rows: [{ rows_upserted: 7 }] };
    },
  };
  const rows = await refreshQueue(pool, {
    scope: 'outdoor-2026-4x100',
    from: '2026-04-01',
    to: '2026-06-27',
    season: 'Outdoor 2026',
  });
  assert.equal(rows, 7);
  assert.deepEqual(calls[0][1], ['outdoor-2026-4x100', '2026-04-01', '2026-06-27', 'Outdoor 2026']);
});

test('passes the retry limit into the database claim boundary', async () => {
  const calls = [];
  const pool = {
    query: async (...args) => {
      calls.push(args);
      return { rows: [] };
    },
  };
  const job = await claimJob(pool, {
    scope: 'outdoor-2026-4x100',
    leaseMinutes: 60,
    retryFailed: true,
    source: 'auto',
    meetId: null,
    maxAttempts: 2,
  });
  assert.equal(job, null);
  assert.deepEqual(calls[0][1], ['outdoor-2026-4x100', 60, true, null, null, 2]);
  assert.match(calls[0][0], /claim_4x100_recovery_job\(\$1, \$2, \$3, \$4, \$5, \$6\)/);
});

test('primary source policy uses an unrestricted database claim then filters sources locally', async () => {
  const calls = [];
  const pool = {
    query: async (...args) => {
      calls.push(args);
      return { rows: [] };
    },
  };
  await claimJob(pool, {
    scope: 'primary',
    leaseMinutes: 60,
    retryFailed: false,
    source: 'primary',
    meetId: null,
    maxAttempts: 2,
  });
  assert.equal(calls[0][1][3], null);
});

test('background worker never selects TrackScoreboard', () => {
  const sources = filterSourceCandidates({
    source_candidates: {
      trackscoreboard_url: 'https://lancer.trackscoreboard.com/meets/476/events',
      athletic_net_results_url: 'https://www.athletic.net/TrackAndField/meet/634818/results',
    },
  });
  assert.deepEqual(sources, [{
    source: 'athletic_net',
    url: 'https://www.athletic.net/TrackAndField/meet/634818/results',
  }]);
});

test('background worker routes a supported meet_url when the source-specific field is absent', () => {
  const job = {
    source_candidates: {
      meet_url: 'https://results.blacksquirreltiming.com/meets/65497',
    },
  };
  assert.equal(sourceUrlForJob(job, 'athletic_net'), 'https://results.blacksquirreltiming.com/meets/65497');
  assert.deepEqual(filterSourceCandidates(job), [{
    source: 'athletic_net',
    url: 'https://results.blacksquirreltiming.com/meets/65497',
  }]);
});

test('background worker routes Blue Ridge through the existing AthleticLIVE adapter', () => {
  const job = {
    source_candidates: {
      meet_url: 'https://blueridgetiming.live/meets/66890',
    },
  };
  assert.deepEqual(filterSourceCandidates(job), [{
    source: 'athletic_net',
    url: 'https://blueridgetiming.live/meets/66890',
  }]);
});

test('background worker preserves policy-excluded providers as explicit flags', () => {
  const job = {
    source_candidates: { meet_url: 'https://milesplit.live/meets/722808' },
  };
  assert.equal(sourceUrlForJob(job, 'milesplit'), 'https://milesplit.live/meets/722808');
  assert.equal(noSourceError(job), 'no verified recovery source URL');
  assert.equal(noSourceError({ source_candidates: {
    meet_url: 'https://finishedresults.trackscoreboard.com/meets/13452/events',
  } }), 'policy_excluded:trackscoreboard');
});

test('clean empty source responses are not classified as importer failures', () => {
  assert.equal(isCleanNoResultError('source_returned_no_observations'), true);
  assert.equal(isCleanNoResultError('source_no_results_published'), true);
  assert.equal(isCleanNoResultError('source_not_found'), true);
  assert.equal(isCleanNoResultError('importer_exit_1: timeout'), false);
});

test('background importer command is scoped to 4x100 and relay-only mode', () => {
  const tfrrs = build4x100ImporterCommand(
    { meet_id: 13048 },
    { source: 'tfrrs', url: 'https://www.tfrrs.org/results/96496' }
  );
  assert.deepEqual(tfrrs.args, [
    '--meet', '13048', '--scrape', '--control-plane', '--relays-only', '--event-code', '4x100m',
    '--source-url', 'https://www.tfrrs.org/results/96496',
  ]);

  const athleticNet = build4x100ImporterCommand(
    { meet_id: 13048 },
    { source: 'athletic_net', url: 'https://www.athletic.net/TrackAndField/meet/634818/results' }
  );
  assert.deepEqual(athleticNet.args, [
    '13048', '--control-plane', '--source-url',
    'https://www.athletic.net/TrackAndField/meet/634818/results',
    '--relays-only', '--event-code', '4x100m',
  ]);

  const mileSplit = build4x100ImporterCommand(
    { meet_id: 13048 },
    { source: 'milesplit', url: 'https://milesplit.live/meets/732193' }
  );
  assert.deepEqual(mileSplit.args, [
    '--provider', 'milesplit', '--meet', '13048', '--source-url',
    'https://milesplit.live/meets/732193', '--control-plane', '--relays-only', '--event-code', '4x100m',
  ]);
});

test('only a single-meet, 4x100-only clean run is eligible for automatic promotion', () => {
  assert.equal(cleanAudit({
    target_meet_count: 1,
    target_meet_id: 13048,
    non_target_event_rows: 0,
    unmapped_parent_rows: 0,
    quarantined_rows: 0,
    pending_rows: 10,
    parent_rows: 3,
    numeric_parent_rows: 3,
  }, 13048), true);
  assert.equal(cleanAudit({
    target_meet_count: 1,
    target_meet_id: 13049,
    non_target_event_rows: 0,
    pending_rows: 10,
    parent_rows: 3,
    numeric_parent_rows: 3,
  }, 13048), false);
  assert.equal(sourceReturnedNo4x100({ parent_rows: 4, numeric_parent_rows: 0 }), true);
  assert.equal(sourceReturnedNo4x100({ parent_rows: 4, numeric_parent_rows: 4 }), false);
  assert.equal(promotableAudit({
    target_meet_count: 1,
    target_meet_id: 13048,
    non_target_event_rows: 0,
    unmapped_parent_rows: 0,
    quarantined_rows: 2,
    pending_rows: 10,
    parent_rows: 3,
    numeric_parent_rows: 3,
  }, 13048), true);
});

test('partial promotion results stay in review instead of completing the queue job', () => {
  assert.equal(fullySuccessfulPromotion({
    status: 'succeeded',
    stats: { errors: 0, quarantined: 0, relayParents: 3 },
  }), true);
  assert.equal(fullySuccessfulPromotion({
    status: 'succeeded',
    stats: { errors: 0, quarantined: 0, relayParents: 0 },
  }), false);
  assert.equal(partiallySuccessfulPromotion({
    status: 'partial',
    stats: { errors: 0, quarantined: 2, relayParents: 3 },
  }), true);
  assert.equal(partiallySuccessfulPromotion({
    status: 'partial',
    stats: { errors: 0, quarantined: 2, relayParents: 0 },
  }), false);
  assert.equal(fullySuccessfulPromotion({ status: 'partial', stats: { errors: 0, quarantined: 1 } }), false);
  assert.equal(fullySuccessfulPromotion({ status: 'succeeded', stats: { errors: 1, quarantined: 0 } }), false);
});

test('rate limiter serializes requests to the same source', async () => {
  const limiter = new SourceRateLimiter(0);
  let active = 0;
  let peak = 0;
  const seen = [];
  await Promise.all([
    limiter.run('tfrrs', async () => {
      active++;
      peak = Math.max(peak, active);
      seen.push('first');
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
    }),
    limiter.run('tfrrs', async () => {
      active++;
      peak = Math.max(peak, active);
      seen.push('second');
      active--;
    }),
  ]);
  assert.equal(peak, 1);
  assert.deepEqual(seen, ['first', 'second']);
});
