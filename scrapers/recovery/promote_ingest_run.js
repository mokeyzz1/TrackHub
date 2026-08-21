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

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
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
  };
}

function connectionString(env = process.env) {
  return env.INGEST_DATABASE_URL || null;
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
  if (!['tfrrs', 'athletic_net'].includes(run.source)) {
    throw new Error(`source ${run.source} is not eligible for single-run promotion`);
  }
  const meetIds = scopeMeetIds(run.scope);
  if (!meetIds.length) throw new Error('run scope does not identify a meet');
  if (meetIds.length > 1 && !allowMultiMeet) {
    throw new Error('run contains multiple meets; pass --allow-multi-meet after review');
  }
  if (!decisions.pending) throw new Error('run has no pending observations to promote');
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
    `WITH open_quarantines AS (
       SELECT o.target_meet_id AS meet_id, count(*)::int AS count
         FROM ingest.observations o
         JOIN ingest.quarantine q ON q.observation_id = o.observation_id
        WHERE o.target_meet_id = ANY($2::integer[])
          AND q.status = 'open'
        GROUP BY o.target_meet_id
     )
     UPDATE ingest.recovery_queue rq
        SET quarantined_observation_count = COALESCE(oq.count, 0),
            status = CASE
              WHEN COALESCE(oq.count, 0) > 0 THEN 'partial'
              WHEN NOT rq.needs_individual AND NOT rq.needs_relays THEN 'complete'
              WHEN rq.status IN ('in_progress', 'partial') THEN 'queued'
              ELSE rq.status
            END,
            last_run_id = $1,
            last_error = CASE
              WHEN COALESCE(oq.count, 0) > 0
                THEN 'source_observations_quarantined=' || COALESCE(oq.count, 0)::text
              ELSE NULL
            END,
            updated_at = now()
       FROM open_quarantines oq
      WHERE rq.meet_id = oq.meet_id
      RETURNING rq.queue_id, rq.meet_id, rq.status, rq.quarantined_observation_count`,
    [runId, meetIds]
  );

  // The first UPDATE returns only meets that still have an open quarantine. This second pass
  // clears stale partial state for a promotion that leaves no unresolved observations.
  const cleared = await pool.query(
    `UPDATE ingest.recovery_queue rq
        SET quarantined_observation_count = 0,
            status = CASE
              WHEN NOT rq.needs_individual AND NOT rq.needs_relays THEN 'complete'
              WHEN rq.status IN ('in_progress', 'partial') THEN 'queued'
              ELSE rq.status
            END,
            last_run_id = $1,
            last_error = NULL,
            updated_at = now()
      WHERE rq.meet_id = ANY($2::integer[])
        AND rq.quarantined_observation_count > 0
        AND NOT EXISTS (
          SELECT 1
            FROM ingest.observations o
            JOIN ingest.quarantine q ON q.observation_id = o.observation_id
           WHERE o.target_meet_id = rq.meet_id
             AND q.status = 'open'
        )
      RETURNING rq.queue_id, rq.meet_id, rq.status, rq.quarantined_observation_count`,
    [runId, meetIds]
  );

  const relayCoverage = await pool.query(
    `UPDATE ingest.recovery_queue rq
        SET relay_coverage_status = 'present',
            updated_at = now()
      WHERE rq.meet_id = ANY($2::integer[])
        AND rq.relay_coverage_status <> 'present'
        AND EXISTS (
          SELECT 1
            FROM public.relay_results rr
           WHERE rr.meet_id = rq.meet_id
        )
      RETURNING rq.queue_id, rq.meet_id, rq.status, rq.quarantined_observation_count`,
    [runId, meetIds]
  );

  return [...rows, ...cleared.rows, ...relayCoverage.rows];
}

async function promoteRun({ runId, allowQuarantines = false, allowMultiMeet = false, env = process.env } = {}) {
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

    const writer = new CanonicalFactWriter({ pool, env });
    try {
      const stats = await writer.commitRun(runId);
      const status = stats.quarantined || stats.errors ? 'partial' : 'succeeded';
      const queueRows = await syncRecoveryQueueAfterPromotion(pool, runId, scope.meetIds);
      const metrics = {
        ...(review.run.metrics || {}),
        promotion: {
          promoted_from_dry_run: true,
          promoted_at: new Date().toISOString(),
          stats,
          recovery_queue_rows: queueRows.length,
        },
      };
      await pool.query(
        `UPDATE ingest.runs
            SET mode = 'commit', status = $2, metrics = $3::jsonb, finished_at = now(), error_message = $4
          WHERE run_id = $1 AND mode = 'dry_run' AND status = 'succeeded'`,
        [runId, status, JSON.stringify(metrics), stats.errors ? `writer_errors=${stats.errors}` : null]
      );
      console.log(`PROMOTION ${status}: ${JSON.stringify(stats)}`);
      return { runId, status, stats };
    } catch (error) {
      await pool.query(
        `UPDATE ingest.runs
            SET status = 'failed', error_message = $2, finished_at = now()
          WHERE run_id = $1 AND mode = 'dry_run'`,
        [runId, String(error.message || error).slice(0, 1000)]
      );
      throw error;
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  promoteRun({ ...args }).catch(error => {
    console.error(`Run promotion failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  connectionString,
  parseArgs,
  promoteRun,
  scopeMeetIds,
  syncRecoveryQueueAfterPromotion,
  summarizeDecisions,
  validateReview,
};
