#!/usr/bin/env node
/**
 * Discover verified TFRRS/Athletic.net sources for known database meets missing 4x100.
 *
 * This module never writes public meets or results. It only enriches the private
 * ingest.event_recovery_queue, after matching a source meet to an existing meet by
 * normalized name plus date/year and location evidence where available.
 */

const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { Pool } = require('pg');
const { AthleticNetSearchClient } = require('../athletic-net/athletic_net_api');
const { validCandidate } = require('./run_recovery_batch');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DEFAULT_FROM = '2026-04-01';
const DEFAULT_TO = '2026-06-27';
const DEFAULT_DELAY_MS = 700;
const DEFAULT_MAX_PAGES = 250;
const USER_AGENT = 'TrackMeetTracker/1.0 (+4x100 recovery source discovery)';

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
  const scope = valueAfter(argv, '--scope');
  if (!scope || !scope.trim()) throw new Error('--scope is required');
  const from = isoDate(valueAfter(argv, '--from') || DEFAULT_FROM, '--from');
  const to = isoDate(valueAfter(argv, '--to') || DEFAULT_TO, '--to');
  if (from > to) throw new Error('--from must be on or before --to');
  const source = valueAfter(argv, '--source') || 'auto';
  if (!['auto', 'primary', 'tfrrs', 'athletic_net'].includes(source)) {
    throw new Error('--source must be auto, primary, tfrrs, or athletic_net');
  }
  return {
    scope: scope.trim(),
    season: valueAfter(argv, '--season') || 'Outdoor 2026',
    from,
    to,
    source,
    meetId: positiveInteger(valueAfter(argv, '--meet'), '--meet', null),
    limit: positiveInteger(valueAfter(argv, '--limit'), '--limit', 0),
    delayMs: nonNegativeInteger(valueAfter(argv, '--delay-ms'), '--delay-ms', DEFAULT_DELAY_MS),
    maxPages: positiveInteger(valueAfter(argv, '--max-pages'), '--max-pages', DEFAULT_MAX_PAGES),
    blockedOnly: argv.includes('--blocked-only'),
    stage: argv.includes('--stage'),
  };
}

function normalizeMeetName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b20\d\d\b/g, ' ')
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLocation(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function locationTokens(value) {
  return new Set(normalizeLocation(value)
    .split(' ')
    .filter(token => token.length > 1 && !['the', 'and', 'of', 'at', 'in', 'on'].includes(token)));
}

function locationOverlap(left, right) {
  const a = locationTokens(left);
  const b = locationTokens(right);
  return [...a].filter(token => b.has(token));
}

function parseTfrrsDate(value) {
  const text = String(value || '').trim().replace(/\s+/g, '');
  // TFRRS publishes single dates and ranges such as 01/31-02/01/26 or
  // 04/24-25/26. We only need the first day for the date-window match.
  const match = text.match(/^(\d{1,2})\/(\d{1,2})(?:-(?:\d{1,2}\/)?\d{1,2})?\/(\d{2,4})$/);
  if (!match) return null;
  const year = match[3].length === 2 ? (Number(match[3]) >= 50 ? `19${match[3]}` : `20${match[3]}`) : match[3];
  return `${year}-${String(match[1]).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}`;
}

function parseTfrrsSearchPage(html) {
  const $ = cheerio.load(html);
  const rows = [];
  $('table tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 2) return;
    const date = parseTfrrsDate($(cells[0]).text());
    const link = $(cells[1]).find('a[href*="/results/"]').first();
    if (!date || !link.length) return;
    const href = link.attr('href') || '';
    const id = href.match(/\/results\/(\d+)/)?.[1];
    const name = link.text().replace(/\s+/g, ' ').trim();
    if (!id || !name) return;
    rows.push({
      source: 'tfrrs',
      tfrrs_id: id,
      name,
      date,
      url: `https://www.tfrrs.org/results/${id}`,
    });
  });
  return rows;
}

