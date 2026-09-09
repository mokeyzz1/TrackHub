#!/usr/bin/env node
/**
 * Discover and privately stage missing 4x100 results from populated outdoor meets.
 *
 * This job is event-specific and dry-run only. A meet qualifies only when it already has
 * individual facts, has no numeric 4x100 result, and either has broken 4x100 status rows or a
 * numeric 4x400 result. Source observations are audited before the meet is source-confirmed.
 */

const path = require('path');
const { Pool } = require('pg');
const {
  buildImporterCommand,
  chooseSource,
  connectionString,
  runImporter,
  runWithConcurrency,
} = require('./run_recovery_batch');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DEFAULT_SEASON = 'Outdoor 2026';
const DEFAULT_FROM = '2025-08-01';
const DEFAULT_TO = '2026-07-31';

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

function isoDate(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error(`${name} must be YYYY-MM-DD`);
  return value;
}

function parseArgs(argv) {
  if (argv.includes('--commit')) {
    throw new Error('4x100 recovery discovery is dry-run only; promote reviewed runs separately');
  }

  const source = valueAfter(argv, '--source') || 'auto';
  if (!['auto', 'tfrrs', 'athletic_net', 'trackscoreboard'].includes(source)) {
    throw new Error('--source must be auto, tfrrs, athletic_net, or trackscoreboard');
  }
  const classification = valueAfter(argv, '--classification') || 'all';
  if (!['all', 'status_only', 'malformed', 'missing'].includes(classification)) {
    throw new Error('--classification must be all, status_only, malformed, or missing');
  }

  const from = isoDate(valueAfter(argv, '--from') || DEFAULT_FROM, '--from');
  const to = isoDate(valueAfter(argv, '--to') || DEFAULT_TO, '--to');
  if (from > to) throw new Error('--from must be on or before --to');

  return {
    season: valueAfter(argv, '--season') || DEFAULT_SEASON,
    from,
    to,
    source,
    classification,
    meetId: positiveInteger(valueAfter(argv, '--meet'), '--meet'),
    limit: positiveInteger(valueAfter(argv, '--limit'), '--limit', 1),
    concurrency: positiveInteger(valueAfter(argv, '--concurrency'), '--concurrency', 2),
    delayMs: nonNegativeInteger(valueAfter(argv, '--delay-ms'), '--delay-ms', 1500),
    timeoutMs: positiveInteger(valueAfter(argv, '--timeout-ms'), '--timeout-ms', 15 * 60 * 1000),
    retryConfirmed: argv.includes('--retry-confirmed'),
    listOnly: argv.includes('--list-only'),
  };
}

function candidateClass(row) {
  const total = Number(row.four_by_one_rows || 0);
  const statuses = Number(row.four_by_one_status_rows || 0);
  if (total === 0) return 'missing';
  if (statuses === total) return 'status_only';
  return 'malformed';
}

