#!/usr/bin/env node
/**
 * Promote one reviewed, successful control-plane dry run through the canonical fact writer.
 *
 * This is intentionally narrower than an importer commit. It accepts an existing run ID so the
 * exact staged observations can be reviewed before any public fact write occurs.
 *
 *   INGEST_DATABASE_URL='postgresql://...' node promote_ingest_run.js \
 *     --run-id <uuid> --commit
 */

const path = require('path');
const { Pool } = require('pg');
const { CanonicalFactWriter } = require('../shared/canonical_fact_writer');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DEFAULT_STATEMENT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_STATEMENT_TIMEOUT_MS = 15 * 60 * 1000;

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function statementTimeoutMs(value) {
  if (value == null) return DEFAULT_STATEMENT_TIMEOUT_MS;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_STATEMENT_TIMEOUT_MS) {
    throw new Error(`--statement-timeout-ms must be an integer between 1 and ${MAX_STATEMENT_TIMEOUT_MS}`);
  }
  return parsed;
}

function parseArgs(argv) {
  const runId = valueAfter(argv, '--run-id');
  if (!runId) throw new Error('--run-id is required');
  if (!argv.includes('--commit')) {
    throw new Error('promotion is write-protected; pass --commit to promote the reviewed run');
  }
  return {
    runId,
    allowQuarantines: argv.includes('--allow-quarantines'),
    allowMultiMeet: argv.includes('--allow-multi-meet'),
    statementTimeoutMs: statementTimeoutMs(valueAfter(argv, '--statement-timeout-ms')),
  };
}

function connectionString(env = process.env) {
  return env.INGEST_DATABASE_URL || null;
}

function withDerivedIngestDatabaseUrl(env = process.env) {
  if (env.INGEST_DATABASE_URL || !env.DB_PASSWORD) return env;
  const host = env.INGEST_DATABASE_HOST
    || env.SUPABASE_DB_HOST
    || 'db.hunbahsnaeeztmzqpnrl.supabase.co';
  const port = env.INGEST_DATABASE_PORT || '5432';
  const database = env.INGEST_DATABASE_NAME || 'postgres';
  const user = env.INGEST_DATABASE_USER || 'postgres';
  return {
    ...env,
    INGEST_DATABASE_URL: `postgresql://${user}:${encodeURIComponent(env.DB_PASSWORD)}@${host}:${port}/${database}`,
  };
}

function scopeMeetIds(scope = {}) {
  const values = scope.meet_ids || (scope.meet_id == null ? [] : [scope.meet_id]);
  return [...new Set(values.map(Number).filter(Number.isInteger))];
}

function summarizeDecisions(rows) {
  return rows.reduce((out, row) => {
    out[row.decision] = Number(row.observations);
    return out;
  }, {});
}

async function loadReview(pool, runId) {
  const runResult = await pool.query(
    `SELECT run_id, source, mode, status, scope, parser_version, metrics
       FROM ingest.runs
      WHERE run_id = $1`,
    [runId]
  );
  const run = runResult.rows[0];
  if (!run) throw new Error(`ingest run ${runId} not found`);

  const decisions = await pool.query(
    `SELECT decision, count(*)::int AS observations
       FROM ingest.observations
      WHERE run_id = $1
      GROUP BY decision
      ORDER BY decision`,
    [runId]
  );
  return { run, decisions: summarizeDecisions(decisions.rows) };
}

