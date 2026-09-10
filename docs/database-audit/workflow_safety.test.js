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

test('backend validation runs for main pull requests and main pushes', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/validate-backend.yml'), 'utf8');
  assert.match(workflow, /push:\s*\n\s*branches: \[main, backend-rebuild\]/);
  assert.match(workflow, /pull_request:\s*\n\s*branches: \[main, backend-rebuild\]/);
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

test('meet discovery and lifecycle status have one scheduled owner each', () => {
  const root = path.resolve(__dirname, '../..');
  const discoveryWorkflow = fs.readFileSync(path.join(root, '.github/workflows/scrape-meets.yml'), 'utf8');
  const resultWorkflow = fs.readFileSync(path.join(root, '.github/workflows/sync-results.yml'), 'utf8');
  const discovery = fs.readFileSync(path.join(root, 'scrapers/meets/discover_meets.js'), 'utf8');
  const status = fs.readFileSync(path.join(root, 'scrapers/meets/update_meet_status.js'), 'utf8');

  assert.match(discoveryWorkflow, /node discover_meets\.js "\$MEET_SCRAPE_SCOPE"/);
  assert.match(resultWorkflow, /node discover_meets\.js last_week/);
  assert.match(resultWorkflow, /node scrapers\/meets\/update_meet_status\.js/);
  assert.doesNotMatch(discovery, /function updateMeetStatuses|date:\s*today/);
  assert.doesNotMatch(status, /date:\s*today/);
  assert.equal(fs.existsSync(path.join(root, 'scrapers/meets/scrape_meets.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'scrapers/meets/scrape_meets_github.js')), false);
});

test('the app consumes the calculated meet lifecycle instead of reclassifying dates', () => {
  const root = path.resolve(__dirname, '../..');
  const hook = fs.readFileSync(path.join(root, 'frontend/hooks/useMeets.ts'), 'utf8');
  const detail = fs.readFileSync(path.join(root, 'frontend/app/meet/[id].tsx'), 'utf8');
  const detailHook = fs.readFileSync(path.join(root, 'frontend/hooks/useMeetDetails.ts'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'frontend/services/database-supabase.ts'), 'utf8');

  assert.match(hook, /\.in\('effective_status', \['upcoming', 'postponed'\]\)/);
  assert.match(hook, /\.eq\('effective_status', 'live'\)/);
  assert.match(hook, /\.eq\('effective_status', 'completed'\)/);
  assert.match(hook, /from\('v_meets_lifecycle'\)/);
  assert.doesNotMatch(hook, /end_date\.gte|end_date\.lt|\.gt\('date'/);
  assert.match(detail, /return meet\.effective_status/);
  assert.doesNotMatch(detail, /meetDateStr === todayStr/);
  assert.match(detailHook, /from\('v_meets_lifecycle'\)/);
  assert.match(service, /function getMeetById[\s\S]*from\('v_meets_lifecycle'\)/);
  assert.match(service, /function getMeetByName[\s\S]*from\('v_meets_lifecycle'\)/);
});

test('athlete discovery and profile reads expose collegiate athletes only', () => {
  const root = path.resolve(__dirname, '../..');
  const service = fs.readFileSync(path.join(root, 'frontend/services/database-supabase.ts'), 'utf8');
  const collegiateFilters = service.match(/\.eq\('schools\.institution_type', 'collegiate'\)/g) || [];
  const functionSource = name => {
    const start = service.indexOf(`export async function ${name}`);
    assert.notEqual(start, -1, name);
    const next = service.indexOf('\nexport ', start + 1);
    return service.slice(start, next === -1 ? service.length : next);
  };

  assert.equal(collegiateFilters.length, 4);
  for (const name of ['searchAthletes', 'getAthleteDetails', 'getAthletes', 'getAthleteComparisonStats']) {
    assert.match(functionSource(name), /schools!inner[\s\S]*\.eq\('schools\.institution_type', 'collegiate'\)/, name);
  }
  for (const name of ['getEventsByMeetWithGender', 'getEventResults', 'getEventCountsByMeet']) {
    assert.match(functionSource(name), /athletes!inner[\s\S]*schools!inner[\s\S]*\.eq\('athletes\.schools\.institution_type', 'collegiate'\)/, name);
  }
  for (const name of ['getTopPerformances', 'getPerformancesByEvent']) {
    assert.match(functionSource(name), /athletes!inner[\s\S]*schools!inner[\s\S]*\.eq\('athletes\.schools\.institution_type', 'collegiate'\)/, name);
  }
  for (const name of ['searchSchools', 'getSchoolById', 'getSchools']) {
    assert.match(functionSource(name), /\.eq\('institution_type', 'collegiate'\)/, name);
  }
  const topPerformances = fs.readFileSync(path.join(root, 'frontend/hooks/useTopPerformances.ts'), 'utf8');
  assert.match(topPerformances, /schools!inner\(institution_type\)[\s\S]*\.eq\('schools\.institution_type', 'collegiate'\)/);
  assert.match(topPerformances, /visibleAthleteIds\.has\(row\.athlete_id\)/);
  assert.doesNotMatch(service, /neq\('school_id',\s*1835\)/);
});

test('scheduled meet workflows use the tested Central-time gate and preserve manual runs', () => {
  const root = path.resolve(__dirname, '../..');
  const expectations = [
    ['scrape-meets.yml', 'meet-discovery'],
    ['check-live-status.yml', 'meet-lifecycle'],
    ['sync-results.yml', 'weekend-results'],
  ];
  for (const [file, policy] of expectations) {
    const workflow = fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8');
    assert.match(workflow, new RegExp(`central-schedule-gate\\.js ${policy}`), file);
    assert.match(workflow, /EVENT_NAME.*\$\{\{ github\.event_name \}\}/s, file);
    assert.match(workflow, /workflow_dispatch[\s\S]*echo "run=true"/, file);
    assert.match(workflow, /steps\.central-schedule\.outputs\.run == 'true'/, file);
  }
});

test('deferred real-time subsystem remains outside scheduled workflows', () => {
  const directory = path.resolve(__dirname, '../../.github/workflows');
  const workflows = fs.readdirSync(directory)
    .filter(file => /\.ya?ml$/.test(file))
    .map(file => fs.readFileSync(path.join(directory, file), 'utf8'))
    .join('\n');
  assert.doesNotMatch(workflows, /entries_scraper\.js|live_scraper\.js|final_scraper\.js/);
  for (const file of [
    '../../scrapers/entries/entries_scraper.js',
    '../../scrapers/live/live_scraper.js',
    '../../scrapers/final/final_scraper.js',
  ]) assert.equal(fs.existsSync(path.resolve(__dirname, file)), true, file);
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
