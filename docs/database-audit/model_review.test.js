const test = require('node:test');
const assert = require('node:assert/strict');
const review = require('./model_review_20260905.json');
const register = require('./MASTER_CHECKLIST.json');

test('MODEL-01 first pass covers every registered application table, view and column', () => {
  const app = register.items.filter(i => ['public', 'ingest'].includes(i.schema));
  const expected = app.filter(i => ['table', 'view'].includes(i.kind)).map(i => `${i.schema}.${i.name}`).sort();
  assert.equal(expected.length, 35);
  assert.deepEqual(review.relations.map(r => r.name).sort(), expected);
  const columns = review.relations.flatMap(r => r.columns.map(c => `column:${c.schema}:${c.relation}:${c.column}`));
  assert.equal(columns.length, 404);
  assert.equal(new Set(columns).size, 404);
  assert.deepEqual(columns.sort(), app.filter(i => i.kind === 'column').map(i => i.id).sort());
  for (const r of review.relations) {
    assert.ok(r.purpose && r.disposition && r.improvement);
    for (const c of r.columns) assert.ok(c.purpose && c.decision && c.remaining);
  }
});

test('MODEL-01 includes every declared touching foreign key and keeps logical links distinct', () => {
  const ids = review.foreignKeys.map(e => `relationship:${e.source_schema}:${e.source_table}:${e.name}`).sort();
  assert.equal(ids.length, 52);
  assert.deepEqual(ids, register.items.filter(i => i.kind === 'relationship' && ['public', 'ingest'].includes(i.schema)).map(i => i.id).sort());
  assert.equal(new Set(review.viewColumnDependencies.map(e => `${e.view_schema}.${e.view_name}`)).size, 4);
  assert.equal(review.viewColumnDependencies.length, 58);
  assert.ok(review.logicalConnections.some(e => e.from.startsWith('archive.')));
  assert.ok(review.logicalConnections.some(e => e.from.includes('multi-event')));
});

test('review evidence is attached without declaring structural first pass complete', () => {
  const scoped = register.items.filter(i => ['public', 'ingest'].includes(i.schema) && ['table', 'view', 'column', 'relationship'].includes(i.kind));
  assert.equal(scoped.length, 491);
  for (const i of scoped) {
    assert.equal(i.modelReview.status, 'structural first pass');
    assert.ok(i.evidence.includes('model_review_20260905.json'));
    assert.ok(i.modelReview.remaining);
  }
  assert.match(review.status, /not implementation/);
});