async function loadCandidates(pool, args) {
  const values = [args.season, args.from, args.to];
  const clauses = [
    'm.season = $1',
    'm.date BETWEEN $2::date AND $3::date',
    'COALESCE(ic.individual_rows, 0) > 0',
    'COALESCE(rc.four_by_one_numeric_rows, 0) = 0',
    '(COALESCE(rc.four_by_one_rows, 0) > 0 OR COALESCE(rc.four_by_four_numeric_rows, 0) > 0)',
  ];
  if (args.meetId != null) {
    values.push(args.meetId);
    clauses.push(`m.meet_id = $${values.length}`);
  }
  if (!args.retryConfirmed) clauses.push('cr.run_id IS NULL');

  const { rows } = await pool.query(
    `WITH target_meets AS (
       SELECT m.*
         FROM public.meets m
        WHERE m.season = $1
          AND m.date BETWEEN $2::date AND $3::date
          AND m.date < current_date
     ), event_ids AS (
       SELECT max(event_type_id) FILTER (WHERE code = '4x100m') AS four_by_one_id,
              max(event_type_id) FILTER (WHERE code = '4x400m') AS four_by_four_id
         FROM public.event_types
     ), individual_counts AS (
       SELECT r.meet_id, count(*)::integer AS individual_rows
         FROM public.results r
         JOIN target_meets m ON m.meet_id = r.meet_id
        GROUP BY r.meet_id
     ), relay_counts AS (
       SELECT rr.meet_id,
              count(*) FILTER (WHERE rr.event_type_id = e.four_by_one_id)::integer AS four_by_one_rows,
              count(*) FILTER (
                WHERE rr.event_type_id = e.four_by_one_id AND rr.mark_seconds IS NOT NULL
              )::integer AS four_by_one_numeric_rows,
              count(*) FILTER (
                WHERE rr.event_type_id = e.four_by_one_id
                  AND upper(trim(COALESCE(rr.mark_raw, ''))) ~ '^(DNS|DNF|DQ|NT|SCR|FS)$'
              )::integer AS four_by_one_status_rows,
              count(*) FILTER (
                WHERE rr.event_type_id = e.four_by_four_id AND rr.mark_seconds IS NOT NULL
              )::integer AS four_by_four_numeric_rows
         FROM public.relay_results rr
         JOIN target_meets m ON m.meet_id = rr.meet_id
        CROSS JOIN event_ids e
        GROUP BY rr.meet_id
     ), confirmed_runs AS (
       SELECT DISTINCT ON (o.target_meet_id)
              o.target_meet_id AS meet_id, r.run_id, r.finished_at
         FROM ingest.runs r
         JOIN ingest.observations o ON o.run_id = r.run_id
         JOIN public.event_types et ON et.event_type_id = o.event_type_id
        WHERE r.mode = 'dry_run'
          AND r.status = 'succeeded'
          AND COALESCE((r.scope->>'relays_only')::boolean, false)
          AND o.entity_type = 'relay_result'
          AND et.code = '4x100m'
          AND o.mark_seconds IS NOT NULL
        ORDER BY o.target_meet_id, r.finished_at DESC NULLS LAST
     )
     SELECT m.meet_id, m.name, m.date::text AS date, m.season,
            COALESCE(ic.individual_rows, 0)::integer AS individual_rows,
            COALESCE(rc.four_by_one_rows, 0)::integer AS four_by_one_rows,
            COALESCE(rc.four_by_one_numeric_rows, 0)::integer AS four_by_one_numeric_rows,
            COALESCE(rc.four_by_one_status_rows, 0)::integer AS four_by_one_status_rows,
            COALESCE(rc.four_by_four_numeric_rows, 0)::integer AS four_by_four_numeric_rows,
            cr.run_id AS confirmed_run_id,
            jsonb_build_object(
              'tfrrs_url', CASE
                WHEN m.tfrrs_url ~* 'tfrrs\\.org/results/[0-9]+' THEN m.tfrrs_url
                WHEN m.meet_url ~* 'tfrrs\\.org/results/[0-9]+' THEN m.meet_url
              END,
              'athletic_net_results_url', CASE
                WHEN m.athletic_net_results_url ~* '(athletic\\.net|athletic\\.live|anet\\.live|mastiming\\.net)' THEN m.athletic_net_results_url
                WHEN m.meet_url ~* '(athletic\\.net|athletic\\.live|anet\\.live|mastiming\\.net)' THEN m.meet_url
              END,
              'meet_url', m.meet_url,
              'trackscoreboard_url', CASE WHEN m.meet_url ~* 'trackscoreboard\\.com/meets/[0-9]+' THEN m.meet_url END
            ) AS source_candidates
       FROM target_meets m
       LEFT JOIN individual_counts ic ON ic.meet_id = m.meet_id
       LEFT JOIN relay_counts rc ON rc.meet_id = m.meet_id
       LEFT JOIN confirmed_runs cr ON cr.meet_id = m.meet_id
      WHERE ${clauses.join('\n        AND ')}
      ORDER BY CASE
                 WHEN COALESCE(rc.four_by_one_rows, 0) > 0
                  AND COALESCE(rc.four_by_one_status_rows, 0) = COALESCE(rc.four_by_one_rows, 0)
                   THEN 1
                 WHEN COALESCE(rc.four_by_one_rows, 0) > 0 THEN 2
                 ELSE 3
               END,
               COALESCE(rc.four_by_four_numeric_rows, 0) DESC,
               m.date DESC, m.meet_id`,
    values
  );

  return rows
    .map(row => ({ ...row, classification: candidateClass(row), needs_individual: false, needs_relays: true }))
    .filter(row => args.classification === 'all' || row.classification === args.classification);
}