function parseTfrrsLocation(html) {
  const $ = cheerio.load(html);
  return $('.panel-heading-normal-text')
    .map((_, element) => $(element).text().replace(/\s+/g, ' ').trim())
    .get()
    .find(value => value && !parseTfrrsDate(value) && /,|\s-\s/.test(value)) || null;
}

function dateDistanceDays(left, right) {
  const a = new Date(`${left}T12:00:00Z`);
  const b = new Date(`${right}T12:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return Infinity;
  return Math.abs(Math.round((a - b) / 86400000));
}

function targetDateMatches(target, candidate, toleranceDays = 3) {
  const start = target.date;
  const end = target.end_date || target.date;
  return dateDistanceDays(start, candidate.date) <= toleranceDays
    || dateDistanceDays(end, candidate.date) <= toleranceDays
    || (candidate.date >= start && candidate.date <= end);
}

function sourceCandidate(row, source) {
  if (source === 'tfrrs') return row?.source_candidates?.tfrrs_url || null;
  if (source === 'athletic_net') return row?.source_candidates?.athletic_net_results_url || null;
  return null;
}

function discoveryOrder(requested) {
  return requested === 'auto' || requested === 'primary'
    ? ['tfrrs', 'athletic_net']
    : [requested];
}

function chooseExactTfrrsCandidate(target, candidates) {
  const matches = (candidates || [])
    .filter(candidate => normalizeMeetName(candidate.name) === normalizeMeetName(target.name))
    .filter(candidate => targetDateMatches(target, candidate));
  if (matches.length !== 1) {
    return {
      status: matches.length ? 'ambiguous' : 'not_found',
      reason: matches.length ? 'multiple_exact_name_date_candidates' : 'no_exact_name_date_candidate',
      candidate_count: matches.length,
      candidates: matches,
    };
  }
  return { status: 'verified', candidate: matches[0], method: 'exact_normalized_name_and_date_window' };
}

async function verifyTfrrsCandidateLocation(target, candidate, get, cache = new Map()) {
  const targetLocation = normalizeLocation(target.location);
  if (!targetLocation || targetLocation === 'unknown') {
    return { status: 'ambiguous', reason: 'target_location_unavailable' };
  }

  let candidateLocation = cache.get(candidate.url);
  if (candidateLocation === undefined) {
    const response = await get(candidate.url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 30000,
    });
    candidateLocation = parseTfrrsLocation(response.data);
    cache.set(candidate.url, candidateLocation || null);
  }
  if (!candidateLocation) {
    return { status: 'ambiguous', reason: 'candidate_location_unavailable' };
  }

  const overlap = locationOverlap(target.location, candidateLocation);
  if (!overlap.length) {
    return {
      status: 'not_found',
      reason: 'tfrrs_location_mismatch',
      candidate_location: candidateLocation,
    };
  }
  return {
    status: 'verified',
    method: 'exact_normalized_name_date_and_location_overlap',
    candidate_location: candidateLocation,
    location_overlap: overlap,
  };
}

function athleticCandidateLocation(doc) {
  return String(doc?.subtext || '').split('||').slice(-1)[0].trim();
}

function chooseAthleticCandidate(target, docs) {
  const targetYear = String(target.date || '').slice(0, 4);
  const exact = (docs || [])
    .filter(doc => doc?.type === 'TFMeet')
    .filter(doc => Number.isInteger(Number(doc.id_db)) && Number(doc.id_db) > 0)
    .filter(doc => normalizeMeetName(doc.textsuggest) === normalizeMeetName(target.name))
    .filter(doc => String(doc.tf || '').includes(targetYear));
  if (exact.length === 1) {
    return { status: 'verified', candidate: exact[0], method: 'exact_normalized_name_and_year' };
  }
  if (!exact.length) {
    return { status: 'not_found', reason: 'no_exact_name_year_candidate', candidate_count: 0 };
  }

  const ranked = exact
    .map(candidate => ({ candidate, overlap: locationOverlap(target.location, athleticCandidateLocation(candidate)) }))
    .sort((a, b) => b.overlap.length - a.overlap.length);
  if (ranked[0].overlap.length > 0 && ranked[0].overlap.length > ranked[1].overlap.length) {
    return {
      status: 'verified',
      candidate: ranked[0].candidate,
      method: 'exact_normalized_name_year_and_unique_location_overlap',
      location_overlap: ranked[0].overlap,
    };
  }
  return { status: 'ambiguous', reason: 'multiple_exact_name_year_candidates', candidate_count: exact.length };
}

function athleticMeetUrl(doc) {
  if (!doc?.id_db || doc.type !== 'TFMeet') return null;
  return `https://www.athletic.net/TrackAndField/meet/${doc.id_db}/results`;
}

async function crawlTfrrsIndex({ from, to, delayMs = DEFAULT_DELAY_MS, maxPages = DEFAULT_MAX_PAGES, get = axios.get }) {
  const rows = [];
  const seen = new Set();
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 3);
  end.setUTCDate(end.getUTCDate() + 3);

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await get(`https://www.tfrrs.org/results_search.html?page=${page}`, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 30000,
    });
    const parsed = parseTfrrsSearchPage(response.data);
    if (!parsed.length) break;
    let oldestOnPage = null;
    for (const row of parsed) {
      const date = new Date(`${row.date}T12:00:00Z`);
      if (!oldestOnPage || date < oldestOnPage) oldestOnPage = date;
      if (date >= start && date <= end && !seen.has(row.url)) {
        seen.add(row.url);
        rows.push(row);
      }
    }
    if (oldestOnPage && oldestOnPage < start) break;
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return rows;
}

