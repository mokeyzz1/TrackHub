const test = require('node:test');
const assert = require('node:assert/strict');
const { requireControlledCommit } = require('./write_mode_guard');

test('write guard allows dry runs and controlled commits', () => {
  assert.doesNotThrow(() => requireControlledCommit({
    commit: false,
    controlPlane: false,
    legacyDirectWrite: false,
    importer: 'fixture'
  }));
  assert.doesNotThrow(() => requireControlledCommit({
    commit: true,
    controlPlane: true,
    legacyDirectWrite: false,
    importer: 'fixture'
  }));
});

test('write guard rejects direct commits without explicit forensic approval', () => {
  assert.throws(() => requireControlledCommit({
    commit: true,
    controlPlane: false,
    legacyDirectWrite: false,
    importer: 'fixture'
  }), /direct fact writes are disabled/);
});

test('write guard allows an explicitly approved legacy direct commit', () => {
  assert.doesNotThrow(() => requireControlledCommit({
    commit: true,
    controlPlane: false,
    legacyDirectWrite: true,
    importer: 'fixture'
  }));
});
