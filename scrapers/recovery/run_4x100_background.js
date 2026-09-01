#!/usr/bin/env node
/**
 * Drain the event-specific 4x100 recovery queue.
 *
 * This worker is intentionally narrower than the generic recovery runner:
 *   - it only creates jobs for populated meets missing a numeric 4x100 parent;
 *   - it only uses verified adapters for TFRRS, AthleticLIVE, MileSplit, PT Timing, and Leone
 *     Timing (never TrackScoreboard);
 *   - it treats meets.meet_url as source evidence and routes it when its provider is supported;
 *   - it passes --event-code 4x100m so the source scraper does not fetch other events;
 *   - it stages through the control plane and auto-promotes only an audited clean run;
 *   - it leases jobs and remembers a staged run, so a restart does not blindly re-fetch it.
 *
 * Refresh and drain every historical meet:
 *   INGEST_DATABASE_URL='postgresql://...' node recovery/run_4x100_background.js \
 *     --scope all-4x100 --from 1900-01-01 --auto-promote
 *
 * Leave public facts untouched while reviewing the queue:
 *   ... node recovery/run_4x100_background.js --scope all-4x100 --from 2025-08-01
 */

const path = require('path');
const { Pool } = require('pg');
const {
  buildImporterCommand,
  dryRunError,
  runImporter,
  validCandidate,
} = require('./run_recovery_batch');
const { auditRun } = require('./run_4x100_recovery_batch');
const { promoteRun } = require('./promote_ingest_run');
const { discoverSources } = require('./discover_4x100_sources');
const { classifySourceUrl, recoverySourceFromUrl } = require('./source_provider');
const { ensureIngestDatabaseUrl } = require('../shared/private_database_url');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const EVENT_CODE = '4x100m';
const DEFAULT_FROM = '1900-01-01';
const DEFAULT_DELAY_MS = 3000;
const DEFAULT_LEASE_MINUTES = 60;
const DEFAULT_MAX_ATTEMPTS = 2;

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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const scope = valueAfter(argv, '--scope');
  if (!scope || !scope.trim()) throw new Error('--scope is required');

  const from = isoDate(valueAfter(argv, '--from') || DEFAULT_FROM, '--from');
  const to = isoDate(valueAfter(argv, '--to') || todayIso(), '--to');
  if (from > to) throw new Error('--from must be on or before --to');

  const source = valueAfter(argv, '--source') || 'auto';
  if (!['auto', 'primary', 'tfrrs', 'athletic_net', 'milesplit', 'pt_timing', 'leonetiming'].includes(source)) {
    throw new Error('--source must be auto, primary, tfrrs, athletic_net, milesplit, pt_timing, or leonetiming');
  }

  const concurrency = positiveInteger(valueAfter(argv, '--concurrency'), '--concurrency', 1);
  if (concurrency > 4) throw new Error('--concurrency must not exceed 4');

  return {
    scope: scope.trim(),
    season: valueAfter(argv, '--season') || null,
    from,
    to,
    source,
    meetId: positiveInteger(valueAfter(argv, '--meet'), '--meet', null),
    concurrency,
    delayMs: nonNegativeInteger(valueAfter(argv, '--delay-ms'), '--delay-ms', DEFAULT_DELAY_MS),
    leaseMinutes: positiveInteger(valueAfter(argv, '--lease-minutes'), '--lease-minutes', DEFAULT_LEASE_MINUTES),
    timeoutMs: positiveInteger(valueAfter(argv, '--timeout-ms'), '--timeout-ms', 15 * 60 * 1000),
    maxAttempts: positiveInteger(valueAfter(argv, '--max-attempts'), '--max-attempts', DEFAULT_MAX_ATTEMPTS),
    maxJobs: nonNegativeInteger(valueAfter(argv, '--max-jobs'), '--max-jobs', 0),
    maxPages: positiveInteger(valueAfter(argv, '--max-pages'), '--max-pages', 250),
    retryFailed: argv.includes('--retry-failed'),
    autoPromote: argv.includes('--auto-promote'),
    exactTarget: argv.includes('--exact-target'),
    skipRefresh: argv.includes('--skip-refresh'),
    discoverSources: argv.includes('--discover-sources'),
    discoverOnly: argv.includes('--discover-only'),
    blockedOnly: argv.includes('--blocked-only'),
    // TFRRS recovery runs in-process by default. Use --child-process only as a diagnostic escape
    // hatch; the in-process path is what allows lookup maps and source responses to be reused.
    inProcess: !argv.includes('--child-process'),
  };
}