function validateReview({ run, decisions }, { allowQuarantines, allowMultiMeet }) {
  if (run.mode !== 'dry_run' || run.status !== 'succeeded') {
    throw new Error(`run must be a succeeded dry_run; found mode=${run.mode}, status=${run.status}`);
  }
  if (!['tfrrs', 'athletic_net', 'trackscoreboard', 'milesplit', 'pt_timing', 'leonetiming'].includes(run.source)) {
    throw new Error(`source ${run.source} is not eligible for single-run promotion`);
  }
  const meetIds = scopeMeetIds(run.scope);
  if (!meetIds.length) throw new Error('run scope does not identify a meet');
  if (meetIds.length > 1 && !allowMultiMeet) {
    throw new Error('run contains multiple meets; pass --allow-multi-meet after review');
  }
  if (!decisions.pending && !(allowQuarantines && decisions.quarantine)) {
    throw new Error('run has no pending observations to promote');
  }
  const disallowed = Object.keys(decisions).filter(key => !['pending', 'quarantine'].includes(key));
  if (disallowed.length) throw new Error(`run contains already-decided observations: ${disallowed.join(', ')}`);
  if (decisions.quarantine && !allowQuarantines) {
    throw new Error(`run contains ${decisions.quarantine} quarantined observations; review or pass --allow-quarantines`);
  }
  return { meetIds };
}

async function syncRecoveryQueueAfterPromotion(pool, runId, meetIds) {
  if (!runId || !meetIds.length) return [];

  const { rows } = await pool.query(
    `WITH individual_facts AS (
       SELECT meet_id, count(*)::bigint AS count
         FROM public.results
        WHERE meet_id = ANY($2::integer[])
        GROUP BY meet_id
     ), relay_facts AS (
       SELECT meet_id, count(*)::bigint AS count
         FROM public.relay_results
        WHERE meet_id = ANY($2::integer[])
        GROUP BY meet_id
     ), open_quarantines AS (
       SELECT o.target_meet_id AS meet_id, count(*)::int AS count
         FROM ingest.observations o
         JOIN ingest.quarantine q ON q.observation_id = o.observation_id
        WHERE o.target_meet_id = ANY($2::integer[])
          AND q.status = 'open'
        GROUP BY o.target_meet_id
     ), queue_scope AS (
       SELECT rq.queue_id,
              CASE
                WHEN rq.meet_id = ANY($2::integer[]) THEN rq.meet_id
                ELSE rq.canonical_meet_id
              END AS target_meet_id
         FROM ingest.recovery_queue rq
        WHERE rq.meet_id = ANY($2::integer[])
           OR rq.canonical_meet_id = ANY($2::integer[])
     ), coverage AS (
       SELECT qs.queue_id,
              COALESCE(i.count, 0)::bigint AS individual_fact_count,
              COALESCE(r.count, 0)::bigint AS relay_fact_count,
              COALESCE(oq.count, 0)::int AS quarantined_observation_count
         FROM queue_scope qs
         LEFT JOIN individual_facts i ON i.meet_id = qs.target_meet_id
         LEFT JOIN relay_facts r ON r.meet_id = qs.target_meet_id
         LEFT JOIN open_quarantines oq ON oq.meet_id = qs.target_meet_id
     )
     UPDATE ingest.recovery_queue rq
        SET coverage_status = CASE
              WHEN c.individual_fact_count = 0 AND c.relay_fact_count = 0 THEN 'empty'
              WHEN c.individual_fact_count = 0 THEN 'relay_only'
              WHEN c.relay_fact_count = 0 THEN 'individual_only'
              ELSE 'covered'
            END,
            needs_individual = c.individual_fact_count = 0,
            needs_relays = c.relay_fact_count = 0 AND rq.relay_coverage_status <> 'absent',
            individual_fact_count = c.individual_fact_count,
            relay_fact_count = c.relay_fact_count,
            quarantined_observation_count = c.quarantined_observation_count,
            status = CASE
              WHEN c.quarantined_observation_count > 0 THEN 'partial'
              WHEN c.individual_fact_count > 0
               AND (c.relay_fact_count > 0 OR rq.relay_coverage_status = 'absent') THEN 'complete'
              WHEN rq.status IN ('blocked', 'exhausted') THEN rq.status
              ELSE 'queued'
            END,
            last_run_id = $1,
            last_error = CASE
              WHEN c.quarantined_observation_count > 0
                THEN 'source_observations_quarantined=' || c.quarantined_observation_count::text
              ELSE NULL
            END,
            updated_at = now()
       FROM coverage c
      WHERE rq.queue_id = c.queue_id
      RETURNING rq.queue_id, rq.meet_id, rq.status, rq.quarantined_observation_count`,
    [runId, meetIds]
  );

  const eventQueue = await pool.query(
    `UPDATE ingest.event_recovery_queue
        SET status = CASE
              WHEN EXISTS (
                SELECT 1
                  FROM ingest.observations o
                  JOIN ingest.quarantine q ON q.observation_id = o.observation_id
                 WHERE o.target_meet_id = ingest.event_recovery_queue.meet_id
                   AND q.status = 'open'
              ) THEN 'needs_review'
              WHEN NOT EXISTS (
                SELECT 1
                  FROM public.relay_results rr
                  JOIN public.event_types et ON et.event_type_id = rr.event_type_id
                 WHERE rr.meet_id = ingest.event_recovery_queue.meet_id
                   AND et.code = '4x100m'
                   AND rr.mark_seconds IS NOT NULL
              ) THEN 'needs_review'
              ELSE 'complete'
            END,
            last_error = CASE
              WHEN EXISTS (
                SELECT 1
                  FROM ingest.observations o
                  JOIN ingest.quarantine q ON q.observation_id = o.observation_id
                 WHERE o.target_meet_id = ingest.event_recovery_queue.meet_id
                   AND q.status = 'open'
              ) THEN 'source_observations_quarantined=' || (
                SELECT count(*)::text
                  FROM ingest.observations o
                  JOIN ingest.quarantine q ON q.observation_id = o.observation_id
                 WHERE o.target_meet_id = ingest.event_recovery_queue.meet_id
                   AND q.status = 'open'
              )
              WHEN NOT EXISTS (
                SELECT 1
                  FROM public.relay_results rr
                  JOIN public.event_types et ON et.event_type_id = rr.event_type_id
                 WHERE rr.meet_id = ingest.event_recovery_queue.meet_id
                   AND et.code = '4x100m'
                   AND rr.mark_seconds IS NOT NULL
              ) THEN 'promotion_incomplete:no_numeric_4x100'
              ELSE NULL
            END,
            updated_at = now()
      WHERE meet_id = ANY($2::integer[])
        AND event_code = '4x100m'
        AND last_run_id = $1
        AND status <> 'complete'
      RETURNING job_id, meet_id, status`,
    [runId, meetIds]
  );

  return [...rows, ...eventQueue.rows];
}

