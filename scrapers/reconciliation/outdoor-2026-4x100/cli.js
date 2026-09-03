#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { ensureIngestDatabaseUrl } = require('../../shared/private_database_url');
const { ReconciliationDatabase } = require('./database');
const { Tfrrs4x100Source } = require('./tfrrs_source');
const { ReconciliationWorker } = require('./worker');
const { discover: discoverTfrrsCandidates } = require('./source_discovery');

const DEFAULT_SCOPE = 'outdoor-2026-4x100-source-reconciliation-v1';

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function positiveInteger(value, name, fallback = null) {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function nonNegativeInteger(value, name, fallback = null) {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer`);
  return parsed;
}

function parseArgs(argv = process.argv.slice(2)) {
  const command = argv[0] || 'help';
  if (!['audit', 'discover', 'prepare', 'run', 'summary', 'help'].includes(command)) {
    throw new Error('command must be audit, discover, prepare, run, summary, or help');
  }
  return {
    command,
    meetId: positiveInteger(valueAfter(argv, '--meet'), '--meet', null),
    scope: valueAfter(argv, '--scope') || DEFAULT_SCOPE,
    season: valueAfter(argv, '--season') || 'Outdoor 2026',
    from: valueAfter(argv, '--from') || '2026-04-01',
    to: valueAfter(argv, '--to') || '2026-06-30',
    maxJobs: nonNegativeInteger(valueAfter(argv, '--max-jobs'), '--max-jobs', 0),
    delayMs: nonNegativeInteger(valueAfter(argv, '--delay-ms'), '--delay-ms', 1000),
    retryFailed: argv.includes('--retry-failed'),
    includeStaged: argv.includes('--staged'),
    recheckStaged: argv.includes('--recheck-staged'),
    recheckNeedsReview: argv.includes('--recheck-needs-review'),
    stage: argv.includes('--stage'),
    json: argv.includes('--json'),
  };
}

function help() {
  console.log(`Outdoor 2026 TFRRS 4x100 reconciliation\n\n` +
    `  audit --meet ID       Read-only source-vs-database comparison\n` +
    `  discover              Verify cached TFRRS candidates for blocked jobs\n` +
    `  prepare               Populate the dedicated private queue\n` +
    `  run [--max-jobs N]    Drain queued jobs; plans repairs but never changes public facts\n` +
    `  summary               Show private queue outcomes\n\n` +
    `Options: --scope KEY --season NAME --from YYYY-MM-DD --to YYYY-MM-DD\n` +
    `         --meet ID --delay-ms N --retry-failed --staged --recheck-staged --recheck-needs-review --stage --json\n\n` +
    `There is deliberately no public apply command in this version.`);
}

function printResult(result, actions, json = false) {
  if (json) {
    console.log(JSON.stringify({ result, actions }, null, 2));
    return;
  }
  console.log(`${result.meet_id} ${result.meet_name}`);
  console.log(`status=${result.status} reason=${result.reason}`);
  console.log(`source=${result.source_result_count} local=${result.local_result_count} ` +
    `matched=${result.matched_result_count} missing=${result.missing_result_count} ` +
    `extra=${result.extra_result_count} invalid_team=${result.invalid_team_result_count} ` +
    `unresolved_source_team=${result.unresolved_source_team_count}`);
  console.log(`planned_actions=${actions.length}`);
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.command === 'help') return help();
  ensureIngestDatabaseUrl(process.env);
  const database = new ReconciliationDatabase();
  const worker = new ReconciliationWorker({
    database,
    source: new Tfrrs4x100Source(),
    delayMs: args.delayMs,
  });

  try {
    if (args.command === 'discover') {
      const result = await discoverTfrrsCandidates({
        pool: database.pool,
        scope: args.scope,
        limit: args.maxJobs,
        delayMs: args.delayMs,
        stage: args.stage,
      });
      console.log(JSON.stringify(result));
      return result;
    }

    if (args.command === 'audit') {
      if (!args.meetId) throw new Error('audit requires --meet ID');
      const meet = await database.getMeet(args.meetId);
      if (!meet) throw new Error(`meet ${args.meetId} was not found`);
      const { result, actions } = await worker.auditMeet(meet);
      printResult(result, actions, args.json);
      return { result, actions };
    }

    if (args.command === 'prepare') {
      const meets = await database.listMeets(args);
      const count = await database.prepareJobs({ scope: args.scope, meets });
      console.log(`prepared=${count} scope=${args.scope}`);
      return { prepared: count };
    }

    if (args.command === 'run') {
      const result = await worker.runQueue(args);
      console.log(JSON.stringify(result));
      return result;
    }

    const result = await database.summary(args.scope);
    console.table(result);
    return result;
  } finally {
    await database.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { DEFAULT_SCOPE, main, parseArgs, printResult };
