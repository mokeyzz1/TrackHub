const test = require('node:test');
const assert = require('node:assert/strict');
const {
  candidateFingerprint,
  holdMultiplyClaimedUrls,
  parseArgs,
  selectCandidate,
} = require('./source_discovery');
const { normalizeName } = require('../../recovery/discover_tfrrs_candidates');

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

function indexOf(rows) {
  const index = new Map();
  for (const row of rows) {
    const key = normalizeName(row.name);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }
  return index;
}

test('candidate selection accepts a longer source name without dropping outdoor identity', () => {
  const candidate = { name: 'Big 12 Outdoor Track & Field Championships', url: 'https://tfrrs.org/results/1' };
  assert.deepEqual(
    selectCandidate('Big 12 Outdoor Championships', indexOf([candidate])),
    { status: 'candidate', candidate, method: 'contained_identifying_tokens' }
  );
});

test('candidate selection refuses equally specific source pages', () => {
  const result = selectCandidate('Battle Road Twilight I', indexOf([
    { name: 'Battle Road Twilight I Track Meet', url: 'https://tfrrs.org/results/1' },
    { name: 'Battle Road Twilight I College Meet', url: 'https://tfrrs.org/results/2' },
  ]));
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.candidates.length, 2);
});

test('candidate selection keeps indoor and outdoor distinct', () => {
  const result = selectCandidate('Appalachian AAC Outdoor Championships', indexOf([
    { name: 'Appalachian AAC Indoor T&F Championships', url: 'https://tfrrs.org/results/1' },
  ]));
  assert.equal(result.status, 'no_candidate');
});

test('one source page cannot be staged for multiple local meets', () => {
  const unique = { meet_id: 3, url: 'https://tfrrs.org/results/2' };
  const result = holdMultiplyClaimedUrls([
    { meet_id: 1, url: 'https://tfrrs.org/results/1' },
    { meet_id: 2, url: 'https://tfrrs.org/results/1' },
    unique,
  ]);
  assert.deepEqual(result.eligible, [unique]);
  assert.deepEqual(result.held.map(row => row.meet_id), [1, 2]);
});