function connectionString(env = process.env) {
  return env.INGEST_DATABASE_URL || null;
}

function sourceUrlForJob(job, source) {
  const direct = source === 'tfrrs'
    ? job.source_candidates?.tfrrs_url
    : source === 'athletic_net'
      ? job.source_candidates?.athletic_net_results_url
      : source === 'milesplit'
        ? job.source_candidates?.milesplit_url
        : source === 'pt_timing'
          ? job.source_candidates?.pt_timing_url
          : source === 'leonetiming'
            ? job.source_candidates?.leonetiming_url
      : null;
  if (direct && validCandidate(source, direct)) return direct;
  return recoverySourceFromUrl(job.source_candidates?.meet_url, source)?.url || null;
}

function sourceOrder(job, requested = 'auto') {
  const candidates = requested === 'auto'
    ? ['tfrrs', 'athletic_net', 'milesplit', 'pt_timing', 'leonetiming']
    : requested === 'primary'
      ? ['tfrrs', 'athletic_net']
    : [requested];
  const selections = candidates
    .map(source => ({ source, url: sourceUrlForJob(job, source) }))
    .filter(candidate => candidate.url && validCandidate(candidate.source, candidate.url));
  const seen = new Set();
  return selections.filter(selection => {
    const key = `${selection.source}|${selection.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function noSourceError(job) {
  const classification = classifySourceUrl(job.source_candidates?.meet_url);
  if (classification.capability === 'policy_excluded') {
    return `policy_excluded:${classification.provider}`;
  }
  if (classification.capability === 'adapter_required') {
    return `adapter_required:${classification.provider}`;
  }
  if (classification.capability === 'invalid_url') {
    return classification.reason === 'missing_url'
      ? 'no meet_url or verified TFRRS/Athletic source URL'
      : `invalid_meet_url:${classification.reason}`;
  }
  return 'no verified recovery source URL';
}

function build4x100ImporterCommand(job, selection) {
  if (['milesplit', 'pt_timing', 'leonetiming'].includes(selection.source)) {
    return {
      command: process.execPath,
      script: path.join(__dirname, 'import_timing_adapter.js'),
      args: [
        '--provider', selection.source,
        '--meet', String(job.target_meet_id || job.canonical_meet_id || job.meet_id),
        '--source-url', selection.url,
        '--control-plane',
        '--relays-only',
        '--event-code', EVENT_CODE,
      ],
    };
  }
  const base = buildImporterCommand(
    { ...job, target_meet_id: job.meet_id, needs_individual: false, needs_relays: true },
    { ...selection, relaysOnly: true }
  );
  const args = [...base.args, '--event-code', EVENT_CODE];
  if (selection.source === 'tfrrs') args.push('--source-url', selection.url);
  return {
    ...base,
    args,
  };
}

function cleanAudit(audit, meetId) {
  return promotableAudit(audit, meetId)
    && Number(audit.quarantined_rows || 0) === 0;
}

function promotableAudit(audit, meetId) {
  return Number(audit.target_meet_count || 0) === 1
    && Number(audit.target_meet_id || 0) === Number(meetId)
    && Number(audit.non_target_event_rows || 0) === 0
    && Number(audit.unmapped_parent_rows || 0) === 0
    && Number(audit.pending_rows || 0) > 0
    && Number(audit.parent_rows || 0) > 0
    && Number(audit.numeric_parent_rows || 0) > 0
    && Number(meetId) > 0;
}

function sourceReturnedNo4x100(audit) {
  return Number(audit.parent_rows || 0) === 0
    || Number(audit.numeric_parent_rows || 0) === 0;
}

function isCleanNoResultError(error) {
  return ['source_not_found', 'source_no_results_published', 'source_returned_no_observations']
    .includes(String(error || ''));
}

class SourceRateLimiter {
  constructor(delayMs = DEFAULT_DELAY_MS) {
    this.delayMs = Math.max(0, Number(delayMs) || 0);
    this.nextAllowedAt = new Map();
    this.chains = new Map();
  }

  run(source, task) {
    const previous = this.chains.get(source) || Promise.resolve();
    const current = previous.catch(() => {}).then(async () => {
      const waitMs = Math.max(0, (this.nextAllowedAt.get(source) || 0) - Date.now());
      if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
      try {
        return await task();
      } finally {
        this.nextAllowedAt.set(source, Date.now() + this.delayMs);
      }
    });
    this.chains.set(source, current.catch(() => {}));
    return current;
  }
}

async function refreshQueue(pool, args) {
  const { rows } = await pool.query(
    'SELECT ingest.refresh_4x100_recovery_queue($1, $2::date, $3::date, $4) AS rows_upserted',
    [args.scope, args.from, args.to, args.season]
  );
  return Number(rows[0]?.rows_upserted || 0);
}

async function narrowToExactTarget(pool, args) {
  const { rowCount } = await pool.query(
    `UPDATE ingest.event_recovery_queue q
        SET status = 'blocked',
            lease_token = NULL,
            leased_until = NULL,
            last_error = 'outside_exact_4x100_target',
            updated_at = now()
       FROM public.meets m
      WHERE q.scope_key = $1
        AND q.meet_id = m.meet_id
        AND q.status <> 'complete'
        AND NOT (
          ($2::text IS NULL OR btrim(m.season) = btrim($2::text))
          AND m.date < current_date
          AND EXISTS (SELECT 1 FROM public.results r WHERE r.meet_id = m.meet_id)
          AND NOT EXISTS (
            SELECT 1
              FROM public.relay_results rr
              JOIN public.event_types et ON et.event_type_id = rr.event_type_id
             WHERE rr.meet_id = m.meet_id
               AND et.code = '4x100m'
               AND rr.mark_seconds IS NOT NULL
          )
        )`,
    [args.scope, args.season || null]
  );
  return rowCount;
}

async function claimJob(pool, args) {
  const { rows } = await pool.query(
    'SELECT * FROM ingest.claim_4x100_recovery_job($1, $2, $3, $4, $5, $6)',
    [args.scope, args.leaseMinutes, args.retryFailed,
      ['auto', 'primary'].includes(args.source) ? null : args.source,
      args.meetId, args.maxAttempts]
  );
  return rows[0] || null;
}

async function loadRun(pool, runId) {
  if (!runId) return null;
  const { rows } = await pool.query(
    'SELECT run_id, source, mode, status, scope FROM ingest.runs WHERE run_id = $1',
    [runId]
  );
  return rows[0] || null;
}

async function attachRun(pool, job, runId, source, audit, sourceStatus, error = null) {
  const { rows } = await pool.query(
    `SELECT ingest.record_4x100_recovery_run(
       $1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9
     ) AS attached`,
    [
      job.job_id,
      job.lease_token,
      runId,
      source,
      sourceStatus,
      Number(audit.parent_rows || 0),
      Number(audit.numeric_parent_rows || 0),
      Number(audit.leg_rows || 0),
      error,
    ]
  );
  if (!rows[0]?.attached) throw new Error(`lease lost while recording job ${job.job_id}`);
}

async function finishJob(pool, job, status, details = {}) {
  const { rows } = await pool.query(
    `SELECT ingest.finish_4x100_recovery_job(
       $1, $2::uuid, $3, $4::uuid, $5, $6, $7, $8, $9, $10, $11
     ) AS finished`,
    [
      job.job_id,
      job.lease_token,
      status,
      details.runId || null,
      details.source || null,
      details.sourceStatus || null,
      Number(details.parentCount || 0),
      Number(details.numericParentCount || 0),
      Number(details.legCount || 0),
      details.error || null,
      Number(details.retryAfterMinutes || 0),
    ]
  );
  if (!rows[0]?.finished) throw new Error(`lease lost while finishing job ${job.job_id}`);
}

async function promoteCleanRun(runId, args, options = {}) {
  if (!args.autoPromote) return null;
  return promoteRun({ runId, env: process.env, ...options });
}

async function runRecoveryImporter(pool, job, selection, args, limiter) {
  return limiter.run(selection.source, async () => {
    if (args.inProcess && selection.source === 'tfrrs') {
      // Lazy-load the importer so discovery/tests do not initialize the full TFRRS client. The
      // shared module stays loaded for the entire worker and owns the response/lookup caches.
      const { run4x100Recovery } = require('../tfrrs/meet-scraper/sync-weekend-results');
      return run4x100Recovery({
        meetId: job.target_meet_id || job.canonical_meet_id || job.meet_id,
        sourceUrl: selection.url,
        ingestPool: pool,
      });
    }

    const command = build4x100ImporterCommand(job, selection);
    return runImporter({
      command: command.command,
      args: [command.script, ...command.args],
      timeoutMs: args.timeoutMs,
      env: process.env,
    });
  });
}

function fullySuccessfulPromotion(promotion) {
  return promotion?.status === 'succeeded'
    && Number(promotion.stats?.quarantined || 0) === 0
    && Number(promotion.stats?.errors || 0) === 0
    // A recovery job cannot be complete when every source observation was already
    // linked elsewhere. That state needs identity review; otherwise a split/duplicate
    // meet can be marked complete while the requested meet still has no relay row.
    && Number(promotion.stats?.relayParents || 0) > 0;
}

function partiallySuccessfulPromotion(promotion) {
  return promotion?.status === 'partial'
    && Number(promotion.stats?.quarantined || 0) > 0
    && Number(promotion.stats?.errors || 0) === 0
    && Number(promotion.stats?.relayParents || 0) > 0;
}

async function processJob(pool, job, args, limiter, summary) {
  const sources = sourceOrder(job, args.source);
  const sourceLabels = sources.map(candidate => candidate.source).join(',') || 'none';
  console.log(`\n[job ${job.job_id}] meet ${job.meet_id} "${job.name || ''}" sources=${sourceLabels} attempt=${job.attempts}`);

  if (job.attempts > args.maxAttempts) {
    summary.exhausted++;
    await finishJob(pool, job, 'exhausted', { error: `maximum attempts exceeded (${args.maxAttempts})` });
    console.log('  status=exhausted reason=max_attempts');
    return;
  }

  if (!sources.length) {
    summary.blocked++;
    const error = noSourceError(job);
    await finishJob(pool, job, 'blocked', { error });
    console.log(`  status=blocked reason=${error}`);
    return;
  }

  let lastRun = null;
  let lastAudit = null;
  let lastSource = null;
  let lastSourceStatus = null;
  let lastError = null;

  // If a process died after staging, recover that exact run first. This is what prevents a restart
  // from spending another source request on the same meet/event.
  if (job.last_run_id && job.last_source) {
    const prior = await loadRun(pool, job.last_run_id);
    if (prior?.mode === 'dry_run' && prior.status === 'succeeded') {
      const audit = await auditRun(pool, job.last_run_id);
      lastRun = prior;
      lastAudit = audit;
      lastSource = job.last_source;
      lastSourceStatus = job.last_source_status || 'results_available';
      console.log(`  resuming staged run ${job.last_run_id} source=${lastSource}`);
      if (!promotableAudit(audit, job.meet_id)) {
        if (!sourceReturnedNo4x100(audit) || Number(audit.quarantined_rows || 0) > 0) {
          summary.review++;
          await finishJob(pool, job, 'needs_review', {
            runId: prior.run_id,
            source: lastSource,
            sourceStatus: lastSourceStatus,
            parentCount: audit.parent_rows,
            numericParentCount: audit.numeric_parent_rows,
            legCount: audit.leg_rows,
            error: 'resumed run requires review',
          });
          console.log('  status=needs_review resumed_audit_not_clean');
          return;
        }
      } else {
        try {
          if (args.autoPromote) {
            const promotion = await promoteCleanRun(prior.run_id, args, {
              allowQuarantines: Number(audit.quarantined_rows || 0) > 0,
            });
            if (!fullySuccessfulPromotion(promotion) && !partiallySuccessfulPromotion(promotion)) {
              summary.review++;
              await finishJob(pool, job, 'needs_review', {
                runId: prior.run_id,
                source: lastSource,
                sourceStatus: lastSourceStatus,
                parentCount: audit.parent_rows,
                numericParentCount: audit.numeric_parent_rows,
                legCount: audit.leg_rows,
                error: `promotion_incomplete:${promotion?.status || 'unknown'}`,
              });
              console.log(`  status=needs_review resumed_promotion=${promotion?.status || 'unknown'}`);
              return;
            }
            if (fullySuccessfulPromotion(promotion)) {
              summary.promoted++;
              // promoteRun() reconciles this event queue row and marks it complete as part
              // of the same successful promotion. Calling finishJob() here would try to
              // update an already-complete lease and falsely report "lease lost".
              console.log('  status=complete resumed_run_promoted=true');
            } else {
              summary.review++;
              console.log('  status=needs_review resumed_run_partially_promoted=true');
            }
          } else {
            summary.review++;
            await finishJob(pool, job, 'needs_review', {
              runId: prior.run_id,
              source: lastSource,
              sourceStatus: lastSourceStatus,
              parentCount: audit.parent_rows,
              numericParentCount: audit.numeric_parent_rows,
              legCount: audit.leg_rows,
              error: 'clean staged run awaiting explicit promotion',
            });
            console.log('  status=needs_review resumed_run_promoted=false');
          }
          return;
        } catch (error) {
          summary.review++;
          await finishJob(pool, job, 'needs_review', {
            runId: prior.run_id,
            source: lastSource,
            sourceStatus: lastSourceStatus,
            parentCount: audit.parent_rows,
            numericParentCount: audit.numeric_parent_rows,
            legCount: audit.leg_rows,
            error: `promotion_failed: ${error.message}`,
          });
          console.log(`  status=needs_review promotion_failed=${error.message}`);
          return;
        }
      }
    }
  }

  for (const selection of sources) {
    if (lastRun && selection.source === lastSource) continue;
    lastSource = selection.source;
    lastSourceStatus = null;
    console.log(`  scraping source=${selection.source} url=${selection.url} event=${EVENT_CODE}`);

    let result;
    try {
      result = await runRecoveryImporter(pool, job, selection, args, limiter);
    } catch (error) {
      lastError = error.message;
      summary.failed++;
      console.log(`  importer_failed source=${selection.source}: ${error.message}`);
      continue;
    }

    summary.scraped++;
    if (!result.runId) {
      const resultError = dryRunError(result);
      if (result.code === 0 && isCleanNoResultError(resultError)) {
        lastError = null;
        lastSourceStatus = resultError;
        console.log(`  importer_exit=0 run_id=none status=${resultError}`);
      } else {
        lastError = resultError;
        summary.failed++;
        console.log(`  importer_exit=${result.code ?? 'unknown'} run_id=${result.runId || 'none'} error=${lastError}`);
      }
      continue;
    }

    const run = await loadRun(pool, result.runId);
    const audit = await auditRun(pool, result.runId);
    const sourceStatus = run?.scope?.source_status || (sourceReturnedNo4x100(audit) ? 'no_4x100_observations' : 'results_available');
    const importerError = result.code === 0 ? null : dryRunError(result);
    await attachRun(pool, job, result.runId, selection.source, audit, sourceStatus, importerError);
    lastRun = run || { run_id: result.runId };
    lastAudit = audit;
    lastSourceStatus = sourceStatus;
    console.log(`  run=${result.runId} parents=${audit.parent_rows} numeric=${audit.numeric_parent_rows} legs=${audit.leg_rows} quarantined=${audit.quarantined_rows}`);

    if (result.code === 0 && promotableAudit(audit, job.meet_id)) {
      try {
        const promotion = await promoteCleanRun(result.runId, args, {
          allowQuarantines: Number(audit.quarantined_rows || 0) > 0,
        });
        if (args.autoPromote) {
          if (!fullySuccessfulPromotion(promotion) && !partiallySuccessfulPromotion(promotion)) {
            summary.review++;
            await finishJob(pool, job, 'needs_review', {
              runId: result.runId,
              source: selection.source,
              sourceStatus,
              parentCount: audit.parent_rows,
              numericParentCount: audit.numeric_parent_rows,
              legCount: audit.leg_rows,
              error: `promotion_incomplete:${promotion?.status || 'unknown'}`,
            });
            console.log(`  status=needs_review promotion=${promotion?.status || 'unknown'}`);
            return;
          }
          if (fullySuccessfulPromotion(promotion)) {
            summary.promoted++;
            // promoteRun() reconciles this event queue row and marks it complete as part
            // of the same successful promotion. Calling finishJob() here would try to
            // update an already-complete lease and falsely report "lease lost".
            console.log(`  status=complete promoted=${promotion?.status || 'succeeded'}`);
          } else {
            summary.review++;
            console.log('  status=needs_review partially_promoted=true');
          }
        } else {
          summary.review++;
          await finishJob(pool, job, 'needs_review', {
            runId: result.runId,
            source: selection.source,
            sourceStatus,
            parentCount: audit.parent_rows,
            numericParentCount: audit.numeric_parent_rows,
            legCount: audit.leg_rows,
            error: 'clean staged run awaiting explicit promotion',
          });
          console.log('  status=needs_review clean_run_staged');
        }
        return;
      } catch (error) {
        summary.review++;
        await finishJob(pool, job, 'needs_review', {
          runId: result.runId,
          source: selection.source,
          sourceStatus,
          parentCount: audit.parent_rows,
          numericParentCount: audit.numeric_parent_rows,
          legCount: audit.leg_rows,
          error: `promotion_failed: ${error.message}`,
        });
        console.log(`  status=needs_review promotion_failed=${error.message}`);
        return;
      }
    }

    if (result.code !== 0 && !sourceReturnedNo4x100(audit)) {
      summary.review++;
      await finishJob(pool, job, 'needs_review', {
        runId: result.runId,
        source: selection.source,
        sourceStatus,
        parentCount: audit.parent_rows,
        numericParentCount: audit.numeric_parent_rows,
        legCount: audit.leg_rows,
        error: importerError || 'importer reported a failure after staging observations',
      });
      console.log(`  status=needs_review importer_exit=${result.code}`);
      return;
    }

    // A source can publish DNS/DNF relay rows whose legs are not resolvable, but
    // those rows cannot satisfy this recovery queue because there is no numeric
    // 4x100 mark to promote. Only quarantine a source response for review when
    // it actually contains a numeric parent that needs identity/data review.
    if (!sourceReturnedNo4x100(audit)
      || (Number(audit.quarantined_rows || 0) > 0 && Number(audit.numeric_parent_rows || 0) > 0)) {
      summary.review++;
      await finishJob(pool, job, 'needs_review', {
        runId: result.runId,
        source: selection.source,
        sourceStatus,
        parentCount: audit.parent_rows,
        numericParentCount: audit.numeric_parent_rows,
        legCount: audit.leg_rows,
        error: 'source returned observations that are not safe for automatic promotion',
      });
      console.log('  status=needs_review source_observations_require_review');
      return;
    }

    console.log(`  source=${selection.source} produced no usable numeric 4x100; trying next verified source`);
  }

  const terminalStatus = lastError
    ? 'needs_review'
    : job.attempts >= args.maxAttempts ? 'exhausted' : 'not_found';
  if (terminalStatus === 'needs_review') summary.review++;
  else if (terminalStatus === 'exhausted') summary.exhausted++;
  else summary.not_found++;
  await finishJob(pool, job, terminalStatus, {
    runId: lastRun?.run_id || null,
    source: lastSource,
    sourceStatus: lastSourceStatus,
    parentCount: lastAudit?.parent_rows || 0,
    numericParentCount: lastAudit?.numeric_parent_rows || 0,
    legCount: lastAudit?.leg_rows || 0,
    error: lastError || 'verified sources did not publish a usable numeric 4x100',
  });
  console.log(`  status=${terminalStatus} error=${lastError || 'no_numeric_4x100'}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.discoverOnly && !args.discoverSources) {
    throw new Error('--discover-only requires --discover-sources');
  }
  // Local CLI runs commonly keep DB_PASSWORD in the root .env rather than a full private URL.
  // Resolve it before opening the worker pool, while still preserving any explicit URL.
  ensureIngestDatabaseUrl();
  const url = connectionString();
  if (!url) throw new Error('INGEST_DATABASE_URL is required for 4x100 background recovery');

  const pool = new Pool({
    connectionString: url,
    max: Math.max(4, args.concurrency + 2),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    application_name: 'trackhub-4x100-background',
    ssl: process.env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  const summary = {
    refreshed: 0,
    claimed: 0,
    scraped: 0,
    promoted: 0,
    review: 0,
    blocked: 0,
    not_found: 0,
    exhausted: 0,
    failed: 0,
  };

  try {
    summary.refreshed = args.skipRefresh ? 0 : await refreshQueue(pool, args);
    if (args.exactTarget) {
      summary.narrowed = await narrowToExactTarget(pool, args);
    }
    console.log(`4x100 background recovery: scope=${args.scope} range=${args.from}..${args.to}`);
    console.log(`  refreshed_jobs=${summary.refreshed}${args.skipRefresh ? ' (skipped)' : ''} source=${args.source} concurrency=${args.concurrency} in_process=${args.inProcess} auto_promote=${args.autoPromote}`);
    if (args.exactTarget) console.log(`  exact_target_filter_blocked=${summary.narrowed}`);
    if (!args.autoPromote) console.log('  public facts will not be written; clean runs end in needs_review');

    if (args.discoverSources) {
      summary.discovery = await discoverSources(pool, {
        ...args,
        season: args.season || 'Outdoor 2026',
        stage: true,
      });
      if (args.discoverOnly) {
        console.log(`\n4X100 SOURCE DISCOVERY DONE: ${JSON.stringify(summary.discovery)}`);
        return summary;
      }
    }

    const limiter = new SourceRateLimiter(args.delayMs);
    let claimedJobs = 0;
    let claimLock = Promise.resolve();
    const claimNext = async () => {
      // Multiple workers can ask for work at the same time. Serialize the counter check with
      // the claim so --max-jobs remains a hard bound instead of allowing a race to over-claim.
      const previous = claimLock;
      let release;
      claimLock = new Promise(resolve => { release = resolve; });
      await previous;
      try {
        if (args.maxJobs && claimedJobs >= args.maxJobs) return null;
        const job = await claimJob(pool, args);
        if (!job) return null;
        claimedJobs++;
        summary.claimed++;
        return job;
      } finally {
        release();
      }
    };

    const worker = async () => {
      while (true) {
        const job = await claimNext();
        if (!job) return;
        try {
          await processJob(pool, job, args, limiter, summary);
        } catch (error) {
          summary.failed++;
          console.error(`  job ${job.job_id} failed: ${error.message}`);
          try {
            await finishJob(pool, job, 'needs_review', { error: `worker_error: ${error.message}` });
          } catch (finishError) {
            console.error(`  could not finish job ${job.job_id}: ${finishError.message}`);
          }
        }
      }
    };

    await Promise.all(Array.from({ length: args.concurrency }, worker));
    console.log(`\n4X100 BACKGROUND RECOVERY DONE: ${JSON.stringify(summary)}`);
    return summary;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`4x100 background recovery failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  EVENT_CODE,
  SourceRateLimiter,
  build4x100ImporterCommand,
  cleanAudit,
  connectionString,
  filterSourceCandidates: sourceOrder,
  parseArgs,
  sourceReturnedNo4x100,
  sourceUrlForJob,
  noSourceError,
  isCleanNoResultError,
  fullySuccessfulPromotion,
  partiallySuccessfulPromotion,
  promotableAudit,
  refreshQueue,
  claimJob,
  runRecoveryImporter,
  sourceOrder,
};
