const test = require('node:test');
const assert = require('node:assert/strict');
const { buildChecklist } = require('./build_master_checklist');
const saved = require('./MASTER_CHECKLIST.json');

test('master register covers every captured object exactly once', () => {
  const expected = buildChecklist();
  assert.equal(expected.items.length, 1724);
  assert.equal(new Set(saved.items.map(i => i.id)).size, saved.items.length);
  assert.deepEqual(saved.items.map(i => i.id).sort(), expected.items.map(i => i.id).sort());
});

test('every object has an explicit purpose, review, improvement and completion state', () => {
  for (const item of saved.items) {
    for (const key of ['purpose', 'problems', 'proposedImprovement', 'status', 'ownership', 'priority']) {
      assert.ok(item[key], `${item.id}: missing ${key}`);
    }
    assert.ok(Array.isArray(item.dependencies));
    assert.ok(Array.isArray(item.evidence));
    if (item.status === 'complete') {
      assert.ok(item.verification && item.evidence.length, `${item.id}: completion needs evidence`);
      assert.ok(item.rollback, `${item.id}: completion needs rollback or explicit no-change rationale`);
    }
  }
});
