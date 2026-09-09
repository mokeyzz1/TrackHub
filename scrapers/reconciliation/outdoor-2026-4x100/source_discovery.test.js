const test = require('node:test');
const assert = require('node:assert/strict');
const { candidateFingerprint, parseArgs } = require('./source_discovery');

test('discover parses private staging options', () => {
  assert.deepEqual(parseArgs(['discover', '--limit', '12', '--delay-ms', '0', '--stage']), {
    scope: 'outdoor-2026-4x100-source-reconciliation-v1',
    limit: 12,
    delayMs: 0,
    stage: true,
  });
});

test('candidate fingerprints are order-independent', () => {
  const rows = [{ meet_id: 2, url: 'https://www.tfrrs.org/results/2' }, { meet_id: 1, url: 'https://www.tfrrs.org/results/1' }];
  assert.equal(candidateFingerprint(rows), candidateFingerprint(rows.slice().reverse()));
});
