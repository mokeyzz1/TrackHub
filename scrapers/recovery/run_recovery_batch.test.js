const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildImporterCommand,
  chooseSource,
  connectionString,
  dryRunError,
  extractRunId,
  parseArgs,
  runWithConcurrency,
  selectSupportedRows,
  validCandidate,
} = require('./run_recovery_batch');

test('recovery runner defaults to a bounded dry run', () => {
  assert.deepEqual(parseArgs(['--scope', '2025-26']), {
    scope: '2025-26',
    source: 'auto',
    meetId: null,
    limit: 1,
    timeoutMs: 900000,
    delayMs: 1500,
    staleMinutes: 30,
    concurrency: 2,
    retryAttempted: false,
  });
});

test('recovery runner can explicitly replay attempted rows', () => {
  assert.equal(
    parseArgs(['--scope', '2025-26', '--retry-attempted']).retryAttempted,
    true
  );
});

test('recovery runner accepts zero delay for controlled single-meet checks', () => {
  assert.equal(parseArgs(['--scope', '2025-26', '--delay-ms', '0']).delayMs, 0);
});

test('recovery runner accepts bounded concurrency', () => {
  assert.equal(parseArgs(['--scope', '2025-26', '--concurrency', '3']).concurrency, 3);
  assert.throws(
    () => parseArgs(['--scope', '2025-26', '--concurrency', '0']),
    /--concurrency must be a positive integer/
  );
});

test('recovery runner rejects public-fact commit mode', () => {
  assert.throws(
    () => parseArgs(['--scope', '2025-26', '--commit']),
    /dry-run only/
  );
});

test('source validation accepts only importer-supported URLs', () => {
  assert.equal(validCandidate('tfrrs', 'https://www.tfrrs.org/results/12345/meet.html'), true);
  assert.equal(validCandidate('athletic_net', 'https://www.athletic.net/TrackAndField/meet/634818/results'), true);
  assert.equal(validCandidate('athletic_net', 'https://live.athletic.net/meets/68768'), true);
  assert.equal(validCandidate('athletic_net', 'https://milesplit.live/meets/723064'), false);
  assert.equal(validCandidate('tfrrs', 'https://example.com/results/12345'), false);
});

test('auto selection prefers TFRRS and derives relay-only mode', () => {
  const choice = chooseSource({
    needs_individual: false,
    needs_relays: true,
    source_candidates: {
      tfrrs_url: 'https://www.tfrrs.org/results/12345/meet.html',
      athletic_net_results_url: 'https://www.athletic.net/TrackAndField/meet/634818/results',
    },
  });
  assert.deepEqual(choice, {
    source: 'tfrrs',
    url: 'https://www.tfrrs.org/results/12345/meet.html',
    relaysOnly: true,
  });
});

test('athletic.net command uses the controlled relay-only path when needed', () => {
  const command = buildImporterCommand(
    { meet_id: 11579 },
    { source: 'athletic_net', relaysOnly: true }
  );
  assert.equal(command.command, process.execPath);
  assert.match(command.script, /athletic-net[\\/]import_meet_results\.js$/);
  assert.deepEqual(command.args, ['11579', '--control-plane', '--relays-only']);
});

test('athletic.net command can use a verified alternate AthleticLIVE source URL', () => {
  const command = buildImporterCommand(
    { meet_id: 12759 },
    { source: 'athletic_net', url: 'https://live.athletic.net/meets/68768', relaysOnly: false }
  );
  assert.deepEqual(command.args, [
    '12759',
    '--control-plane',
    '--source-url',
    'https://live.athletic.net/meets/68768',
  ]);
});

test('athletic.net source selection prefers an explicit AthleticLIVE candidate', () => {
  const choice = chooseSource({
    needs_individual: true,
    needs_relays: false,
    source_candidates: {
      athletic_live_url: 'https://live.athletic.net/meets/68768',
      athletic_net_results_url: 'https://www.athletic.net/TrackAndField/meet/658210/results',
    },
  }, 'athletic_net');
  assert.equal(choice.url, 'https://live.athletic.net/meets/68768');
});

test('batch limits count supported candidates instead of generic timing URLs', () => {
  const result = selectSupportedRows([
    { meet_id: 1, source_candidates: { meet_url: 'https://milesplit.live/meets/1' } },
    { meet_id: 2, source_candidates: { tfrrs_url: 'https://www.tfrrs.org/results/2/meet.html' } },
    { meet_id: 3, source_candidates: { athletic_net_results_url: 'https://www.athletic.net/TrackAndField/meet/3/results' } },
  ], { source: 'auto', limit: 2 });
  assert.deepEqual(result.selected.map(row => row.meet_id), [2, 3]);
  assert.equal(result.unsupported, 1);
});

test('run ids are extracted from importer output without exposing credentials', () => {
  assert.equal(
    extractRunId('CONTROL PLANE RUN bb04f4ed-397d-4ad9-ad8b-a5d7cb7f55f1'),
    'bb04f4ed-397d-4ad9-ad8b-a5d7cb7f55f1'
  );
  assert.equal(extractRunId('no run id'), null);
});

test('classifies a successful empty-source dry run separately from pending review', () => {
  assert.equal(dryRunError({
    code: 0,
    output: 'AthleticLIVE meet 67404: found 0 completed event links\n  SOURCE STATUS: EMPTY\nCONTROL PLANE RUN abc'
  }), 'source_no_results_published');
  assert.equal(dryRunError({
    code: 0,
    output: 'Meet 667160: found 0 event-result links\nCONTROL PLANE RUN abc\n  staged=0 inserted=0 claimed=0 skipped=0 quarantined=0'
  }), 'source_returned_no_observations');
  assert.equal(dryRunError({
    code: 0,
    output: 'CONTROL PLANE RUN abc\n  staged=10 inserted=0 claimed=0 skipped=0 quarantined=0'
  }), 'dry_run_pending_review');
});

test('controlled recovery requires the explicit database URL', () => {
  assert.equal(connectionString({ DATABASE_URL: 'postgresql://local' }), null);
  assert.equal(connectionString({ INGEST_DATABASE_URL: 'postgresql://private' }), 'postgresql://private');
});

test('bounded worker pool never exceeds configured concurrency', async () => {
  let active = 0;
  let peak = 0;
  const seen = [];
  await runWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    seen.push(item);
    active--;
  });
  assert.equal(peak, 2);
  assert.deepEqual(seen.sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});
