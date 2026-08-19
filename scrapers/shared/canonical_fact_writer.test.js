const test = require('node:test');
const assert = require('node:assert/strict');

const { nullableInteger } = require('./canonical_fact_writer');

test('does not put source-specific string event codes into integer legacy event_id columns', () => {
  assert.equal(nullableInteger('4x100m'), null);
  assert.equal(nullableInteger('1234'), 1234);
  assert.equal(nullableInteger(5678), 5678);
  assert.equal(nullableInteger(''), null);
});
