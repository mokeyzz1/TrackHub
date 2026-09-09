// Read-only comparison. This deliberately does not execute SQL or repair the live ledger.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

// Conservative lexical fingerprint: preserve quoted values and entire dollar-quoted function
// bodies byte-for-byte. Formatting inside a function requires review, never guessed equivalence.
function tokens(sql) {
  const out = [];
  let i = 0;
  while (i < sql.length) {
    if (/\s/.test(sql[i])) { i++; continue; }
    if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i); i = end < 0 ? sql.length : end; continue;
    }
    if (sql.startsWith('/*', i)) {
      let depth = 1; i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith('/*', i)) { depth++; i += 2; }
        else if (sql.startsWith('*/', i)) { depth--; i += 2; }
        else i++;
      }
      if (depth) throw new Error('Unterminated SQL comment');
      continue;
    }
    const start = i;
    const dollar = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0];
    if (dollar) {
      const end = sql.indexOf(dollar, i + dollar.length);
      if (end < 0) throw new Error('Unterminated dollar quote');
      i = end + dollar.length;
    } else if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i++];
      let closed = false;
      while (i < sql.length) {
        // Preserve backslash escapes conservatively, including E strings.
        if (sql[i] === '\\') { i += 2; continue; }
        if (sql[i++] === quote) {
          if (sql[i] === quote) { i++; continue; }
          closed = true; break;
        }
      }
      if (!closed) throw new Error('Unterminated quoted value');
    } else {
      const word = sql.slice(i).match(/^[A-Za-z_0-9$]+|^[+*/<>=~!@#%^&|`?:-]+/);
      i += word ? word[0].length : 1;
    }
    out.push(sql.slice(start, i));
  }
  return out;
}

function fingerprint(sql) {
  return crypto.createHash('sha256').update(JSON.stringify(tokens(sql))).digest('hex');
}

function ledgerFingerprint(statements) {
  // The CLI can store each statement without its terminator. Preserve array boundaries:
  // joining by newline alone incorrectly combines adjacent SQL commands.
  const combined = statements.flatMap(sql => {
    const parts = tokens(sql);
    return parts.length && parts.at(-1) !== ';' ? [...parts, ';'] : parts;
  });
  return crypto.createHash('sha256').update(JSON.stringify(combined)).digest('hex');
}

function reconcile(local, live) {
  const remote = live.map(r => ({ ...r, fingerprint: ledgerFingerprint(r.statements || []) }));
  const files = local.map(l => {
    const hash = fingerprint(l.sql);
    const matches = remote.filter(r => r.fingerprint === hash);
    const named = remote.filter(r => r.name === l.name);
    return {
      file: l.file, version: l.version, name: l.name, tracked: l.tracked,
      fingerprint: hash,
      status: matches.length === 1 ? 'lexical_match' : matches.length > 1 ? 'ambiguous_matches'
        : named.length ? 'same_name_review_required' : 'no_ledger_match',
      liveVersions: (matches.length ? matches : named).map(r => r.version),
    };
  });
  return {
    method: 'Conservative lexical comparison; quoted/function bodies preserved; not semantic proof or replay authorization.',
    localCount: local.length, liveCount: live.length, files,
    duplicateLocalVersions: [...new Set(local.map(l => l.version))]
      .filter(v => local.filter(l => l.version === v).length > 1),
    unmatchedLive: remote.filter(r => !files.some(f => f.status === 'lexical_match'
      && f.liveVersions.includes(r.version))).map(({ version, name, fingerprint }) => ({ version, name, fingerprint })),
  };
}

module.exports = { tokens, fingerprint, ledgerFingerprint, reconcile };
if (require.main === module) {
  if (!process.argv[2]) throw new Error('Provide a local JSON ledger export; no database connection is made.');
  const root = path.resolve(__dirname, '../..');
  const tracked = new Set(execFileSync('git', ['ls-files', 'supabase/migrations'], { cwd: root, encoding: 'utf8' }).trim().split('\n'));
  const dir = path.join(root, 'supabase/migrations');
  const local = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort().map(file => {
    const match = file.match(/^(\d+)_(.+)\.sql$/);
    if (!match) throw new Error(`Invalid migration filename: ${file}`);
    return { file, version: match[1], name: match[2], tracked: tracked.has(`supabase/migrations/${file}`), sql: fs.readFileSync(path.join(dir, file), 'utf8') };
  });
  process.stdout.write(JSON.stringify(reconcile(local, JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))), null, 2) + '\n');
}