function selectSupportedCandidates(rows, args) {
  const selected = [];
  const unsupported = [];
  for (const row of rows) {
    try {
      const selection = chooseSource(row, args.source);
      if (selected.length < args.limit) selected.push({ row, selection });
    } catch (error) {
      unsupported.push({ meet_id: row.meet_id, reason: error.message });
    }
  }
  return { selected, unsupported };
}

async function auditRun(pool, runId) {
  const { rows } = await pool.query(
    `WITH run_observations AS (
       SELECT o.*, et.code
         FROM ingest.observations o
         LEFT JOIN public.event_types et ON et.event_type_id = o.event_type_id
        WHERE o.run_id = $1
     ), target_meets AS (
       SELECT DISTINCT target_meet_id AS meet_id
         FROM run_observations
        WHERE target_meet_id IS NOT NULL
     ), source_comparison_teams AS (
       SELECT DISTINCT target_team_id AS team_id
         FROM run_observations
        WHERE entity_type = 'relay_result'
          AND code = '4x400m'
          AND mark_seconds IS NOT NULL
          AND target_team_id IS NOT NULL
     ), existing_comparison_teams AS (
       SELECT DISTINCT rr.team_id
         FROM public.relay_results rr
         JOIN public.event_types et ON et.event_type_id = rr.event_type_id
         JOIN target_meets tm ON tm.meet_id = rr.meet_id
        WHERE et.code = '4x400m'
          AND rr.mark_seconds IS NOT NULL
          AND rr.team_id IS NOT NULL
     )
     SELECT count(*) FILTER (WHERE o.entity_type = 'relay_result' AND o.code = '4x100m')::integer AS parent_rows,
            count(*) FILTER (
              WHERE o.entity_type = 'relay_result' AND o.code = '4x100m' AND o.mark_seconds IS NOT NULL
            )::integer AS numeric_parent_rows,
            count(*) FILTER (WHERE o.entity_type = 'relay_leg' AND o.code = '4x100m')::integer AS leg_rows,
            count(*) FILTER (
              WHERE o.entity_type IN ('relay_result', 'relay_leg') AND o.code = '4x100m' AND o.decision = 'pending'
            )::integer AS pending_rows,
            count(*) FILTER (
              WHERE o.entity_type IN ('relay_result', 'relay_leg') AND o.code = '4x100m' AND o.decision = 'quarantine'
            )::integer AS quarantined_rows,
            count(*) FILTER (
              WHERE o.entity_type = 'relay_result' AND o.event_type_id IS NULL AND o.raw_event_name ~* '4[[:space:]]*x[[:space:]]*100'
            )::integer AS unmapped_parent_rows,
            count(*) FILTER (WHERE o.code IS DISTINCT FROM '4x100m')::integer AS non_target_event_rows,
            count(DISTINCT o.target_meet_id)::integer AS target_meet_count,
            min(o.target_meet_id)::integer AS target_meet_id,
            (SELECT count(*)::integer FROM source_comparison_teams) AS source_comparison_teams,
            (SELECT count(*)::integer FROM existing_comparison_teams) AS existing_comparison_teams,
            (SELECT count(*)::integer
               FROM source_comparison_teams s
               JOIN existing_comparison_teams e USING (team_id)) AS comparison_team_overlap
       FROM run_observations o`,
    [runId]
  );
  return rows[0];
}