async function loadTargets(pool, args) {
  const { rows } = await pool.query(
    `WITH target_event AS (
       SELECT event_type_id FROM public.event_types WHERE code = '4x100m' ORDER BY event_type_id LIMIT 1
     ), target_queue AS MATERIALIZED (
       SELECT q.job_id, q.meet_id, q.status, q.source_candidates,
              m.name, m.date::text AS date, m.end_date::text AS end_date, m.location
         FROM ingest.event_recovery_queue q
         JOIN public.meets m ON m.meet_id = q.meet_id
        WHERE q.scope_key = $1
          AND m.season = $2
          AND m.date BETWEEN $3::date AND $4::date
          AND m.date < current_date
          AND ($5::integer IS NULL OR m.meet_id = $5::integer)
          AND ($6::boolean IS FALSE OR q.status = 'blocked')
          AND q.status NOT IN ('complete', 'in_progress', 'needs_review')
     ), individual AS (
       SELECT r.meet_id, count(*)::integer AS individual_rows
         FROM public.results r
         JOIN target_queue t ON t.meet_id = r.meet_id
        GROUP BY r.meet_id
     ), relay AS (
       SELECT rr.meet_id,
              count(*) FILTER (WHERE rr.event_type_id = target_event.event_type_id AND rr.mark_seconds IS NOT NULL)::integer AS numeric_4x100
         FROM public.relay_results rr
         JOIN target_queue t ON t.meet_id = rr.meet_id
         CROSS JOIN target_event
        GROUP BY rr.meet_id
     )
     SELECT t.job_id, t.meet_id, t.status, t.source_candidates,
            t.name, t.date, t.end_date, t.location,
            COALESCE(i.individual_rows, 0)::integer AS individual_rows,
            COALESCE(r.numeric_4x100, 0)::integer AS numeric_4x100
       FROM target_queue t
       JOIN individual i ON i.meet_id = t.meet_id
       LEFT JOIN relay r ON r.meet_id = t.meet_id
      WHERE COALESCE(r.numeric_4x100, 0) = 0
        AND COALESCE(i.individual_rows, 0) > 0
      ORDER BY t.date, t.meet_id
      ${args.limit ? 'LIMIT $7' : ''}`,
    args.limit
      ? [args.scope, args.season, args.from, args.to, args.meetId, Boolean(args.blockedOnly), args.limit]
      : [args.scope, args.season, args.from, args.to, args.meetId, Boolean(args.blockedOnly)]
  );
  return rows;
}

