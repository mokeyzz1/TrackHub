const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { inventory } = require('./direct_writer_inventory');

function runScripts(yaml) {
  const lines = yaml.split('\n');
  const scripts = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^(\s*)run:\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    if (!/^[|>]/.test(match[2])) { scripts.push(match[2]); continue; }
    const body = [];
    while (i + 1 < lines.length) {
      const next = lines[i + 1];
      if (next.trim() && /^\s*/.exec(next)[0].length <= match[1].length) break;
      body.push(next); i++;
    }
    scripts.push(body.join('\n'));
  }
  return scripts;
}

test('manual workflow inputs are never interpolated into shell source', () => {
  const directory = path.resolve(__dirname, '../../.github/workflows');
  for (const file of fs.readdirSync(directory).filter(x => /\.ya?ml$/.test(x))) {
    for (const script of runScripts(fs.readFileSync(path.join(directory, file), 'utf8'))) {
      assert.doesNotMatch(script, /\$\{\{\s*(?:github\.event\.inputs|inputs)\./, file);
    }
  }
});
test('quoted environment expansion treats shell-looking input as literal data', () => {
  const input = '7; $(printf injected); exit 42';
  const result = spawnSync('bash', ['-c', 'printf "%s" "$LOOKBACK_DAYS"'], {
    env: { ...process.env, LOOKBACK_DAYS: input }, encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, input);
});
test('schema fixture contains no table data and CI requests the isolated test runner', () => {
  const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/application-schema-pre-checkpoints.sql'), 'utf8');
  assert.doesNotMatch(fixture, /^COPY\s/m);
  assert.doesNotMatch(fixture, /^SELECT pg_catalog\.setval/m);
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/validate-backend.yml'), 'utf8');
  assert.match(workflow, /container: postgres:17\.11-bookworm/);
  assert.match(workflow, /run_isolated_postgres_tests\.sh/);
});

test('scheduled result sync uses the controlled dual-source coordinator', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/sync-results.yml'), 'utf8');
  const coordinator = fs.readFileSync(path.resolve(__dirname, '../../scrapers/results/sync-dual-source-results.js'), 'utf8');
  assert.match(workflow, /sync-dual-source-results\.js --days "\$LOOKBACK_DAYS" --commit/);
  assert.match(workflow, /INGEST_DATABASE_URL is required/);
  assert.doesNotMatch(workflow, /sync-weekend-results\.js --days/);
  assert.match(coordinator, /'--compare', '--control-plane'/);
  assert.match(coordinator, /String\(meet\.meet_id\), '--source-url', job\.url, '--control-plane'/);
});

test('superseded general result engines stay retired', () => {
  const root = path.resolve(__dirname, '../..');
  for (const file of [
    'scrapers/athletic-net/batch_import.js',
    'scrapers/build-scrape-list-2526.js',
    'scrapers/tfrrs/athlete-scraper/import-results-to-db.js',
    'scrapers/tfrrs/athlete-scraper/import-retry-data.js',
    'scrapers/tfrrs/meet-scraper/fetch-meet-list.js',
    'scrapers/tfrrs/meet-scraper/scrape-meet-results.js',
    'scrapers/tfrrs/meet-scraper/import-meet-results.js',
    'scrapers/tfrrs/meet-scraper/import-new-athletes.js',
    'scrapers/tfrrs/meet-scraper/import-relay-results.js',
  ]) assert.equal(fs.existsSync(path.join(root, file)), false, file);
});

test('every retained result source adapter uses controlled ingestion', () => {
  const root = path.resolve(__dirname, '../..');
  for (const file of [
    'scrapers/tfrrs/meet-scraper/sync-weekend-results.js',
    'scrapers/athletic-net/import_meet_results.js',
    'scrapers/trackscoreboard/import_meet_results.js',
    'scrapers/recovery/import_timing_adapter.js',
  ]) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /ControlledIngestion/, file);
    assert.doesNotMatch(source, /--legacy-direct-write/, file);
    assert.doesNotMatch(source, /args\.includes\(['"]--legacy-direct-write['"]\)/, file);
  }
});

test('direct-writer inventory is reproducible from tracked files and has no unguarded writer', () => {
  const entries = inventory();
  assert.equal(entries.some(entry => entry.classification === 'unguarded_direct_writer'), false);
  assert.equal(entries.some(entry => entry.path === 'scrapers/tools/scrape-and-import.js'), false);
});
