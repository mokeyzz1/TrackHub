const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { preflight } = require('./migration_preflight');
const { ledgerFingerprint } = require('./reconcile_migrations');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const files = [{ file: '1_a.sql', sql: 'SELECT 1;' }];
const ledger = [{ version: '1', name: 'a', statements: ['SELECT 1'] }];
const approvals = [{ file: '1_a.sql', version: '1', name: 'a', localSha256: sha(files[0].sql), ledgerFingerprint: ledgerFingerprint(ledger[0].statements) }];

test('accepts only reviewed matching history', () => assert.equal(preflight(files, ledger, approvals).ok, true));
test('rejects unknown files and duplicate versions', () => {
  const result = preflight([...files, { file: '1_b.sql', sql: 'DELETE FROM t;' }], ledger, approvals);
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
});
test('rejects edited historical SQL, missing local/live entries and changed live SQL', () => {
  assert.equal(preflight([{ ...files[0], sql: 'SELECT 2;' }], ledger, approvals).ok, false);
  assert.equal(preflight([], ledger, approvals).ok, false);
  assert.equal(preflight(files, [], approvals).ok, false);
  assert.equal(preflight(files, [{ ...ledger[0], statements: ['SELECT 2'] }], approvals).ok, false);
  assert.equal(preflight(files, [{ ...ledger[0], name: 'b' }], approvals).ok, false);
});
test('all held files are preserved byte-for-byte outside automatic migration discovery', () => {
  const root = path.resolve(__dirname, '../..');
  const held = require('../../supabase/migrations-held/manifest.json').files;
  assert.equal(held.length, 39);
  for (const file of held) {
    assert.equal(fs.existsSync(path.join(root, file.from)), false);
    assert.equal(sha(fs.readFileSync(path.join(root, file.to))), file.sha256);
    assert.ok(file.disposition && file.evidence && file.nextAction);
  }
});
test('all 105 reviewed active files retain their approved bytes and unique versions', () => {
  const approved = [
    ...require('./migration_approved_history_20260905.json').entries,
    ...require('./migration_approved_history_20260906.json').entries,
    ...require('./migration_approved_history_20260908.json').entries,
    ...require('./migration_approved_history_20260909.json').entries,
  ];
  assert.equal(approved.length, 105);
  assert.equal(new Set(approved.map(x => x.version)).size, 105);
  for (const file of approved) {
    assert.equal(sha(fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations', file.file))), file.localSha256);
  }
});
