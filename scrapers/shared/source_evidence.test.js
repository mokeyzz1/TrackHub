const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalJson, sourceEvidence } = require('./source_evidence');

test('evidence hash is independent of object property order but preserves array order', () => {
  assert.equal(sourceEvidence({ payload: { b: 2, a: { d: 4, c: 3 } } }).snapshot_hash,
    sourceEvidence({ payload: { a: { c: 3, d: 4 }, b: 2 } }).snapshot_hash);
  assert.notEqual(sourceEvidence({ payload: [1, 2] }).snapshot_hash,
    sourceEvidence({ payload: [2, 1] }).snapshot_hash);
});
test('evidence includes source locators and uses JSON serialization semantics', () => {
  assert.equal(canonicalJson({ a: undefined, b: [undefined, NaN] }), '{"b":[null,null]}');
  assert.notEqual(sourceEvidence({ payload: {}, source_url: 'a' }).snapshot_hash,
    sourceEvidence({ payload: {}, source_url: 'b' }).snapshot_hash);
  assert.match(sourceEvidence({}).snapshot_hash, /^[a-f0-9]{64}$/);
});
