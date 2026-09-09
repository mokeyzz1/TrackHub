const test = require('node:test');
const assert = require('node:assert/strict');
const { buildExtendedChecklist } = require('./build_extended_checklist');
const snapshot = require('./schema_extended_20260905.json');

test('extended catalog covers each captured object and preserves exact sequence integers', () => {
  const items = buildExtendedChecklist();
  assert.equal(items.length, 554);
  assert.equal(new Set(items.map(x => x.id)).size, 554);
  assert.equal(items.filter(x => x.kind === 'sequence' && x.status === 'verified').length, 25);
  for (const sequence of snapshot.sequences) {
    assert.equal(typeof sequence.maximum, 'string');
    assert.ok(BigInt(sequence.maximum) > 0n);
    if (sequence.type === 'bigint') assert.equal(sequence.maximum, '9223372036854775807');
  }
  assert.deepEqual(snapshot.scheduler_presence, { pg_cron_extension: false, cron_jobs_relation: null });
});

test('sensitive-column default expressions are not exported verbatim', () => {
  for (const item of snapshot.defaults) {
    if (/(password|secret|token|credential)/i.test(item.name)) {
      assert.equal(item.expression, '[redacted sensitive-column default; review privately]');
    }
  }
});
