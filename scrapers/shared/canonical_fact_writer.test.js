const test = require('node:test');
const assert = require('node:assert/strict');

const { linkedTarget, nullableInteger } = require('./canonical_fact_writer');

test('does not put source-specific string event codes into integer legacy event_id columns', () => {
  assert.equal(nullableInteger('4x100m'), null);
  assert.equal(nullableInteger('1234'), 1234);
  assert.equal(nullableInteger(5678), 5678);
  assert.equal(nullableInteger(''), null);
});

test('only accepts one valid canonical source-link target', () => {
  assert.deepEqual(linkedTarget(123, null), { resultId: 123, relayResultId: null });
  assert.deepEqual(linkedTarget(null, 456), { resultId: null, relayResultId: 456 });
  assert.equal(linkedTarget(null, null), null);
  assert.equal(linkedTarget(123, 456), null);
});
