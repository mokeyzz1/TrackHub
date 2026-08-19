#!/usr/bin/env node
/**
 * Refresh the private meet-recovery inventory.
 *
 * This is intentionally not a scraper and not a fact writer. It only measures which meets in a
 * requested date window have individual/relay coverage and which supported source links exist.
 * The queue can be refreshed repeatedly; it preserves active attempt state and never deletes or
 * claims a result.
 *
 *   INGEST_DATABASE_URL='postgresql://...' node refresh_recovery_queue.js \
 *     --scope 2025-26 --from 2025-08-01 --to 2026-07-31
 */

const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

function parseArgs(argv) {
  const value = name => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : null;
  };
  const scope = value('--scope');
  const from = value('--from');
  const to = value('--to');
  if (!scope || !from || !to) {
    throw new Error('Usage: node refresh_recovery_queue.js --scope <key> --from YYYY-MM-DD --to YYYY-MM-DD');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error('--from and --to must be YYYY-MM-DD');
  }
  if (from > to) throw new Error('--from must be on or before --to');
  return { scope, from, to };
}

function connectionString(env = process.env) {
  return env.INGEST_DATABASE_URL || env.DATABASE_URL || env.SUPABASE_DB_URL || null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = connectionString();
  if (!url) throw new Error('INGEST_DATABASE_URL is required for recovery queue refresh');

  const pool = new Pool({
    connectionString: url,
    max: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    application_name: 'trackhub-recovery-queue',
    ssl: process.env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
  });

  try {
    const refreshed = await pool.query(
      'SELECT ingest.refresh_recovery_queue($1, $2::date, $3::date) AS rows_upserted',
      [args.scope, args.from, args.to]
    );
    const summary = await pool.query(
      `SELECT coverage_status, status, count(*)::int AS meets,
              sum(individual_fact_count)::bigint AS individual_facts,
              sum(relay_fact_count)::bigint AS relay_facts,
              count(*) FILTER (WHERE source_candidates->>'tfrrs_url' IS NOT NULL)::int AS tfrrs_candidates,
              count(*) FILTER (WHERE source_candidates->>'athletic_net_results_url' IS NOT NULL)::int AS athletic_net_candidates
         FROM ingest.recovery_queue
        WHERE scope_key = $1
        GROUP BY coverage_status, status
        ORDER BY coverage_status, status`,
      [args.scope]
    );

    console.log(`Recovery queue refreshed: ${args.scope} (${args.from} through ${args.to})`);
    console.log(`Rows upserted: ${refreshed.rows[0].rows_upserted}`);
    console.table(summary.rows);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Recovery queue refresh failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, connectionString };