async function stageCandidate(pool, target, source, candidate, verification) {
  const url = source === 'tfrrs' ? candidate.url : (candidate.url || athleticMeetUrl(candidate));
  if (!validCandidate(source, url)) throw new Error(`invalid discovered ${source} URL: ${url}`);
  const metadataKey = source === 'tfrrs' ? 'tfrrs_discovery' : 'athletic_net_discovery';
  const sourceKey = source === 'tfrrs' ? 'tfrrs_url' : 'athletic_net_results_url';
  const payload = {
    [sourceKey]: url,
    [metadataKey]: {
      status: 'verified',
      method: verification.method,
      source_name: candidate.name || candidate.textsuggest,
      source_date: candidate.date || String(candidate.tf || ''),
      source_id: candidate.tfrrs_id || String(candidate.id_db || ''),
      location_overlap: verification.location_overlap || [],
      verified_at: new Date().toISOString(),
    },
  };
  const { rows } = await pool.query(
    `UPDATE ingest.event_recovery_queue
        SET source_candidates = COALESCE(source_candidates, '{}'::jsonb) || $2::jsonb,
            status = CASE WHEN status IN ('blocked', 'not_found', 'exhausted') THEN 'queued' ELSE status END,
            attempts = CASE WHEN status IN ('blocked', 'not_found', 'exhausted') THEN 0 ELSE attempts END,
            last_error = CASE WHEN status IN ('blocked', 'not_found', 'exhausted') THEN NULL ELSE last_error END,
            next_attempt_at = CASE WHEN status IN ('blocked', 'not_found', 'exhausted') THEN now() ELSE next_attempt_at END,
            updated_at = now()
      WHERE job_id = $1
        AND status NOT IN ('complete', 'in_progress', 'needs_review')
      RETURNING job_id`,
    [target.job_id, JSON.stringify(payload)]
  );
  return { staged: rows.length === 1, url, payload };
}

async function recordDiscovery(pool, target, result) {
  const key = 'source_discovery';
  const payload = {
    status: result.status,
    reason: result.reason || null,
    candidate_count: result.candidate_count || 0,
    attempted_at: new Date().toISOString(),
  };
  await pool.query(
    `UPDATE ingest.event_recovery_queue
        SET source_candidates = COALESCE(source_candidates, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb),
            updated_at = now()
      WHERE job_id = $1
        AND status NOT IN ('complete', 'in_progress', 'needs_review')`,
    [target.job_id, key, JSON.stringify(payload)]
  );
}

