const test = require('node:test');
const assert = require('node:assert/strict');

const { AthleteResolver } = require('./athlete_resolver');

test('does not queue placeholder identities for public athlete creation', () => {
  const resolver = new AthleteResolver({});
  assert.equal(resolver.resolve({ name: '[Name Withheld]' }), null);
  assert.equal(resolver.resolve({ tfrrsId: 123, name: 'Unknown Athlete' }), null);
  assert.equal(resolver.pending.length, 0);
  assert.equal(resolver.rejectedPlaceholders, 2);
  assert.equal(resolver.finalId({ name: '[Name Withheld]' }), null);
});

test('still resolves an existing provider-qualified athlete when a source hides its name', () => {
  const resolver = new AthleteResolver({});
  resolver.byTfrrs.set(123, 456);
  assert.equal(resolver.resolve({ tfrrsId: 123, name: '[Name Withheld]' }), 456);
  assert.equal(resolver.pending.length, 0);
});

test('continues to queue valid new athletes', () => {
  const resolver = new AthleteResolver({});
  assert.equal(resolver.resolve({ tfrrsId: 123, name: 'Ana Rivera', schoolId: 300, gender: 'F' }), null);
  assert.deepEqual(resolver.pending, [{
    tfrrs_athlete_id: '123',
    full_name: 'Ana Rivera',
    first_name: 'Ana',
    last_name: 'Rivera',
    gender: 'F',
    school_id: 300,
    is_active: true,
  }]);
});
