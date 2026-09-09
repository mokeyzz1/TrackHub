const test = require('node:test');
const assert = require('node:assert/strict');

const { isRelayTimeMark } = require('./relay_time');

test('accepts sub-minute and minute-form relay times', () => {
  for (const mark of ['39.30', '39.300', '58.99', '1:02.34', '12:59.999', ' 45.22 ']) {
    assert.equal(isRelayTimeMark(mark), true, mark);
  }
});

test('rejects status codes and unrelated numeric cells', () => {
  for (const mark of ['DNS', 'DNF', 'DQ', 'NT', '2.0', '9.30', '100.20', '1', '', null]) {
    assert.equal(isRelayTimeMark(mark), false, String(mark));
  }
});