async function resolveSupersededQuarantines(pool, runId) {
  if (!runId) return 0;

  const { rows } = await pool.query(
    `WITH current_links AS (
       SELECT DISTINCT o.source_record_id
         FROM ingest.observations o
         JOIN ingest.source_links sl ON sl.source_record_id = o.source_record_id
        WHERE o.run_id = $1
          AND o.decision IN ('insert', 'claim', 'skip_duplicate')
          AND sl.link_status = 'linked'
     ), resolved AS (
       UPDATE ingest.quarantine q
          SET status = 'resolved',
              resolution_note = 'Superseded by a later canonical source link from run ' || $1::text,
              resolved_at = now()
         FROM ingest.observations old
         JOIN current_links cl ON cl.source_record_id = old.source_record_id
        WHERE q.observation_id = old.observation_id
          AND q.status = 'open'
          AND old.run_id <> $1
          AND old.decision = 'quarantine'
        RETURNING q.quarantine_id
     )
     SELECT count(*)::integer AS resolved_count FROM resolved`,
    [runId]
  );
  return Number(rows[0]?.resolved_count || 0);
}

async function resolveSupersededOpenQuarantines(pool, runId) {
  if (!runId) return 0;

  const { rows } = await pool.query(
    `WITH current_open AS (
       SELECT DISTINCT o.source_record_id
         FROM ingest.observations o
         JOIN ingest.quarantine q ON q.observation_id = o.observation_id
        WHERE o.run_id = $1
          AND q.status = 'open'
     ), resolved AS (
       UPDATE ingest.quarantine q
          SET status = 'resolved',
              resolution_note = 'Superseded by a later open review for the same source record from run ' || $1::text,
              resolved_at = now()
         FROM ingest.observations old
         JOIN current_open co ON co.source_record_id = old.source_record_id
        WHERE q.observation_id = old.observation_id
          AND old.run_id <> $1
          AND q.status = 'open'
        RETURNING q.quarantine_id
     )
     SELECT count(*)::integer AS resolved_count FROM resolved`,
    [runId]
  );
  return Number(rows[0]?.resolved_count || 0);
}

