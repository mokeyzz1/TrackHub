const test = require('node:test');
const assert = require('node:assert/strict');
const { centralClock, shouldRun } = require('./central-schedule-gate');

test('Central clock follows CST and CDT at the same local hour', () => {
  assert.deepEqual(centralClock(new Date('2026-01-05T12:00:00Z')), {
    date: '2026-01-05', weekday: 'Mon', hour: 6,
  });
  assert.deepEqual(centralClock(new Date('2026-07-06T11:00:00Z')), {
    date: '2026-07-06', weekday: 'Mon', hour: 6,
  });
});

test('meet discovery runs once at 6 AM Central on its intended days', () => {
  assert.equal(shouldRun('meet-discovery', centralClock(new Date('2026-01-05T12:00:00Z'))), true);
  assert.equal(shouldRun('meet-discovery', centralClock(new Date('2026-01-05T11:00:00Z'))), false);
  assert.equal(shouldRun('meet-discovery', centralClock(new Date('2026-07-06T11:00:00Z'))), true);
  assert.equal(shouldRun('meet-discovery', centralClock(new Date('2026-07-06T12:00:00Z'))), false);
});

test('meet lifecycle runs daily at 6 AM and during Central meet hours', () => {
  assert.equal(shouldRun('meet-lifecycle', { weekday: 'Mon', hour: 6 }), true);
  assert.equal(shouldRun('meet-lifecycle', { weekday: 'Wed', hour: 8 }), true);
  assert.equal(shouldRun('meet-lifecycle', { weekday: 'Sun', hour: 23 }), true);
  assert.equal(shouldRun('meet-lifecycle', { weekday: 'Mon', hour: 8 }), false);
  assert.equal(shouldRun('meet-lifecycle', { weekday: 'Sun', hour: 0 }), false);
});

test('weekend results run Sunday 10 PM and Monday 8 AM Central without DST duplicates', () => {
  for (const instant of [
    '2026-01-05T04:00:00Z',
    '2026-01-05T14:00:00Z',
    '2026-07-06T03:00:00Z',
    '2026-07-06T13:00:00Z',
  ]) assert.equal(shouldRun('weekend-results', centralClock(new Date(instant))), true, instant);

  for (const instant of [
    '2026-01-05T03:00:00Z',
    '2026-01-05T13:00:00Z',
    '2026-07-06T04:00:00Z',
    '2026-07-06T14:00:00Z',
  ]) assert.equal(shouldRun('weekend-results', centralClock(new Date(instant))), false, instant);
});
