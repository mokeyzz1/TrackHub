#!/usr/bin/env node
/**
 * Process a bounded slice of the private recovery queue through controlled dry runs.
 *
 * This runner deliberately does not commit public facts. It claims one queued row at a time,
 * invokes the source-specific importer with --control-plane, records the private run id, and
 * returns the queue row to `queued` for review. A later reviewed commit can promote the same
 * source observations through the canonical writer. Normal batch runs consume only rows that
 * have never been attempted; use --retry-attempted for an intentional replay.
 *
 *   INGEST_DATABASE_URL='postgresql://...' node run_recovery_batch.js \
 *     --scope 2025-26 --limit 3 --concurrency 2
 *   INGEST_DATABASE_URL='postgresql://...' node run_recovery_batch.js \
 *     --scope 2025-26 --meet 11579
 */

const path = require('path');
const { spawn } = require('child_process');
const { Pool } = require('pg');
const { isAthleticLiveHost } = require('../athletic-net/athletic_live_host');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SOURCE_CONFIG = {
  tfrrs: {
    key: 'tfrrs_url',
    script: path.join(__dirname, '../tfrrs/meet-scraper/sync-weekend-results.js'),
    hosts: host => host === 'tfrrs.org' || host.endsWith('.tfrrs.org'),
    path: pathname => /\/results\/\d+/.test(pathname),
  },
  athletic_net: {
    key: 'athletic_net_results_url',
    candidateKeys: ['athletic_live_url', 'athletic_net_results_url', 'meet_url'],
    script: path.join(__dirname, '../athletic-net/import_meet_results.js'),
    hosts: host => host === 'athletic.net' || host.endsWith('.athletic.net') || isAthleticLiveHost(host),
    path: pathname => /\/TrackAndField\/meet\/\d+/i.test(pathname) || /\/meets\/\d+/i.test(pathname),
  },
  trackscoreboard: {
    key: 'trackscoreboard_url',
    candidateKeys: ['trackscoreboard_url', 'meet_url'],
    script: path.join(__dirname, '../trackscoreboard/import_meet_results.js'),
    hosts: host => host === 'trackscoreboard.com' || host.endsWith('.trackscoreboard.com'),
    path: pathname => /\/meets\/\d+/.test(pathname),
  },
  milesplit: {
    candidateKeys: ['milesplit_url', 'meet_url'],
    script: path.join(__dirname, 'import_timing_adapter.js'),
    hosts: host => ['milesplit.live', 'milesplit.com'].includes(host) || host.endsWith('.milesplit.live') || host.endsWith('.milesplit.com'),
    path: pathname => /\/(?:meets|timers)\/\d+/.test(pathname),
  },
  pt_timing: {
    candidateKeys: ['pt_timing_url', 'meet_url'],
    script: path.join(__dirname, 'import_timing_adapter.js'),
    hosts: host => host === 'pttiming.com' || host.endsWith('.pttiming.com'),
    path: pathname => true,
  },
  leonetiming: {
    candidateKeys: ['leonetiming_url', 'meet_url'],
    script: path.join(__dirname, 'import_timing_adapter.js'),
    hosts: host => host === 'leonetiming.com' || host.endsWith('.leonetiming.com'),
    path: pathname => true,
  },
};

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function positiveInteger(value, name, fallback) {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function nonNegativeInteger(value, name, fallback) {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer`);
  return parsed;
}

function parseArgs(argv) {
  if (argv.includes('--commit')) {
    throw new Error('recovery batch runner is dry-run only; reviewed commits must be run explicitly per meet');
  }

  const scope = valueAfter(argv, '--scope');
  if (!scope || !scope.trim()) throw new Error('--scope is required');

  const source = valueAfter(argv, '--source') || 'auto';
  if (!['auto', 'tfrrs', 'athletic_net', 'trackscoreboard', 'milesplit', 'pt_timing', 'leonetiming'].includes(source)) {
    throw new Error('--source must be auto, tfrrs, athletic_net, trackscoreboard, milesplit, pt_timing, or leonetiming');
  }

  const meetValue = valueAfter(argv, '--meet');
  const meetId = meetValue == null ? null : positiveInteger(meetValue, '--meet');
  const limit = positiveInteger(valueAfter(argv, '--limit'), '--limit', 1);
  const timeoutMs = positiveInteger(valueAfter(argv, '--timeout-ms'), '--timeout-ms', 15 * 60 * 1000);
  const delayMs = nonNegativeInteger(valueAfter(argv, '--delay-ms'), '--delay-ms', 1500);
  const staleMinutes = positiveInteger(valueAfter(argv, '--stale-minutes'), '--stale-minutes', 30);
  const concurrency = positiveInteger(valueAfter(argv, '--concurrency'), '--concurrency', 2);
  const retryAttempted = argv.includes('--retry-attempted');

  return {
    scope: scope.trim(),
    source,
    meetId,
    limit,
    timeoutMs,
    delayMs,
    staleMinutes,
    concurrency,
    retryAttempted,
  };
}

function connectionString(env = process.env) {
  return env.INGEST_DATABASE_URL || null;
}

function validCandidate(source, value) {
  const config = SOURCE_CONFIG[source];
  if (!config || typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && config.hosts(url.hostname.toLowerCase()) && config.path(url.pathname);
  } catch (_) {
    return false;
  }
}

function sourceCandidate(row, source) {
  const config = SOURCE_CONFIG[source];
  const keys = config?.candidateKeys || (config?.key ? [config.key] : []);
  return keys.map(key => row?.source_candidates?.[key]).find(value => value) || null;
}

function chooseSource(row, requested = 'auto') {
  const order = requested === 'auto'
    ? ['tfrrs', 'athletic_net', 'milesplit', 'pt_timing', 'leonetiming', 'trackscoreboard']
    : [requested];
  const source = order.find(candidate => validCandidate(candidate, sourceCandidate(row, candidate)));
  if (!source) {
    throw new Error(`no supported ${requested === 'auto' ? 'TFRRS, TrackScoreboard, or athletic.net' : requested} source candidate`);
  }

  return {
    source,
    url: sourceCandidate(row, source),
    relaysOnly: Boolean(row.needs_relays && !row.needs_individual),
  };
}

function buildImporterCommand(row, selection) {
  // A discovered source shell may be mapped to a different, verified public meet. The
  // queue row remains the audit identity, while the importer must write to the canonical
  // destination to prevent a second public meet from being created.
  const meetId = String(row.target_meet_id || row.canonical_meet_id || row.meet_id);
  if (['milesplit', 'pt_timing', 'leonetiming'].includes(selection.source)) {
    return {
      command: process.execPath,
      args: [
        '--provider', selection.source,
        '--meet', meetId,
        '--source-url', selection.url,
        '--control-plane',
        ...(selection.relaysOnly ? ['--relays-only'] : []),
      ],
      script: SOURCE_CONFIG[selection.source].script,
    };
  }
  const args = selection.source === 'athletic_net'
    ? [meetId, '--control-plane']
    : ['--meet', meetId, ...(selection.source === 'tfrrs' ? ['--scrape'] : []), '--control-plane'];
  if (['athletic_net', 'trackscoreboard'].includes(selection.source) && selection.url) {
    args.push('--source-url', selection.url);
  }
  if (selection.relaysOnly) args.push('--relays-only');
  return { command: process.execPath, args, script: SOURCE_CONFIG[selection.source].script };
}

function extractRunId(output) {
  const match = String(output || '').match(/CONTROL PLANE RUN\s+([0-9a-f-]{36})/i);
  return match ? match[1] : null;
}

function runImporter({ command, args, env = process.env, timeoutMs = 15 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: path.join(__dirname, '../..'),
      env: { ...env },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill('SIGTERM');
      const error = new Error(`importer timed out after ${timeoutMs}ms`);
      error.code = 'IMPORTER_TIMEOUT';
      settled = true;
      reject(error);
    }, timeoutMs);

    const capture = chunk => {
      const text = chunk.toString();
      process.stdout.write(text);
      output = `${output}${text}`.slice(-30000);
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.on('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, signal, output, runId: extractRunId(output) });
    });
  });
}

async function loadQueueRows(pool, { scope, meetId, retryAttempted }) {
  const values = [scope];
  const clauses = ['q.scope_key = $1', "q.status = 'queued'"];
  if (!retryAttempted) clauses.push('q.attempts = 0');
  if (meetId != null) {
    values.push(meetId);
    clauses.push(`q.meet_id = $${values.length}`);
  }
  const { rows } = await pool.query(
    `SELECT q.queue_id, q.meet_id, q.canonical_meet_id,
            COALESCE(q.canonical_meet_id, q.meet_id) AS target_meet_id,
            q.coverage_status, q.needs_individual, q.needs_relays,
            q.status, q.attempts, q.source_candidates, m.name, m.date
       FROM ingest.recovery_queue q
       JOIN public.meets m ON m.meet_id = q.meet_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY q.attempts, q.priority, q.queue_id`,
    values
  );
  return rows;
}

function selectSupportedRows(rows, { source, limit }) {
  const selected = [];
  let unsupported = 0;
  for (const row of rows) {
    try {
      chooseSource(row, source);
      if (selected.length < limit) selected.push(row);
    } catch (_) {
      unsupported++;
    }
  }
  return { selected, unsupported };
}

async function claimQueueRow(pool, queueId) {
  const { rows } = await pool.query(
    `UPDATE ingest.recovery_queue
        SET status = 'in_progress', attempts = attempts + 1, updated_at = now()
      WHERE queue_id = $1 AND status = 'queued'
      RETURNING queue_id, attempts`,
    [queueId]
  );
  return rows[0] || null;
}

async function requeueStaleRows(pool, { scope, staleMinutes }) {
  const { rows } = await pool.query(
    `UPDATE ingest.recovery_queue
        SET status = 'queued',
            last_error = COALESCE(last_error, 'recovered_stale_in_progress'),
            updated_at = now()
      WHERE scope_key = $1
        AND status = 'in_progress'
        AND updated_at < now() - make_interval(mins => $2)
      RETURNING queue_id, meet_id`,
    [scope, staleMinutes]
  );
  return rows;
}

async function releaseQueueRow(pool, queueId, { runId = null, error = null } = {}) {
  await pool.query(
    `UPDATE ingest.recovery_queue
        SET status = 'queued',
            last_run_id = COALESCE($2::uuid, last_run_id),
            last_error = $3,
            updated_at = now()
      WHERE queue_id = $1`,
    [queueId, runId, error ? String(error).slice(0, 1000) : null]
  );
}

async function reconcileRelayProbe(pool, runId) {
  if (!runId) return 0;
  const { rows } = await pool.query(
    'SELECT ingest.reconcile_recovery_queue_relay_probe($1) AS rows_reconciled',
    [runId]
  );
  return Number(rows[0]?.rows_reconciled || 0);
}

function dryRunError(result) {
  if (result.code === 0) {
    const output = String(result.output || '');
    if (/SOURCE STATUS:\s*NOT_FOUND/i.test(output)) {
      return 'source_not_found';
    }
    if (/SOURCE STATUS:\s*EMPTY/i.test(output)) {
      return 'source_no_results_published';
    }
    if (/found 0 event-result links|Scraped 0 results|staged=0\s+inserted=0\s+claimed=0\s+skipped=0\s+quarantined=0/i.test(output)) {
      return 'source_returned_no_observations';
    }
    return 'dry_run_pending_review';
  }
  const tail = String(result.output || '').trim().split(/\r?\n/).slice(-3).join(' | ');
  return `importer_exit_${result.code ?? 'unknown'}${result.signal ? `_${result.signal}` : ''}${tail ? `: ${tail}` : ''}`;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runWithConcurrency(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : [];
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, list.length || 1));
  let nextIndex = 0;

  async function consume() {
    while (true) {
      const index = nextIndex++;
      if (index >= list.length) return;
      await worker(list[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => consume()));
}

async function processQueueRow(pool, row, index, total, args, summary) {
  let selection;
  try {
    selection = chooseSource(row, args.source);
  } catch (error) {
    summary.skipped_unsupported++;
    console.log('\n[skip] meet ' + row.meet_id + ' "' + row.name + '": ' + error.message);
    return;
  }

  const claimed = await claimQueueRow(pool, row.queue_id);
  if (!claimed) {
    console.log('\n[skip] queue ' + row.queue_id + ' was claimed by another worker');
    return;
  }
  summary.claimed++;

  const command = buildImporterCommand(row, selection);
  const targetLabel = row.target_meet_id && String(row.target_meet_id) !== String(row.meet_id)
    ? ' -> canonical meet ' + row.target_meet_id
    : '';
  console.log('\n[' + (index + 1) + '/' + total + '] meet ' + row.meet_id + targetLabel + ' "' + row.name + '"');
  console.log('  source=' + selection.source + ' mode=dry_run relays_only=' + selection.relaysOnly);
  console.log('  url=' + selection.url);

  try {
    const result = await runImporter({
      command: process.execPath,
      args: [command.script, ...command.args],
      timeoutMs: args.timeoutMs,
    });
    summary.ran++;
    const message = dryRunError(result);
    await releaseQueueRow(pool, row.queue_id, { runId: result.runId, error: message });
    if (result.code === 0 && result.runId) {
      const reconciled = await reconcileRelayProbe(pool, result.runId);
      if (reconciled) console.log('  relay_probe_reconciled=' + reconciled);
    }
    if (result.code === 0) summary.succeeded++;
    else summary.failed++;
    console.log('  importer_exit=' + (result.code ?? 'unknown') + ' run_id=' + (result.runId || 'none'));
  } catch (error) {
    summary.ran++;
    summary.failed++;
    await releaseQueueRow(pool, row.queue_id, { error: error.message });
    console.log('  FAILED: ' + error.message);
  }

  if (args.delayMs) await sleep(args.delayMs);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = connectionString();
  if (!url) throw new Error('INGEST_DATABASE_URL is required for recovery batch runner');

  const pool = new Pool({
    connectionString: url,
    max: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    application_name: 'trackhub-recovery-batch',
    ssl: process.env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });

  const summary = { selected: 0, claimed: 0, ran: 0, skipped_unsupported: 0, succeeded: 0, failed: 0 };
  try {
    const recovered = await requeueStaleRows(pool, args);
    if (recovered.length) {
      console.log(`Recovered ${recovered.length} stale in-progress queue row(s)`);
    }
    const queuedRows = await loadQueueRows(pool, args);
    const selection = selectSupportedRows(queuedRows, args);
    const rows = selection.selected;
    summary.selected = rows.length;
    summary.skipped_unsupported = selection.unsupported;
    console.log(`Recovery dry-run: ${args.scope} | selected ${rows.length} supported queued meet(s)`);
    if (args.retryAttempted) console.log('  retry_attempted=true');
    if (selection.unsupported) {
      console.log(`  left queued for future adapters: ${selection.unsupported}`);
    }

    console.log('  concurrency=' + args.concurrency);
    await runWithConcurrency(
      rows,
      args.concurrency,
      (row, index) => processQueueRow(pool, row, index, rows.length, args, summary)
    );

    console.log(`\nRECOVERY DRY-RUN DONE: ${JSON.stringify(summary)}`);
    return summary;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Recovery batch failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  SOURCE_CONFIG,
  buildImporterCommand,
  chooseSource,
  connectionString,
  dryRunError,
  extractRunId,
  reconcileRelayProbe,
  parseArgs,
  processQueueRow,
  runImporter,
  runWithConcurrency,
  validCandidate,
  selectSupportedRows,
};
