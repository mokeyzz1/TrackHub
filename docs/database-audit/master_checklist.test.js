const test = require('node:test');
const assert = require('node:assert/strict');
const { buildChecklist } = require('./build_master_checklist');
const saved = require('./MASTER_CHECKLIST.json');
const profile = require('./column_profile_20260905.json');
const otherProfile = require('./platform_archive_column_profile_20260905.json');
const references = require('./foreign_key_profile_20260905.json');
require('./extended_checklist.test');

test('reference scan covers every registered foreign key with no skipped or dangling references', () => {
  const actual = references.profile.map(i => `relationship:${i.schema_name}:${i.table_name}:${i.constraint_name}`).sort();
  const expected = saved.items.filter(i => i.kind === 'relationship').map(i => i.id).sort();
  assert.equal(actual.length, 75);
  assert.equal(new Set(actual).size, 75);
  assert.deepEqual(actual, expected);
  for (const row of references.profile) {
    const item = saved.items.find(i => i.id === `relationship:${row.schema_name}:${row.table_name}:${row.constraint_name}`);
    assert.ok(item.evidence.includes('foreign_key_profile_20260905.json'));
    assert.equal(row.error_code, null);
    assert.equal(row.orphan_rows, 0);
    assert.equal(row.partial_null_rows, 0);
    assert.equal(row.validated, true);
  }
});

test('combined aggregate profiles cover all registered table columns, including managed and archive tables', () => {
  const tables = new Set(saved.items.filter(i => i.kind === 'table').map(i => `${i.schema}:${i.name}`));
  const expected = saved.items.filter(i => i.kind === 'column' && tables.has(`${i.schema}:${i.relation}`)).map(i => i.id).sort();
  const rows = [...profile.profile, ...otherProfile.profile];
  const actual = rows.map(i => `column:${i.schema_name}:${i.table_name}:${i.column_name}`).sort();
  assert.equal(actual.length, 872);
  assert.equal(new Set(actual).size, actual.length);
  assert.deepEqual(actual, expected);
  assert.equal(new Set(rows.map(i => `${i.schema_name}:${i.table_name}`)).size, 76);
  for (const row of rows) {
    const item = saved.items.find(i => i.id === `column:${row.schema_name}:${row.table_name}:${row.column_name}`);
    const evidence = ['public', 'ingest'].includes(row.schema_name) ? 'column_profile_20260905.json' : 'platform_archive_column_profile_20260905.json';
    assert.ok(item.evidence.includes(evidence));
  }
  for (const row of otherProfile.profile) {
    for (const key of ['total', 'nulls', 'empty_strings']) assert.ok(Number.isSafeInteger(row[key]) && row[key] >= 0);
    assert.ok(row.nulls + row.empty_strings <= row.total);
    assert.equal(row.distinct_values, null);
    assert.deepEqual(Object.keys(row).sort(), ['schema_name', 'table_name', 'column_name', 'total', 'nulls', 'empty_strings', 'distinct_values'].sort());
  }
});

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
