// Read-only guard. Passing means history matches; it is not permission to deploy or reset.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ledgerFingerprint } = require('./reconcile_migrations');

function preflight(files, ledger, approvals) {
  const errors = [];
  const versions = new Set();
  for (const file of files) {
    const version = file.file.split('_')[0];
    if (versions.has(version)) errors.push(`Duplicate active version: ${version}`);
    versions.add(version);
    const approved = approvals.find(a => a.file === file.file);
    if (!approved) { errors.push(`Unreviewed active migration: ${file.file}`); continue; }
    const hash = crypto.createHash('sha256').update(file.sql).digest('hex');
    if (hash !== approved.localSha256) errors.push(`Historical SQL changed: ${file.file}`);
    const entries = ledger.filter(l => l.version === approved.version);
    if (entries.length !== 1 || entries[0].name !== approved.name) {
      errors.push(`Live version/name mismatch: ${file.file}`); continue;
    }
    if (ledgerFingerprint(entries[0].statements || []) !== approved.ledgerFingerprint) {
      errors.push(`Live SQL differs from reviewed history: ${file.file}`);
    }
  }
  for (const entry of ledger) {
    if (!files.some(f => f.file === `${entry.version}_${entry.name}.sql`)) {
      errors.push(`Live migration missing locally: ${entry.version}_${entry.name}`);
    }
  }
  for (const entry of approvals) {
    if (!files.some(f => f.file === entry.file)) errors.push(`Reviewed file missing: ${entry.file}`);
  }
  return { ok: errors.length === 0, checkedFiles: files.length, errors };
}

module.exports = { preflight };
if (require.main === module) {
  if (!process.argv[2]) throw new Error('Supply a fresh private JSON ledger export (version,name,statements). No database is contacted.');
  const dir = path.resolve(__dirname, '../../supabase/migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).map(file => ({ file, sql: fs.readFileSync(path.join(dir, file), 'utf8') }));
  const result = preflight(files, JSON.parse(fs.readFileSync(process.argv[2], 'utf8')),
    [
      ...require('./migration_approved_history_20260905.json').entries,
      ...require('./migration_approved_history_20260906.json').entries,
      ...require('./migration_approved_history_20260908.json').entries,
    ]);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = result.ok ? 0 : 1;
}
