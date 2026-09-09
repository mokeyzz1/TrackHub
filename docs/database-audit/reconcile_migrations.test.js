const test = require('node:test');
const assert = require('node:assert/strict');
const { fingerprint, ledgerFingerprint, reconcile } = require('./reconcile_migrations');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

test('all aligned migration files retain their original SQL bytes', () => {
  const moves = require('./migration_filename_moves_20260905.json');
  assert.equal(moves.length, 27);
  const dir = path.resolve(__dirname, '../../supabase/migrations');
  for (const m of moves) {
    assert.equal(fs.existsSync(path.join(dir, m.from)), false, m.from);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, m.to))).digest('hex'), m.sha256, m.to);
  }
});

test('quarantine refresh and its later regex fix match their distinct ledger snapshots', () => {
  const expected = {
    '20260821115738_recompute_open_recovery_quarantines.sql': '453785f18fbb49cae7ca7827e7ea073e8518f3870066d37e59813c484a0bf288',
    '20260821115931_fix_recovery_queue_source_regex.sql': '1766707a79ed5ce686018b0c7f6ac2a890641b0c22c90226e73268c75de2c56e',
  };
  for (const [file, hash] of Object.entries(expected)) {
    assert.equal(fingerprint(fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations', file), 'utf8')), hash);
  }
});

test('ignores outer whitespace and nested comments', () => {
  assert.equal(fingerprint('SELECT /* a /* nested */ b */ 1; -- note'), fingerprint(' SELECT 1; '));
});

test('ledger array boundaries restore omitted statement terminators', () => {
  assert.equal(ledgerFingerprint(['SELECT 1', 'SELECT 2 -- comment']), fingerprint('SELECT 1; SELECT 2;'));
  assert.equal(ledgerFingerprint(['SELECT 1;', 'SELECT 2;']), fingerprint('SELECT 1; SELECT 2;'));
  assert.equal(ledgerFingerprint(['-- comment only', 'DO $$ BEGIN PERFORM 1; END $$']),
    fingerprint('DO $$ BEGIN PERFORM 1; END $$;'));
  assert.notEqual(ledgerFingerprint(['SELECT 1', 'SELECT 2']), fingerprint('SELECT 1 SELECT 2;'));
});

test('restored history matches recorded SQL while subsequent corrections remain unchanged', () => {
  const evidence = require('./migration_history_restoration_20260905.json');
  const dir = path.resolve(__dirname, '../../supabase/migrations');
  assert.equal(evidence.restored.length, 4);
  for (const row of evidence.restored) {
    assert.equal(fingerprint(fs.readFileSync(path.join(dir, row.file), 'utf8')), row.ledgerFingerprint, row.file);
  }
  for (const row of evidence.preservedCorrections) {
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, row.file))).digest('hex'), row.sha256, row.file);
  }
});

test('recovered missing migration matches its existing live ledger entry', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20260810125242_20260810_map_remaining_event_aliases.sql'), 'utf8');
  assert.equal(fingerprint(sql), '8cb6546070b98037ec286e6602f8f883d2032d9dd7347ab7d2a5fc80f2ed5488');
});
test('preserves data literals, quoted identifiers, and function bodies', () => {
  for (const [a, b] of [["SELECT 'a b'", "SELECT 'ab'"], ['SELECT "A"', 'SELECT "a"'],
    ['DO $$ BEGIN -- first\n END $$;', 'DO $$ BEGIN -- second\n END $$;'],
    ["SELECT E'a\\\'b'", "SELECT E'ab'"]]) assert.notEqual(fingerprint(a), fingerprint(b));
});
test('does not confuse operators, token boundaries or SQL changes', () => {
  assert.notEqual(fingerprint('SELECT a >= b'), fingerprint('SELECT a > = b'));
  assert.notEqual(fingerprint('SELECT ab'), fingerprint('SELECT a b'));
  assert.notEqual(fingerprint('DELETE FROM t'), fingerprint('SELECT FROM t'));
});
test('rejects incomplete SQL rather than manufacturing a fingerprint', () => {
  for (const sql of ["SELECT 'oops", '/* unfinished', 'DO $tag$oops']) assert.throws(() => fingerprint(sql));
});
test('classifies renamed SQL, conflicting names, duplicate versions and missing ledger entries', () => {
  const local = [
    { file: '1_old.sql', version: '1', name: 'old', sql: 'SELECT 1;' },
    { file: '1_changed.sql', version: '1', name: 'changed', sql: 'SELECT 2;' },
    { file: '3_pending.sql', version: '3', name: 'pending', sql: 'SELECT 3;' },
  ];
  const result = reconcile(local, [
    { version: '10', name: 'renamed', statements: ['SELECT 1;'] },
    { version: '11', name: 'changed', statements: ['SELECT 4;'] },
  ]);
  assert.deepEqual(result.files.map(f => f.status), ['lexical_match', 'same_name_review_required', 'no_ledger_match']);
  assert.deepEqual(result.duplicateLocalVersions, ['1']);
  assert.deepEqual(result.unmatchedLive.map(r => r.version), ['11']);
});
test('multiple matching ledger entries remain ambiguous', () => {
  const result = reconcile([{ version: '1', name: 'x', sql: 'SELECT 1;' }],
    ['2', '3'].map(version => ({ version, name: 'x', statements: ['SELECT 1;'] })));
  assert.equal(result.files[0].status, 'ambiguous_matches');
});
