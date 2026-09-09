const test = require('node:test');
const assert = require('node:assert/strict');

const { isPlaceholderAthleteName, parseName } = require('./name_parser');

test('recognizes explicit source placeholders without rejecting real names', () => {
  for (const value of [
    null, '', '   ', '[Name Withheld]', 'Identity Withheld', 'UNKNOWN ATHLETE',
    'Anonymous', 'Redacted', 'Unidentified', 'No Name', 'Not Available', 'N/A',
    'Athlete', 'Unattached',
  ]) {
    assert.equal(isPlaceholderAthleteName(value), true, String(value));
    assert.equal(parseName(value), null, String(value));
  }

  for (const value of ['Athena Jones', 'Namé Withers', '未知 选手']) {
    assert.equal(isPlaceholderAthleteName(value), false, value);
  }
});

test('continues parsing valid athlete names', () => {
  assert.deepEqual(parseName('Jet van der Heijden'), {
    first_name: 'Jet',
    last_name: 'van der Heijden',
  });
});
