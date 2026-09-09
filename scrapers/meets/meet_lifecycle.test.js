const test = require('node:test');
const assert = require('node:assert/strict');

const {
  desiredMeetStatus,
  getCentralClock,
  statusPatch,
} = require('./update_meet_status');

const clock = { today: '2026-04-25', hour: 14 };

test('classifies upcoming, live, completed, and cancelled meets from the preserved date range', () => {
  assert.equal(desiredMeetStatus({ date: '2026-04-26', status: 'completed' }, clock), 'upcoming');
  assert.equal(desiredMeetStatus({
    date: '2026-04-23', end_date: '2026-04-25', meet_url: 'https://timing.test/1', status: 'upcoming'
  }, clock), 'live');
  assert.equal(desiredMeetStatus({ date: '2026-04-24', end_date: null, status: 'live' }, clock), 'completed');
  assert.equal(desiredMeetStatus({ date: '2026-04-25', meet_url: 'https://timing.test/2', status: 'cancelled' }, clock), 'cancelled');
});

test('finishes a meet on its last day only after the configured Central end hour', () => {
  const meet = {
    date: '2026-04-23', end_date: '2026-04-25', meet_url: 'https://timing.test/1', status: 'live'
  };
  assert.equal(desiredMeetStatus(meet, { today: '2026-04-25', hour: 22 }), 'live');
  assert.equal(desiredMeetStatus(meet, { today: '2026-04-25', hour: 23 }), 'completed');
});

test('status updates cannot overwrite meet dates or source links', () => {
  const patch = statusPatch('live', new Date('2026-04-25T19:00:00.000Z'));
  assert.deepEqual(patch, { status: 'live', updated_at: '2026-04-25T19:00:00.000Z' });
  assert.equal(Object.hasOwn(patch, 'date'), false);
  assert.equal(Object.hasOwn(patch, 'end_date'), false);
  assert.equal(Object.hasOwn(patch, 'meet_url'), false);
});

test('Central clock is DST-aware without reparsing locale-formatted dates', () => {
  assert.deepEqual(getCentralClock(new Date('2026-01-15T06:30:00.000Z')), {
    today: '2026-01-15', hour: 0,
  });
  assert.deepEqual(getCentralClock(new Date('2026-07-15T05:30:00.000Z')), {
    today: '2026-07-15', hour: 0,
  });
});
