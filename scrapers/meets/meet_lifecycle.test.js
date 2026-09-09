const test = require('node:test');
const assert = require('node:assert/strict');

const {
  lifecycleMismatchEndpoint,
  statusPatch,
} = require('./update_meet_status');

test('status cache reads only mismatches from the authoritative lifecycle view', () => {
  assert.equal(lifecycleMismatchEndpoint('live'),
    'v_meets_lifecycle?select=meet_id,name,date,end_date,status,effective_status'
    + '&effective_status=eq.live&status=neq.live&order=meet_id.asc&limit=500');
  assert.throws(() => lifecycleMismatchEndpoint('made_up'), /Unsupported lifecycle status/);
  assert.throws(() => lifecycleMismatchEndpoint('live', 1001), /limit/);
});

test('status updates cannot overwrite meet dates or source links', () => {
  const patch = statusPatch('live', new Date('2026-04-25T19:00:00.000Z'));
  assert.deepEqual(patch, { status: 'live', updated_at: '2026-04-25T19:00:00.000Z' });
  assert.equal(Object.hasOwn(patch, 'date'), false);
  assert.equal(Object.hasOwn(patch, 'end_date'), false);
  assert.equal(Object.hasOwn(patch, 'meet_url'), false);
});