function auditOutcome(audit) {
  if (Number(audit.source_comparison_teams || 0) >= 4
      && Number(audit.existing_comparison_teams || 0) >= 4
      && Number(audit.comparison_team_overlap || 0) === 0) {
    return 'source_identity_conflict';
  }
  if (Number(audit.numeric_parent_rows || 0) > 0) return 'source_confirmed';
  if (Number(audit.unmapped_parent_rows || 0) > 0) return 'source_event_unmapped';
  if (Number(audit.parent_rows || 0) > 0) return 'source_4x100_without_numeric_marks';
  return 'source_has_no_4x100_observations';
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function withMeetLock(pool, meetId, work) {
  const client = await pool.connect();
  try {
    const lock = await client.query('SELECT pg_try_advisory_lock(4100, $1) AS locked', [meetId]);
    if (!lock.rows[0]?.locked) return { locked: false };
    try {
      return { locked: true, value: await work() };
    } finally {
      await client.query('SELECT pg_advisory_unlock(4100, $1)', [meetId]);
    }
  } finally {
    client.release();
  }
}

async function processCandidate(pool, item, index, total, args, summary) {
  const { row, selection } = item;
  const locked = await withMeetLock(pool, row.meet_id, async () => {
    console.log(`\n[${index + 1}/${total}] meet ${row.meet_id} "${row.name}" (${row.classification})`);
    console.log(`  existing: individuals=${row.individual_rows} 4x100=${row.four_by_one_rows} numeric_4x100=0 numeric_4x400=${row.four_by_four_numeric_rows}`);
    console.log(`  source=${selection.source} url=${selection.url}`);

    const command = buildImporterCommand(row, { ...selection, relaysOnly: true });
    const result = await runImporter({
      command: command.command,
      args: [command.script, ...command.args],
      timeoutMs: args.timeoutMs,
    });
    summary.ran++;
    if (result.code !== 0 || !result.runId) {
      summary.failed++;
      console.log(`  FAILED importer_exit=${result.code ?? 'unknown'} run_id=${result.runId || 'none'}`);
      return;
    }

    const audit = await auditRun(pool, result.runId);
    const outcome = auditOutcome(audit);
    summary[outcome]++;
    console.log(`  run_id=${result.runId} outcome=${outcome}`);
    console.log(`  4x100: parents=${audit.parent_rows} numeric_parents=${audit.numeric_parent_rows} legs=${audit.leg_rows} pending=${audit.pending_rows} quarantined=${audit.quarantined_rows} unmapped_parents=${audit.unmapped_parent_rows}`);
    console.log(`  source check: source_4x400_teams=${audit.source_comparison_teams} existing_4x400_teams=${audit.existing_comparison_teams} overlap=${audit.comparison_team_overlap}`);
  });

  if (!locked.locked) {
    summary.locked_elsewhere++;
    console.log(`\n[skip] meet ${row.meet_id} is already being processed by another 4x100 worker`);
  }
  if (args.delayMs) await sleep(args.delayMs);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = connectionString();
  if (!url) throw new Error('INGEST_DATABASE_URL is required for controlled 4x100 recovery');

  const pool = new Pool({
    connectionString: url,
    max: Math.max(4, args.concurrency + 2),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    application_name: 'trackhub-4x100-recovery',
    ssl: process.env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  const summary = {
    selected: 0,
    ran: 0,
    source_confirmed: 0,
    source_identity_conflict: 0,
    source_event_unmapped: 0,
    source_4x100_without_numeric_marks: 0,
    source_has_no_4x100_observations: 0,
    locked_elsewhere: 0,
    failed: 0,
  };

  try {
    const candidates = await loadCandidates(pool, args);
    const selection = selectSupportedCandidates(candidates, args);
    summary.selected = selection.selected.length;
    console.log(`4x100 recovery dry-run: season=${args.season} candidates=${candidates.length} selected=${selection.selected.length}`);
    console.log(`  classification=${args.classification} source=${args.source} concurrency=${args.concurrency}`);
    if (selection.unsupported.length) console.log(`  unsupported_source_candidates=${selection.unsupported.length}`);

    if (args.listOnly) {
      console.table(selection.selected.map(({ row, selection: source }) => ({
        meet_id: row.meet_id,
        date: row.date,
        classification: row.classification,
        individual_rows: row.individual_rows,
        four_by_one_rows: row.four_by_one_rows,
        numeric_4x400: row.four_by_four_numeric_rows,
        source: source.source,
        name: row.name,
      })));
      console.log(`\n4X100 RECOVERY LIST DONE: ${JSON.stringify(summary)}`);
      return summary;
    }

    await runWithConcurrency(
      selection.selected,
      args.concurrency,
      (item, index) => processCandidate(pool, item, index, selection.selected.length, args, summary)
    );
    console.log(`\n4X100 RECOVERY DRY-RUN DONE: ${JSON.stringify(summary)}`);
    return summary;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`4x100 recovery failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  auditRun,
  auditOutcome,
  candidateClass,
  parseArgs,
  selectSupportedCandidates,
};
