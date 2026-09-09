#!/usr/bin/env node
/**
 * Discover verified TFRRS candidates for the private recovery queue.
 *
 * This is deliberately separate from public-meet link matching. It only reads the cached TFRRS
 * index, verifies candidate pages, and optionally stages verified links in ingest.recovery_queue.
 * It never writes public.meets, public.results, public.relay_results, or public source links.
 *
 *   node discover_tfrrs_candidates.js --scope 2025-26
 *   node discover_tfrrs_candidates.js --scope 2025-26 --stage
 */

const path = require('path');
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const INDEX_PATH = path.join(__dirname, '../tfrrs-meet-index.json');
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function value(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  const scope = value(argv, '--scope');
  const limitValue = value(argv, '--limit');
  const limit = limitValue == null ? 0 : Number.parseInt(limitValue, 10);
  if (!scope) throw new Error('Usage: node discover_tfrrs_candidates.js --scope <key> [--limit N] [--stage]');
  if (!Number.isInteger(limit) || limit < 0) throw new Error('--limit must be a non-negative integer');
  return { scope, limit, stage: argv.includes('--stage') };
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b20\d\d\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const DISCRIMINATING = /\b(ten|west|east|north|south|12|10|big|sky|american|usa|atlantic|pacific|mountain|summit|patriot|ivy|colonial|horizon|missouri|valley|sun|belt|southland|caa|mac|mavc|wac|gnac|riverside|northeast|northwest|southeast|southwest|i{1,3}|iv|division)\b/g;

function discriminatingTokens(value) {
  return new Set(normalizeName(value).match(DISCRIMINATING) || []);
}

function tokenDisagreement(left, right) {
  const a = discriminatingTokens(left);
  const b = discriminatingTokens(right);
  return [...new Set([
    ...[...a].filter(token => !b.has(token)),
    ...[...b].filter(token => !a.has(token))
  ])].sort();
}

function dateVariants(date) {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return [];
  const monthLong = d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const monthShort = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = d.getUTCDate();
  return [
    `${monthLong} ${day}`,
    `${monthShort} ${day}`,
    `${monthLong} ${String(day).padStart(2, '0')}`,
    `${monthShort} ${String(day).padStart(2, '0')}`,
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  ];
}

function pageContainsDate(pageText, date, toleranceDays = 3) {
  const normalizedText = String(pageText || '').replace(/\s+/g, ' ');
  const base = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) return false;
  for (let offset = -toleranceDays; offset <= toleranceDays; offset += 1) {
    const candidate = new Date(base);
    candidate.setUTCDate(candidate.getUTCDate() + offset);
    const candidateDate = candidate.toISOString().slice(0, 10);
    const variants = dateVariants(candidateDate);
    if (variants.some(variant => new RegExp(`\\b${variant.replace(' ', '\\s+')}\\b`, 'i').test(normalizedText))) {
      return true;
    }
    const [year, month, day] = candidateDate.split('-');
    if (new RegExp(`\\b${month}[/-]0?${Number(day)}[/-]${year}\\b`).test(normalizedText)) return true;
  }
  return false;
}

function connectionString(env = process.env) {
  if (env.INGEST_DATABASE_URL) return env.INGEST_DATABASE_URL;
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const apiUrl = env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
  if (!apiUrl || !env.DB_PASSWORD) throw new Error('INGEST_DATABASE_URL or DATABASE_URL or Supabase URL + DB_PASSWORD is required');
  const projectRef = new URL(apiUrl).hostname.split('.')[0];
  return `postgresql://postgres.${projectRef}:${encodeURIComponent(env.DB_PASSWORD)}@aws-0-us-west-2.pooler.supabase.com:5432/postgres`;
}

function loadIndex(file = INDEX_PATH) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const byName = new Map();
  for (const row of rows) {
    const key = normalizeName(row.name);
    if (!key || !row.url) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(row);
  }
  return byName;
}

async function verifyCandidate(candidate, meet) {
  const disagreement = tokenDisagreement(meet.name, candidate.name);
  if (disagreement.length) {
    return { status: 'rejected', reason: 'discriminating_name_token_mismatch', disagreement };
  }
  try {
    const response = await axios.get(candidate.url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 25000,
      validateStatus: status => status >= 200 && status < 400
    });
    const pageText = cheerio.load(response.data)('body').text();
    if (!pageContainsDate(pageText, meet.date)) {
      return { status: 'rejected', reason: 'candidate_page_date_not_verified' };
    }
    return {
      status: 'verified',
      method: 'exact_normalized_name_plus_page_date_within_3_days',
      verified_name: candidate.name,
      verified_date: meet.date,
      verified_at: new Date().toISOString()
    };
  } catch (error) {
    return { status: 'rejected', reason: `candidate_fetch_failed:${error.code || 'request_error'}` };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const byName = loadIndex();
  const pool = new Pool({
    connectionString: connectionString(),
    max: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    application_name: 'trackhub-recovery-tfrrs-discovery',
    ssl: { rejectUnauthorized: false }
  });

  try {
    const { rows } = await pool.query(`
      select q.queue_id, q.meet_id, q.source_candidates, m.name, m.date::text as date
      from ingest.recovery_queue q
      join public.meets m on m.meet_id = q.meet_id
      where q.scope_key = $1
        and q.status = 'queued'
        and m.tfrrs_url is null
        and coalesce(q.source_candidates->>'tfrrs_url', '') = ''
      order by q.priority desc, m.date desc, q.meet_id
      ${args.limit ? 'limit $2' : ''}
    `, args.limit ? [args.scope, args.limit] : [args.scope]);

    const results = [];
    for (const meet of rows) {
      const candidates = byName.get(normalizeName(meet.name)) || [];
      if (candidates.length !== 1) {
        results.push({ meet, status: 'not_verified', reason: candidates.length ? 'ambiguous_index_name' : 'no_exact_index_name', candidate_count: candidates.length });
        continue;
      }
      const candidate = candidates[0];
      const verification = await verifyCandidate(candidate, meet);
      results.push({ meet, candidate, ...verification });
      if (verification.status === 'verified') {
        console.log(`  VERIFIED #${meet.meet_id} ${meet.date} ${meet.name} -> ${candidate.url}`);
        if (args.stage) {
          await pool.query(`
            update ingest.recovery_queue
            set source_candidates = coalesce(source_candidates, '{}'::jsonb) || $1::jsonb,
                updated_at = now()
            where queue_id = $2
              and status = 'queued'
              and coalesce(source_candidates->>'tfrrs_url', '') = ''
          `, [JSON.stringify({
            tfrrs_url: candidate.url,
            tfrrs_verified_name: candidate.name,
            tfrrs_verified_date: meet.date,
            tfrrs_verification_method: verification.method,
            tfrrs_verified_at: verification.verified_at
          }), meet.queue_id]);
        }
      }
      await sleep(400);
    }

    const counts = results.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});
    console.log(`TFRRS queue discovery: scope=${args.scope} selected=${rows.length} staged=${args.stage}`);
    console.log(JSON.stringify(counts));
    if (!args.stage) console.log('(report only — pass --stage to update private recovery candidates)');
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`TFRRS queue discovery failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  normalizeName,
  tokenDisagreement,
  pageContainsDate,
  connectionString,
  loadIndex,
  verifyCandidate
};
