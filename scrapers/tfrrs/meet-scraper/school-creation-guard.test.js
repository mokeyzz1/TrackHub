const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeSchoolCandidateName,
  buildExistingSchoolIndex,
  classifySchoolCandidate,
  assertLegacySchoolCreationDisabled
} = require('./school-creation-guard');

test('lowercases before stripping punctuation without dropping capital initials', () => {
  assert.equal(normalizeSchoolCandidateName('Jacksonville'), 'jacksonville');
  assert.equal(normalizeSchoolCandidateName('FCC Jacksonville'), 'fccjacksonville');
  assert.notEqual(
    normalizeSchoolCandidateName('Jacksonville'),
    normalizeSchoolCandidateName('FCC Jacksonville')
  );
});

test('punctuation and spacing variants route to an existing-school review candidate', () => {
  const index = buildExistingSchoolIndex([
    { school_id: 1496, official_name: 'Stjohnfisher', short_name: 'Stjohnfisher' }
  ]);
  const review = classifySchoolCandidate({ school_name: 'St. John Fisher' }, index);

  assert.equal(review.status, 'blocked_existing_candidate');
  assert.deepEqual(review.existingMatches.map(s => s.school_id), [1496]);
});

test('a shared normalized name retains every possible institution instead of picking one', () => {
  const index = buildExistingSchoolIndex([
    { school_id: 791, official_name: 'Lewis Clark', short_name: 'Lewis Clark', state: 'ID' },
    { school_id: 1337, official_name: 'Lewis & Clark', short_name: 'Lewis & Clark', state: 'OR' }
  ]);
  const review = classifySchoolCandidate({ school_name: 'Lewis-Clark' }, index);

  assert.equal(review.status, 'blocked_existing_candidate');
  assert.deepEqual(review.existingMatches.map(s => s.school_id), [791, 1337]);
});

test('a new name without both source state and team slug is insufficient for creation', () => {
  const review = classifySchoolCandidate(
    { school_name: 'Example College', team_state: null, team_slug: null },
    new Map()
  );
  assert.equal(review.status, 'blocked_insufficient_identity');
});

test('even a well-formed new candidate requires curated review', () => {
  const review = classifySchoolCandidate(
    { school_name: 'Example College', team_state: 'ME', team_slug: 'Example_College' },
    new Map()
  );
  assert.equal(review.status, 'requires_curated_review');
});

test('legacy commit mode is disabled', () => {
  assert.throws(
    () => assertLegacySchoolCreationDisabled(true),
    /Automatic school creation is disabled/
  );
  assert.doesNotThrow(() => assertLegacySchoolCreationDisabled(false));
});
