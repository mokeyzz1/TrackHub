#!/usr/bin/env node
/**
 * Static inventory of scraper writes to canonical fact/identity tables.
 *
 * This is intentionally read-only: it scans source text and prints JSON. It does not load
 * environment variables, connect to Supabase, or mutate the checkout/database.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const SCAN_ROOTS = ['scrapers'];
const EXCLUDED_PARTS = new Set(['node_modules', '.git', '.playwright-cli', 'logs', 'output']);
const TABLES = ['results', 'relay_results', 'relay_athletes', 'athlete_team_seasons', 'athletes'];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_PARTS.has(entry.name)) continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target, files);
    else if (/\.(?:js|ts|sql)$/.test(entry.name) && !entry.name.endsWith('.test.js')) files.push(target);
  }
  return files;
}

function lineNumber(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

function collectMatches(text, regex, kind) {
  const matches = [];
  let match;
  while ((match = regex.exec(text))) {
    const operation = (match[2] || /insert|update|delete/i.exec(match[0])?.[0] || 'unknown').toLowerCase();
    matches.push({ table: match[1], operation, kind, line: lineNumber(text, match.index) });
  }
  return matches;
}

function classify(relativePath, text, writes) {
  if (relativePath === 'scrapers/shared/canonical_fact_writer.js') return 'controlled_canonical_writer';
  if (relativePath === 'scrapers/shared/athlete_resolver.js') return 'legacy_library_no_active_callers';
  if (/collegiate_roster_evidence\.js$/.test(relativePath)) return 'controlled_roster_transaction';
  if (text.includes('ControlledIngestion')) {
    return text.includes('--legacy-direct-write')
      ? 'controlled_adapter_with_legacy_bridge'
      : 'controlled_source_adapter';
  }
  if (text.includes('requireControlledCommit') || text.includes('i-know-this-is-legacy')) return 'guarded_legacy_or_repair_writer';
  if (/\/(?:backfill|dedup|fix-|delete-|apply-|promote_|merge_|split_|create_reviewed|verify-)/.test(relativePath)) {
    return 'explicit_manual_repair_or_identity_writer';
  }
  return 'unguarded_direct_writer';
}

function inventory() {
  // Inventory the versioned product, not ignored operator scratch files that happen to exist in
  // one checkout. This keeps the result reproducible in CI and on a clean clone.
  const tracked = new Set(execFileSync('git', ['ls-files', ...SCAN_ROOTS], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean));
  const files = SCAN_ROOTS.flatMap(root => walk(path.join(ROOT, root)))
    .filter(file => tracked.has(path.relative(ROOT, file)));
  const entries = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const writes = [
      ...collectMatches(
        text,
        new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+(?:public\\.)?(${TABLES.join('|')})\\b`, 'gi'),
        'sql'
      ),
      ...collectMatches(
        text,
        new RegExp(`\\.from\\(\\s*['"](${TABLES.join('|')})['"]\\s*\\)\\s*\\.?(insert|update|upsert|delete)\\b`, 'gi'),
        'supabase'
      ),
    ];
    if (!writes.length) continue;
    const relativePath = path.relative(ROOT, file);
    entries.push({
      path: relativePath,
      classification: classify(relativePath, text, writes),
      guard: text.includes('requireControlledCommit'),
      controlledIngestion: text.includes('ControlledIngestion'),
      writes: writes.sort((a, b) => a.line - b.line),
    });
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

if (require.main === module) {
  const entries = inventory();
  const summary = entries.reduce((out, entry) => {
    out[entry.classification] = (out[entry.classification] || 0) + 1;
    return out;
  }, {});
  console.log(JSON.stringify({ generated_at: new Date().toISOString(), summary, entries }, null, 2));
}

module.exports = { inventory };
