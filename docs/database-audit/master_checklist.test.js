const test = require('node:test');
const assert = require('node:assert/strict');
const { buildChecklist } = require('./build_master_checklist');
const saved = require('./MASTER_CHECKLIST.json');
const profile = require('./column_profile_20260905.json');
require('./extended_checklist.test');

test('live aggregate profile covers every captured public/ingest ordinary-table column', () => {
  // Additive migration entries identify their parent table without baseline relkind metadata.
  const tables = new Set(saved.items.filter(i => i.kind === 'table' && ['public', 'ingest'].includes(i.schema)).map(i => `${i.schema}:${i.name}`));
  const expected = saved.items.filter(i => i.kind === 'column' && tables.has(`${i.schema}:${i.relation}`)).map(i => i.id).sort();
  const actual = profile.profile.map(i => `column:${i.schema_name}:${i.table_name}:${i.column_name}`).sort();
  assert.equal(actual.length, 359);
  assert.equal(new Set(actual).size, actual.length);
  assert.deepEqual(actual, expected);
  assert.equal(new Set(profile.profile.map(i => `${i.schema_name}.${i.table_name}`)).size, 31);
  for (const row of profile.profile) {
    for (const key of ['total', 'nulls', 'empty_strings']) assert.ok(Number.isSafeInteger(row[key]) && row[key] >= 0);
    assert.ok(row.nulls + row.empty_strings <= row.total);
    assert.equal(row.distinct_values, null);
    assert.deepEqual(Object.keys(row).sort(), ['schema_name', 'table_name', 'column_name', 'total', 'nulls', 'empty_strings', 'distinct_values'].sort());
  }
});

test('master register covers every captured object exactly once', () => {
  const expected = buildChecklist();
  assert.equal(expected.items.length, 2279);
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