async function discoverSources(pool, args, dependencies = {}) {
  const targets = await loadTargets(pool, args);
  const get = dependencies.get || axios.get;
  const athleticClient = dependencies.athleticClient || new AthleticNetSearchClient({
    minDelayMs: Math.max(250, args.delayMs),
    maxRetries: 2,
    timeoutMs: 15000,
  });
  const tfrrsLocationCache = new Map();
  const order = discoveryOrder(args.source);
  const summary = { selected: targets.length, verified: 0, not_found: 0, ambiguous: 0, failed: 0, staged: 0, by_source: {} };
  const needsTfrrs = order.includes('tfrrs') && targets.some(target => !validCandidate('tfrrs', sourceCandidate(target, 'tfrrs')));
  let tfrrsIndex = [];
  if (needsTfrrs) {
    try {
      tfrrsIndex = await crawlTfrrsIndex({
        from: args.from,
        to: args.to,
        delayMs: args.delayMs,
        maxPages: args.maxPages,
        get,
      });
    } catch (error) {
      // TFRRS is one discovery source, not a prerequisite for AthleticLIVE fallback. Record the
      // failure and continue so one unavailable index cannot strand every remaining meet.
      summary.failed++;
      console.error(`  TFRRS index unavailable; continuing with fallback sources: ${error.code || error.message}`);
    }
  }

  for (const target of targets) {
    let found = null;
    let lastResult = { status: 'not_found', reason: 'no_source_strategy_succeeded' };
    for (const source of order) {
      const existing = sourceCandidate(target, source);
      if (validCandidate(source, existing)) {
        found = { source, candidate: source === 'tfrrs'
          ? { name: target.name, date: target.date, url: existing, tfrrs_id: existing.match(/\/results\/(\d+)/)?.[1] }
          : { type: 'TFMeet', id_db: existing.match(/\/meets?\/(\d+)/i)?.[1], textsuggest: target.name, url: existing }, method: 'existing_verified_queue_candidate' };
        break;
      }

      try {
        const result = source === 'tfrrs'
          ? chooseExactTfrrsCandidate(target, tfrrsIndex)
          : chooseAthleticCandidate(target, (await athleticClient.search(target.name, { sport: 'tf', rows: 50 })).response?.docs || []);
        lastResult = result;
        if (result.status === 'verified') {
          if (source === 'tfrrs') {
            const locationResult = await verifyTfrrsCandidateLocation(
              target,
              result.candidate,
              get,
              tfrrsLocationCache
            );
            if (locationResult.status !== 'verified') {
              lastResult = locationResult;
              continue;
            }
            found = {
              source,
              candidate: result.candidate,
              method: locationResult.method,
              location_overlap: locationResult.location_overlap,
            };
          } else {
            found = { source, candidate: result.candidate, method: result.method, location_overlap: result.location_overlap };
          }
          break;
        }
        if (result.status === 'ambiguous') break;
      } catch (error) {
        lastResult = { status: 'failed', reason: `${source}_search_failed:${error.code || error.message}` };
        summary.failed++;
      }
    }

    if (found) {
      try {
        const staged = args.stage ? await stageCandidate(pool, target, found.source, found.candidate, found) : { staged: false };
        summary.verified++;
        summary.by_source[found.source] = (summary.by_source[found.source] || 0) + 1;
        if (staged.staged) summary.staged++;
        console.log(`  ${args.stage ? 'STAGED' : 'VERIFIED'} #${target.meet_id} ${target.date} ${target.name} -> ${found.source} ${staged.url || (found.candidate.url || athleticMeetUrl(found.candidate))}`);
      } catch (error) {
        summary.failed++;
        const failure = {
          status: 'failed',
          reason: `stage_${found.source}_failed:${error.code || error.message}`,
        };
        await recordDiscovery(pool, target, failure);
        console.log(`  FAILED #${target.meet_id} ${target.date} ${target.name}: ${failure.reason}`);
      }
      continue;
    }

    if (lastResult.status === 'ambiguous') summary.ambiguous++;
    else if (lastResult.status === 'not_found') summary.not_found++;
    await recordDiscovery(pool, target, lastResult);
    console.log(`  ${lastResult.status.toUpperCase()} #${target.meet_id} ${target.date} ${target.name}: ${lastResult.reason}`);
  }

  console.log(`4x100 source discovery: scope=${args.scope} season=${args.season} selected=${summary.selected} staged=${args.stage}`);
  console.log(JSON.stringify(summary));
  if (!args.stage) console.log('(report only — pass --stage to update the private recovery queue)');
  return summary;
}

function connectionString(env = process.env) {
  return env.INGEST_DATABASE_URL || env.DATABASE_URL || null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = new Pool({
    connectionString: connectionString(),
    max: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    application_name: 'trackhub-4x100-source-discovery',
    ssl: { rejectUnauthorized: false },
  });
  try {
    return await discoverSources(pool, args);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`4x100 source discovery failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  athleticCandidateLocation,
  chooseAthleticCandidate,
  chooseExactTfrrsCandidate,
  crawlTfrrsIndex,
  dateDistanceDays,
  discoverSources,
  locationOverlap,
  normalizeLocation,
  normalizeMeetName,
  parseTfrrsLocation,
  parseArgs,
  parseTfrrsDate,
  parseTfrrsSearchPage,
  sourceCandidate,
  targetDateMatches,
  verifyTfrrsCandidateLocation,
};
