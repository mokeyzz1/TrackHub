#!/usr/bin/env node
/**
 * Reconcile explicitly reviewed ingestion runs that were interrupted before staging any
 * observations. This command is intentionally narrow: it never scans-and-aborts by age,
 * never changes public facts, and never creates a table or migration.
 *
 * Dry run (the default):
 *   node reconcile_interrupted_runs.js --run-id <uuid>
 *
 * Reviewed state change:
 *   node reconcile_interrupted_runs.js --run-id <uuid> --operator <name> --commit
 */

const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const DEFAULT_OLDER_THAN_HOURS = 24;
const MAX_OLDER_THAN_HOURS = 24 * 365 * 10;
const DEFAULT_STATEMENT_TIMEOUT_MS = 120000;
const MAX_STATEMENT_TIMEOUT_MS = 600000;

function valuesAfter(argv, flag) {
  const values = [];
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === flag) values.push(argv[index + 1]);
  }
  return values;
}

function positiveInteger(value, name, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${name} must be a positive integer${maximum < Number.MAX_SAFE_INTEGER ? ` no greater than ${maximum}` : ''}`);
  }
  return parsed;
}

function uuid(value, name = '--run-id') {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${name} must be a UUID`);
  }
  return value;
}

function operator(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 128) {
    throw new Error('--operator is required for --commit and must be 1-128 characters');
  }
  return value.trim();
}

function parseArgs(argv) {
  const runIds = valuesAfter(argv, '--run-id').filter(value => value != null).map(value => uuid(value));
  if (!runIds.length) throw new Error('--run-id is required; pass one or more explicit run IDs');
  if (new Set(runIds).size !== runIds.length) throw new Error('--run-id values must be unique');

  const commit = argv.includes('--commit');
  if (argv.includes('--dry-run') && commit) throw new Error('pass either --dry-run or --commit, not both');
  const olderThanHours = positiveInteger(
    valuesAfter(argv, '--older-than-hours')[0],
    '--older-than-hours',
    DEFAULT_OLDER_THAN_HOURS,
    MAX_OLDER_THAN_HOURS
  );
  const statementTimeoutMs = positiveInteger(
    valuesAfter(argv, '--statement-timeout-ms')[0],
    '--statement-timeout-ms',
    DEFAULT_STATEMENT_TIMEOUT_MS,
    MAX_STATEMENT_TIMEOUT_MS
  );
  const rawOperator = valuesAfter(argv, '--operator')[0];
  return {
    runIds,
    commit,
    olderThanHours,
    statementTimeoutMs,
    operator: commit ? operator(rawOperator || process.env.RECONCILIATION_OPERATOR) : (rawOperator?.trim() || null),
  };
}

function connectionString(env = process.env) {
  return env.INGEST_DATABASE_URL || null;
}

function withDerivedIngestDatabaseUrl(env = process.env) {
  if (env.INGEST_DATABASE_URL || !env.DB_PASSWORD) return env;
  const host = env.INGEST_DATABASE_HOST || env.SUPABASE_DB_HOST || 'db.hunbahsnaeeztmzqpnrl.supabase.co';
  const port = env.INGEST_DATABASE_PORT || '5432';
  const database = env.INGEST_DATABASE_NAME || 'postgres';
  const user = env.INGEST_DATABASE_USER || 'postgres';
  return {
    ...env,
    INGEST_DATABASE_URL: `postgresql://${user}:${encodeURIComponent(env.DB_PASSWORD)}@${host}:${port}/${database}`,
  };
}

