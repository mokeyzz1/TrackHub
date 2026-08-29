#!/usr/bin/env node
/**
 * Promote reviewed AthleticLIVE source keys when the source identity resolves to one existing
 * Athletic.net profile. This writes only ingest.athlete_aliases; it never changes public athletes,
 * results, names, schools, or provenance.
 *
 * A manifest is required so API recommendations are explicitly reviewed before promotion.
 * Dry-run is the default; add --commit only after the printed plan contains only inserts or
 * already-active aliases.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { ensureIngestDatabaseUrl } = require('../shared/private_database_url');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const DEFAULT_MANIFEST = path.join(__dirname, 'source-profile-alias-decisions-11727.json');

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  return {
    manifest: valueAfter(argv, '--manifest') || DEFAULT_MANIFEST,
    commit: argv.includes('--commit'),
  };
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[()'’.,-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesCompatible(sourceName, targetName) {
  const source = normalizeName(sourceName);
  const target = normalizeName(targetName);
  return Boolean(source && target && (
    source === target || source.endsWith(` ${target}`) || target.endsWith(` ${source}`)
  ));
}

function profileUrl(profileId) {
  return `https://www.athletic.net/athlete/${String(profileId).trim()}/track-and-field`;
}

function readManifest(filePath) {
  const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!manifest || manifest.manifest_version !== 1 || !Array.isArray(manifest.decisions)) {
    throw new Error('manifest must contain manifest_version: 1 and a decisions array');
  }
  const seen = new Set();
  for (const decision of manifest.decisions) {
    for (const field of [
      'source_athlete_key', 'source_athlete_name', 'source_gender',
      'target_athlete_id', 'athletic_net_profile_id'
    ]) {
      if (!String(decision[field] || '').trim()) throw new Error(`manifest decision missing ${field}`);
    }
    if (!['M', 'F'].includes(decision.source_gender)) {
      throw new Error(`invalid source_gender for ${decision.source_athlete_key}`);
    }
    if (decision.match_method !== 'verified_source_profile') {
      throw new Error(`invalid match_method for ${decision.source_athlete_key}`);
    }
    if (!Array.isArray(decision.evidence) || decision.evidence.length < 3) {
      throw new Error(`at least three evidence items are required: ${decision.source_athlete_key}`);
    }
    const key = String(decision.source_athlete_key).trim();
    if (seen.has(key)) throw new Error(`duplicate source key: ${key}`);
    seen.add(key);
  }
  return manifest;
}

function buildPlan(decisions, { targets = [], profileMatches = [], aliases = [] } = {}) {
  const targetsById = new Map(targets.map(row => [Number(row.athlete_id), row]));
  const profilesByUrl = new Map();
  for (const row of profileMatches) {
    const url = String(row.athletic_net_url || '').replace(/\/$/, '');
    if (!url) continue;
    if (!profilesByUrl.has(url)) profilesByUrl.set(url, []);
    profilesByUrl.get(url).push(row);
  }
  const aliasesByKey = new Map(aliases.map(row => [String(row.source_athlete_key).trim(), row]));

  return decisions.map(decision => {
    const sourceKey = String(decision.source_athlete_key).trim();
    const targetId = Number(decision.target_athlete_id);
    const target = targetsById.get(targetId);
    const url = profileUrl(decision.athletic_net_profile_id);
    const owners = profilesByUrl.get(url) || [];
    const alias = aliasesByKey.get(sourceKey) || null;
    const base = {
      source: 'athletic_net',
      source_athlete_key: sourceKey,
      source_athlete_name: decision.source_athlete_name,
      source_gender: decision.source_gender,
      target_athlete_id: targetId,
      athletic_net_profile_id: String(decision.athletic_net_profile_id).trim(),
      athletic_net_url: url,
      evidence: decision.evidence,
      notes: decision.notes || null,
      target,
      alias,
    };

    if (!target) return { ...base, action: 'hold', reason: 'target_athlete_not_found' };
    if (target.gender !== decision.source_gender) {
      return { ...base, action: 'hold', reason: 'target_gender_mismatch' };
    }
    if (String(target.athletic_net_url || '').replace(/\/$/, '') !== url) {
      return { ...base, action: 'hold', reason: 'target_profile_url_mismatch' };
    }
    if (owners.length !== 1 || Number(owners[0].athlete_id) !== targetId) {
      return { ...base, action: 'hold', reason: 'profile_url_not_unique', profile_owners: owners };
    }
    if (!namesCompatible(decision.source_athlete_name, target.full_name)) {
      return { ...base, action: 'hold', reason: 'target_name_mismatch' };
    }
    if (alias && Number(alias.target_athlete_id) !== targetId) {
      return { ...base, action: 'hold', reason: 'existing_alias_conflict' };
    }
    if (alias && alias.status === 'active') {
      return { ...base, action: 'already_active', reason: 'existing_alias_matches' };
    }
    return { ...base, action: 'insert_alias', reason: 'verified_unique_source_profile' };
  });
}

async function loadState(pool, manifest) {
  const ids = manifest.decisions.map(row => Number(row.target_athlete_id));
  const urls = manifest.decisions.map(row => profileUrl(row.athletic_net_profile_id));
  const keys = manifest.decisions.map(row => String(row.source_athlete_key).trim());
  const [targets, profileMatches, aliases] = await Promise.all([
    pool.query(
      `SELECT athlete_id, full_name, gender, athletic_net_url
         FROM public.athletes
        WHERE athlete_id = ANY($1::bigint[])`,
      [ids]
    ),
    pool.query(
      `SELECT athlete_id, full_name, gender, athletic_net_url
         FROM public.athletes
        WHERE athletic_net_url = ANY($1::text[])`,
      [urls]
    ),
    pool.query(
      `SELECT source_athlete_key, target_athlete_id, status
         FROM ingest.athlete_aliases
        WHERE source = 'athletic_net'
          AND source_athlete_key = ANY($1::text[])`,
      [keys]
    ),
  ]);
  return {
    targets: targets.rows,
    profileMatches: profileMatches.rows,
    aliases: aliases.rows,
  };
}

async function commitPlan(pool, plan) {
  if (plan.some(row => row.action === 'hold')) {
    throw new Error('refusing source-profile alias commit: plan contains holds');
  }
  const inserts = plan.filter(row => row.action === 'insert_alias');
  if (!inserts.length) return { aliases_created: 0 };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of inserts) {
      await client.query(
        `INSERT INTO ingest.athlete_aliases
           (source, source_athlete_key, source_athlete_name, source_gender,
            target_athlete_id, match_method, status, notes, verified_at, updated_at)
         VALUES ('athletic_net', $1, $2, $3, $4, 'verified_alias', 'active', $5, now(), now())
         ON CONFLICT (source, source_athlete_key) DO NOTHING`,
        [row.source_athlete_key, row.source_athlete_name, row.source_gender, row.target_athlete_id, row.notes]
      );
    }
    const verify = await client.query(
      `SELECT source_athlete_key, target_athlete_id, status
         FROM ingest.athlete_aliases
        WHERE source = 'athletic_net'
          AND source_athlete_key = ANY($1::text[])`,
      [inserts.map(row => row.source_athlete_key)]
    );
    const byKey = new Map(verify.rows.map(row => [row.source_athlete_key, row]));
    for (const row of inserts) {
      const actual = byKey.get(row.source_athlete_key);
      if (!actual || actual.status !== 'active' || Number(actual.target_athlete_id) !== row.target_athlete_id) {
        throw new Error(`source-profile alias verification failed for ${row.source_athlete_key}`);
      }
    }
    await client.query('COMMIT');
    return { aliases_created: inserts.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function run({ manifestPath = DEFAULT_MANIFEST, commit = false, env = process.env, pool = null } = {}) {
  const manifest = readManifest(manifestPath);
  const ownsPool = !pool;
  const url = ensureIngestDatabaseUrl(env);
  if (!url && !pool) throw new Error('INGEST_DATABASE_URL is required');
  const db = pool || new Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 10000,
    application_name: 'trackhub-reviewed-source-profile-alias',
    ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  try {
    const plan = buildPlan(manifest.decisions, await loadState(db, manifest));
    const outcome = commit ? await commitPlan(db, plan) : { aliases_created: 0 };
    return { mode: commit ? 'commit' : 'dry_run', ...outcome, plan };
  } finally {
    if (ownsPool) await db.end();
  }
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  run({ manifestPath: args.manifest, commit: args.commit })
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(`ERROR ${error.message}`); process.exit(1); });
}

module.exports = { buildPlan, commitPlan, namesCompatible, normalizeName, parseArgs, readManifest, run };
