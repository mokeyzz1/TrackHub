const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_SCOPE, parseArgs } = require('./cli');

test('audit defaults to the dedicated Outdoor 2026 TFRRS scope', () => {
  assert.deepEqual(parseArgs(['audit', '--meet', '12810']), {
    command: 'audit',
    meetId: 12810,
    scope: DEFAULT_SCOPE,
    season: 'Outdoor 2026',
    from: '2026-04-01',
    to: '2026-06-30',
    maxJobs: 0,
    delayMs: 1000,
    retryFailed: false,
    json: false,
  });
});

test('there is no public apply command', () => {
  assert.throws(() => parseArgs(['apply']), /command must be/);
});