async function promoteRun({
  runId,
  allowQuarantines = false,
  allowMultiMeet = false,
  statementTimeoutMs: promotionStatementTimeoutMs = DEFAULT_STATEMENT_TIMEOUT_MS,
  env = process.env,
} = {}) {
  const url = connectionString(env);
  if (!url) throw new Error('INGEST_DATABASE_URL is required for run promotion');

  const pool = new Pool({
    connectionString: url,
    max: 4,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    application_name: 'trackhub-ingest-promotion',
    ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });

  try {
    const review = await loadReview(pool, runId);
    const scope = validateReview(review, { allowQuarantines, allowMultiMeet });
    console.log(`Promoting ${runId}: ${review.run.source} | meets=${scope.meetIds.join(',')} | decisions=${JSON.stringify(review.decisions)}`);

    const writer = new CanonicalFactWriter({
      pool,
      env,
      statementTimeoutMs: promotionStatementTimeoutMs,
    });
    let committedStats = null;
    let committedStatus = null;
    try {
      committedStats = await writer.commitRun(runId);
      committedStatus = committedStats.quarantined || committedStats.errors ? 'partial' : 'succeeded';
      const supersededQuarantines = await resolveSupersededQuarantines(pool, runId);
      const supersededOpenQuarantines = await resolveSupersededOpenQuarantines(pool, runId);
      const queueRows = await syncRecoveryQueueAfterPromotion(pool, runId, scope.meetIds);
      const metrics = {
        ...(review.run.metrics || {}),
        promotion: {
          promoted_from_dry_run: true,
          promoted_at: new Date().toISOString(),
          stats: committedStats,
          recovery_queue_rows: queueRows.length,
          superseded_quarantines: supersededQuarantines,
          superseded_open_quarantines: supersededOpenQuarantines,
        },
      };
      await pool.query(
        `UPDATE ingest.runs
            SET mode = 'commit', status = $2, metrics = $3::jsonb, finished_at = now(), error_message = $4
          WHERE run_id = $1 AND mode = 'dry_run' AND status = 'succeeded'`,
        [runId, committedStatus, JSON.stringify(metrics), committedStats.errors ? `writer_errors=${committedStats.errors}` : null]
      );
      console.log(`PROMOTION ${committedStatus}: ${JSON.stringify(committedStats)}`);
      return { runId, status: committedStatus, stats: committedStats };
    } catch (error) {
      if (committedStats) {
        // The canonical writer commits its transaction before queue reconciliation. Never
        // relabel a completed public fact write as failed if only the bookkeeping pass failed.
        await pool.query(
          `UPDATE ingest.runs
              SET mode = 'commit', status = $2, finished_at = now(),
                  error_message = $3
            WHERE run_id = $1 AND mode = 'dry_run'`,
          [runId, committedStatus, `post_commit_reconciliation_failed=${String(error.message || error).slice(0, 900)}`]
        );
      } else {
        await pool.query(
          `UPDATE ingest.runs
              SET status = 'failed', error_message = $2, finished_at = now()
            WHERE run_id = $1 AND mode = 'dry_run'`,
          [runId, String(error.message || error).slice(0, 1000)]
        );
      }
      throw error;
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
  Object.assign(process.env, withDerivedIngestDatabaseUrl(process.env));
  const args = parseArgs(process.argv.slice(2));
  promoteRun({ ...args }).catch(error => {
    console.error(`Run promotion failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  connectionString,
  withDerivedIngestDatabaseUrl,
  parseArgs,
  promoteRun,
  scopeMeetIds,
  resolveSupersededQuarantines,
  resolveSupersededOpenQuarantines,
  syncRecoveryQueueAfterPromotion,
  summarizeDecisions,
  validateReview,
};
