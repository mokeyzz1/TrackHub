#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { ensureIngestDatabaseUrl } = require('../shared/private_database_url');
const {
  buildRosterObservation,
  buildRosterPlan,
  loadRosterContext,
  persistRosterPlan,
} = require('../shared/collegiate_roster_evidence');

require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  const input = valueAfter(argv, '--input');
  if (!input) throw new Error('--input is required');
  return { input: path.resolve(input), commit: argv.includes('--commit') };
}

function loadObservations(inputPath) {
  const document = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (!Array.isArray(document.athletes)) throw new Error('input must contain an athletes array');
  const valid = [];
  const invalid = [];
  for (const [index, row] of document.athletes.entries()) {
    try {
      valid.push(buildRosterObservation(row, document.metadata || {}));
    } catch (error) {
      invalid.push({ index, tfrrs_athlete_id: row?.tfrrs_athlete_id || null, reason: error.message });
    }
  }
  return { valid, invalid };
}

function summarize(plan, invalid, committed = false, writes = null) {
  const holdReasons = [...invalid, ...plan.held].reduce((counts, row) => {
    counts[row.reason] = (counts[row.reason] || 0) + 1;
    return counts;
  }, {});
  return {
    committed,
    eligible: plan.ready.length,
    exact_replays: plan.replayed.length,
    held: invalid.length + plan.held.length,
    hold_reasons: holdReasons,
    writes,
    note: 'No athlete status periods or current-school fields are inferred by this command.',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { valid, invalid } = loadObservations(args.input);
  if (!ensureIngestDatabaseUrl(process.env)) {
    throw new Error('INGEST_DATABASE_URL or DB_PASSWORD is required');
  }
  const pool = new Pool({
    connectionString: process.env.INGEST_DATABASE_URL,
    max: 1,
    ssl: process.env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    const context = await loadRosterContext(client, valid);
    const plan = buildRosterPlan(valid, context);
    if (!args.commit) {
      console.log(JSON.stringify(summarize(plan, invalid), null, 2));
      return;
    }
    await client.query('begin');
    await client.query("select pg_advisory_xact_lock(hashtext('tfrrs_collegiate_roster_import'))");
    const freshContext = await loadRosterContext(client, valid);
    const freshPlan = buildRosterPlan(valid, freshContext);
    const writes = await persistRosterPlan(client, freshPlan.ready);
    await client.query('commit');
    console.log(JSON.stringify(summarize(freshPlan, invalid, true, writes), null, 2));
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { loadObservations, parseArgs, summarize };