function ageCutoff(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

async function loadRunState(client, runIds, olderThanHours, { lock = false } = {}) {
  const runs = await client.query(
    `SELECT run_id, source, mode, status, started_at, finished_at, scope, metrics, error_message
       FROM ingest.runs
      WHERE run_id = ANY($1::uuid[])
      ORDER BY started_at NULLS LAST, run_id
      ${lock ? 'FOR UPDATE' : ''}`,
    [runIds]
  );
  const counts = await client.query(
    `SELECT r.run_id,
            count(DISTINCT o.observation_id)::int AS observation_count,
            count(DISTINCT q.queue_id)::int AS recovery_queue_reference_count
       FROM ingest.runs r
       LEFT JOIN ingest.observations o ON o.run_id = r.run_id
       LEFT JOIN ingest.recovery_queue q ON q.last_run_id = r.run_id
      WHERE r.run_id = ANY($1::uuid[])
      GROUP BY r.run_id`,
    [runIds]
  );
  const countByRun = new Map(counts.rows.map(row => [row.run_id, row]));
  const runById = new Map(runs.rows.map(row => [row.run_id, row]));
  const cutoff = ageCutoff(olderThanHours);
  return runIds.map(runId => {
    const run = runById.get(runId);
    if (!run) return { runId, eligible: false, reason: 'run_not_found' };
    const count = countByRun.get(runId) || { observation_count: 0, recovery_queue_reference_count: 0 };
    const observationCount = Number(count.observation_count);
    const recoveryQueueReferenceCount = Number(count.recovery_queue_reference_count);
    let reason = null;
    if (run.mode !== 'dry_run') reason = 'not_a_dry_run';
    else if (run.status !== 'running') reason = `status_${run.status}`;
    else if (run.finished_at != null) reason = 'already_finished';
    else if (run.started_at == null) reason = 'missing_started_at';
    else if (new Date(run.started_at).toISOString() > cutoff) reason = 'not_older_than_threshold';
    else if (observationCount !== 0) reason = 'has_staged_observations';
    else if (recoveryQueueReferenceCount !== 0) reason = 'referenced_by_recovery_queue';
    return {
      runId,
      source: run.source,
      mode: run.mode,
      status: run.status,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      scope: run.scope,
      reportedObservationCount: Number(
        run.metrics?.source_observation_count
        ?? run.scope?.source_observation_count
        ?? 0
      ),
      observationCount,
      recoveryQueueReferenceCount,
      eligible: !reason,
      reason,
    };
  });
}

function assertAllEligible(plan) {
  const blocked = plan.filter(row => !row.eligible);
  if (blocked.length) {
    throw new Error(`reconciliation refused; ${blocked.length} run(s) are not eligible: ${blocked.map(row => `${row.runId}=${row.reason}`).join(', ')}`);
  }
}

function reconciliationMetrics(row, who, now = new Date().toISOString()) {
  return {
    interrupted_run_reconciliation: {
      reason_code: 'stale_running_dry_run_zero_observations',
      operator: who,
      reconciled_at: now,
      observation_count: row.observationCount,
      recovery_queue_reference_count: row.recoveryQueueReferenceCount,
      threshold_hours: row.thresholdHours,
    },
  };
}

async function reconcileInterruptedRuns(pool, args) {
  const client = pool.connect ? await pool.connect() : pool;
  const readOnly = !args.commit;
  const plan = [];
  try {
    await client.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
    if (args.statementTimeoutMs) await client.query(`SET LOCAL statement_timeout = ${Number(args.statementTimeoutMs)}`);
    const loaded = await loadRunState(client, args.runIds, args.olderThanHours, { lock: args.commit });
    for (const row of loaded) plan.push({ ...row, thresholdHours: args.olderThanHours });
    if (args.commit) {
      assertAllEligible(plan);
      const reconciledAt = new Date().toISOString();
      for (const row of plan) {
        const metrics = reconciliationMetrics(row, args.operator, reconciledAt);
        const result = await client.query(
          `UPDATE ingest.runs
              SET status = 'aborted',
                  finished_at = COALESCE(finished_at, now()),
                  error_message = concat_ws(E'\\n', error_message, $2::text),
                  metrics = COALESCE(metrics, '{}'::jsonb) || $3::jsonb
            WHERE run_id = $1
              AND mode = 'dry_run'
              AND status = 'running'
              AND finished_at IS NULL
            RETURNING run_id, status, finished_at`,
          [row.runId, `interrupted_run_reconciled:${args.operator}`, JSON.stringify(metrics)]
        );
        if (result.rows.length !== 1) throw new Error(`run ${row.runId} changed while being reconciled`);
        row.status = result.rows[0].status;
        row.finishedAt = result.rows[0].finished_at;
      }
      await client.query('COMMIT');
      return { committed: true, plan };
    }
    await client.query('ROLLBACK');
    return { committed: false, plan };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* preserve primary error */ }
    throw error;
  } finally {
    if (client !== pool && typeof client.release === 'function') client.release();
  }
}

function printPlan(result) {
  for (const row of result.plan) {
    console.log(JSON.stringify(row));
  }
  console.log(result.committed ? 'INTERRUPTED RUN RECONCILIATION COMMITTED' : 'INTERRUPTED RUN RECONCILIATION DRY-RUN (no writes)');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = withDerivedIngestDatabaseUrl(process.env);
  const url = connectionString(env);
  if (!url) throw new Error('INGEST_DATABASE_URL is required for interrupted-run reconciliation');
  const pool = new Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 10000,
    application_name: 'trackhub-interrupted-run-reconciliation',
    ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  try {
    const result = await reconcileInterruptedRuns(pool, args);
    printPlan(result);
    return result;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Interrupted-run reconciliation failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  ageCutoff,
  assertAllEligible,
  connectionString,
  loadRunState,
  parseArgs,
  reconciliationMetrics,
  reconcileInterruptedRuns,
  withDerivedIngestDatabaseUrl,
};
