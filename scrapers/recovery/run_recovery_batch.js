#!/usr/bin/env node
/**
 * Process a bounded slice of the private recovery queue through controlled dry runs.
 *
 * This runner deliberately does not commit public facts. It claims one queued row at a time,
 * invokes the source-specific importer with --control-plane, records the private run id, and
 * returns the queue row to `queued` for review. A later reviewed commit can promote the same
 * source observations through the canonical writer.
 *
 *   INGEST_DATABASE_URL='postgresql://...' node run_recovery_batch.js \
 *     --scope 2025-26 --limit 3
 *   INGEST_DATABASE_URL='postgresql://...' node run_recovery_batch.js \
 *     --scope 2025-26 --meet 11579
 */

const path = require('path');
const { spawn } = require('child_process');
const { Pool } = require('pg');

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
    script: path.join(__dirname, '../athletic-net/import_meet_results.js'),
    hosts: host => host === 'athletic.net' || host.endsWith('.athletic.net') ||
      host === 'anet.live' || host.endsWith('.anet.live'),
    path: pathname => /\/TrackAndField\/meet\/\d+/i.test(pathname) || /\/meets\/\d+/i.test(pathname),
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

function parseArgs(argv) {
  if (argv.includes('--commit')) {
    throw new Error('recovery batch runner is dry-run only; reviewed commits must be run explicitly per meet');
  }

  const scope = valueAfter(argv, '--scope');
  if (!scope || !scope.trim()) throw new Error('--scope is required');

  const source = valueAfter(argv, '--source') || 'auto';
  if (!['auto', 'tfrrs', 'athletic_net'].includes(source)) {
    throw new Error('--source must be auto, tfrrs, or athletic_net');
  }

  const meetValue = valueAfter(argv, '--meet');
  const meetId = meetValue == null ? null : positiveInteger(meetValue, '--meet');
  const limit = positiveInteger(valueAfter(argv, '--limit'), '--limit', 1);
  const timeoutMs = positiveInteger(valueAfter(argv, '--timeout-ms'), '--timeout-ms', 15 * 60 * 1000);
  const delayMs = positiveInteger(valueAfter(argv, '--delay-ms'), '--delay-ms', 1500);
  const staleMinutes = positiveInteger(valueAfter(argv, '--stale-minutes'), '--stale-minutes', 30);

  return { scope: scope.trim(), source, meetId, limit, timeoutMs, delayMs, staleMinutes };
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
  return row?.source_candidates?.[SOURCE_CONFIG[source]?.key] || null;
}

function chooseSource(row, requested = 'auto') {
  const order = requested === 'auto' ? ['tfrrs', 'athletic_net'] : [requested];
  const source = order.find(candidate => validCandidate(candidate, sourceCandidate(row, candidate)));
  if (!source) {
    throw new Error(`no supported ${requested === 'auto' ? 'TFRRS or athletic.net' : requested} source candidate`);
  }

  return {
    source,
    url: sourceCandidate(row, source),
    relaysOnly: Boolean(row.needs_relays && !row.needs_individual),
  };
}

function buildImporterCommand(row, selection) {
  const meetId = String(row.meet_id);
  const args = selection.source === 'tfrrs'
    ? ['--meet', meetId, '--scrape', '--control-plane']
    : [meetId, '--control-plane'];
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

async function loadQueueRows(pool, { scope, meetId }) {
  const values = [scope];
  const meetClause = meetId == null ? '' : ' AND q.meet_id = $2';
  if (meetId != null) values.push(meetId);
  const { rows } = await pool.query(
    `SELECT q.queue_id, q.meet_id, q.coverage_status, q.needs_individual, q.needs_relays,
            q.status, q.attempts, q.source_candidates, m.name, m.date
       FROM ingest.recovery_queue q
       JOIN public.meets m ON m.meet_id = q.meet_id
      WHERE q.scope_key = $1
        AND q.status = 'queued'
        ${meetClause}
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

function dryRunError(result) {
  if (result.code === 0) return 'dry_run_pending_review';
  const tail = String(result.output || '').trim().split(/\r?\n/).slice(-3).join(' | ');
  return `importer_exit_${result.code ?? 'unknown'}${result.signal ? `_${result.signal}` : ''}${tail ? `: ${tail}` : ''}`;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
    if (selection.unsupported) {
      console.log(`  left queued for future adapters: ${selection.unsupported}`);
    }

    for (const row of rows) {
      let selection;
      try {
        selection = chooseSource(row, args.source);
      } catch (error) {
        summary.skipped_unsupported++;
        console.log(`\n[skip] meet ${row.meet_id} "${row.name}": ${error.message}`);
        continue;
      }

      const claimed = await claimQueueRow(pool, row.queue_id);
      if (!claimed) {
        console.log(`\n[skip] queue ${row.queue_id} was claimed by another worker`);
        continue;
      }
      summary.claimed++;

      const command = buildImporterCommand(row, selection);
      console.log(`\n[${summary.claimed}/${rows.length}] meet ${row.meet_id} "${row.name}"`);
      console.log(`  source=${selection.source} mode=dry_run relays_only=${selection.relaysOnly}`);
      console.log(`  url=${selection.url}`);

      try {
        const result = await runImporter({
          command: process.execPath,
          args: [command.script, ...command.args],
          timeoutMs: args.timeoutMs,
        });
        summary.ran++;
        const message = dryRunError(result);
        await releaseQueueRow(pool, row.queue_id, { runId: result.runId, error: message });
        if (result.code === 0) summary.succeeded++;
        else summary.failed++;
        console.log(`  importer_exit=${result.code ?? 'unknown'} run_id=${result.runId || 'none'}`);
      } catch (error) {
        summary.ran++;
        summary.failed++;
        await releaseQueueRow(pool, row.queue_id, { error: error.message });
        console.log(`  FAILED: ${error.message}`);
      }
      if (args.delayMs) await sleep(args.delayMs);
    }

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
  parseArgs,
  validCandidate,
  selectSupportedRows,
};
