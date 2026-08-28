const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseArgs,
  normalizeName,
  tokenDisagreement,
  pageContainsDate
} = require('./discover_tfrrs_candidates');

test('parses required scope and optional stage', () => {
  assert.deepEqual(parseArgs(['--scope', '2025-26']), { scope: '2025-26', limit: 0, stage: false });
  assert.deepEqual(parseArgs(['--scope', '2025-26', '--limit', '10', '--stage']), { scope: '2025-26', limit: 10, stage: true });
});

test('normalizes accents and year noise for exact source-name matching', () => {
  assert.equal(normalizeName('Campeonato Relevos LAI 2026'), 'campeonato relevos lai');
});

test('rejects discriminating conference token mismatches', () => {
  assert.deepEqual(tokenDisagreement('Big Ten Championships', 'Big West Championships'), ['ten', 'west']);
  assert.deepEqual(tokenDisagreement('Chris Rinne Invitational', 'Chris Rinne Invitational'), []);
});

test('verifies page dates within the allowed tolerance', () => {
  assert.equal(pageContainsDate('Results: April 25, 2026', '2026-04-25'), true);
  assert.equal(pageContainsDate('Results: Apr 23, 2026', '2026-04-25'), true);
  assert.equal(pageContainsDate('Results: April 10, 2026', '2026-04-25'), false);
});
