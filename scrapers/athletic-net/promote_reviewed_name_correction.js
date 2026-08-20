#!/usr/bin/env node
/**
 * Correct a reviewed athlete name spelling and attach a source alias.
 *
 * This path is for an existing, non-empty athlete row whose TFRRS identity, school, gender,
 * and optional Athletic.net profile are already exact. It never moves or deletes results.
 * Dry-run is the default; --commit is required to write.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DEFAULT_MANIFEST = path.join(__dirname, 'name-correction-decisions.json');

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  return { manifest: valueAfter(argv, '--manifest') || DEFAULT_MANIFEST, commit: argv.includes('--commit') };
}

function normalizeName(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function readManifest(filePath) {
  const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!manifest || manifest.manifest_version !== 1 || !Array.isArray(manifest.decisions)) {
    throw new Error('manifest must contain manifest_version: 1 and a decisions array');
  }
  const seen = new Set();
  for (const decision of manifest.decisions) {
    for (const field of ['source_athlete_key', 'source_athlete_name', 'source_gender', 'target_athlete_id', 'target_tfrrs_athlete_id', 'expected_current_name', 'expected_school_id', 'evidence']) {
      if (decision[field] == null || (typeof decision[field] === 'string' && !decision[field].trim())) {
        throw new Error(`name correction missing ${field}`);
      }
    }
    if (!['M', 'F'].includes(decision.source_gender)) throw new Error(`invalid gender: ${decision.source_athlete_key}`);
    if (!Array.isArray(decision.evidence) || decision.evidence.length < 2) throw new Error(`at least two evidence items required: ${decision.source_athlete_key}`);
    const key = String(decision.source_athlete_key).trim();
    if (seen.has(key)) throw new Error(`duplicate source key: ${key}`);
    seen.add(key);
  }
  return manifest;
}

function buildPlan(decisions, { targets = [], aliases = [] } = {}) {
  const targetsByTfrrs = new Map();
  for (const target of targets) {
    const key = String(target.tfrrs_athlete_id || '').trim();
    if (!targetsByTfrrs.has(key)) targetsByTfrrs.set(key, []);
    targetsByTfrrs.get(key).push(target);
  }
  const aliasesByKey = new Map(aliases.map(row => [String(row.source_athlete_key), row]));
  return decisions.map(decision => {
    const key = String(decision.source_athlete_key).trim();
    const tfrrsId = String(decision.target_tfrrs_athlete_id).trim();
    const matches = targetsByTfrrs.get(tfrrsId) || [];
    const alias = aliasesByKey.get(key) || null;
    const base = {
      source: 'athletic_net', source_athlete_key: key, source_athlete_name: String(decision.source_athlete_name).trim(),
      source_gender: decision.source_gender, target_tfrrs_athlete_id: tfrrsId,
      target_athlete_id: Number(decision.target_athlete_id), expected_current_name: decision.expected_current_name,
      expected_school_id: Number(decision.expected_school_id), evidence: decision.evidence, notes: decision.notes || null, alias,
    };
    if (matches.length !== 1) return { ...base, action: 'hold', reason: matches.length ? 'target_tfrrs_not_unique' : 'target_tfrrs_not_found' };
    const target = matches[0];
    if (Number(target.athlete_id) !== base.target_athlete_id) return { ...base, action: 'hold', reason: 'target_athlete_id_mismatch', target };
    if (target.gender !== decision.source_gender) return { ...base, action: 'hold', reason: 'target_gender_mismatch', target };
    if (Number(target.school_id) !== base.expected_school_id) return { ...base, action: 'hold', reason: 'target_school_mismatch', target };
    if (alias && normalizeName(target.full_name) === normalizeName(decision.source_athlete_name)) {
      return { ...base, target, action: 'already_active', reason: 'existing_alias_and_corrected_name' };
    }
    if (String(target.full_name) !== String(decision.expected_current_name)) return { ...base, action: 'hold', reason: 'current_name_guard_failed', target };
    if (normalizeName(target.full_name) === normalizeName(decision.source_athlete_name)) return { ...base, action: 'hold', reason: 'no_name_correction_needed', target };
    if (decision.expected_athletic_net_profile_id) {
      const expectedUrl = `https://www.athletic.net/athlete/${String(decision.expected_athletic_net_profile_id).trim()}/track-and-field`;
      if (String(target.athletic_net_url || '').replace(/\/$/, '') !== expectedUrl) return { ...base, action: 'hold', reason: 'athletic_net_profile_mismatch', target };
    }
    if (alias && Number(alias.target_athlete_id) !== base.target_athlete_id) return { ...base, action: 'hold', reason: 'existing_alias_conflict', target };
    return {
      ...base, target, action: alias ? 'already_active' : 'correct_name_and_alias',
      reason: alias ? 'existing_alias_matches' : 'verified_external_name_correction',
    };
  });
}

async function loadState(pool, manifest) {
  const ids = manifest.decisions.map(row => Number(row.target_athlete_id));
  const tfrrsIds = manifest.decisions.map(row => String(row.target_tfrrs_athlete_id).trim());
  const keys = manifest.decisions.map(row => String(row.source_athlete_key).trim());
  const [targets, aliases] = await Promise.all([
    pool.query(
      `SELECT athlete_id,full_name,first_name,last_name,gender,school_id,tfrrs_athlete_id,athletic_net_url
         FROM public.athletes WHERE tfrrs_athlete_id=ANY($1::text[]) AND athlete_id=ANY($2::bigint[])`, [tfrrsIds, ids]
    ),
    pool.query(
      `SELECT source_athlete_key,target_athlete_id,status
         FROM ingest.athlete_aliases WHERE source='athletic_net' AND source_athlete_key=ANY($1::text[])`, [keys]
    ),
  ]);
  return { targets: targets.rows, aliases: aliases.rows };
}

async function commitPlan(pool, plan) {
  if (plan.some(row => row.action === 'hold')) throw new Error('refusing name correction: plan contains holds');
  const corrections = plan.filter(row => row.action === 'correct_name_and_alias');
  if (!corrections.length) return { aliases_created: 0, names_corrected: 0 };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of corrections) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`name-correction|${row.target_tfrrs_athlete_id}`]);
      const target = (await client.query(
        `SELECT athlete_id,full_name,gender,school_id,tfrrs_athlete_id FROM public.athletes WHERE athlete_id=$1 FOR UPDATE`, [row.target_athlete_id]
      )).rows[0];
      if (!target || String(target.full_name) !== String(row.expected_current_name) || target.gender !== row.source_gender || Number(target.school_id) !== row.expected_school_id || String(target.tfrrs_athlete_id) !== row.target_tfrrs_athlete_id) {
        throw new Error(`name correction guard failed for ${row.source_athlete_key}`);
      }
      const parts = row.source_athlete_name.split(/\s+/);
      const updated = await client.query(
        `UPDATE public.athletes SET full_name=$2,first_name=$3,last_name=$4,updated_at=now()
          WHERE athlete_id=$1 AND full_name=$5
         RETURNING athlete_id`, [row.target_athlete_id, row.source_athlete_name, parts[0], parts.slice(1).join(' '), row.expected_current_name]
      );
      if (updated.rowCount !== 1) throw new Error(`public name correction failed for ${row.source_athlete_key}`);
      await client.query(
        `INSERT INTO ingest.athlete_aliases
           (source,source_athlete_key,source_athlete_name,source_gender,target_athlete_id,match_method,status,notes,verified_at,updated_at)
         VALUES ('athletic_net',$1,$2,$3,$4,'verified_alias','active',$5,now(),now())
         ON CONFLICT (source,source_athlete_key) DO NOTHING`,
        [row.source_athlete_key,row.source_athlete_name,row.source_gender,row.target_athlete_id,row.notes]
      );
      const verify = await client.query(
        `SELECT target_athlete_id,status FROM ingest.athlete_aliases WHERE source='athletic_net' AND source_athlete_key=$1`, [row.source_athlete_key]
      );
      if (verify.rowCount !== 1 || Number(verify.rows[0].target_athlete_id) !== row.target_athlete_id || verify.rows[0].status !== 'active') throw new Error(`name correction alias verification failed for ${row.source_athlete_key}`);
    }
    await client.query('COMMIT');
    return { aliases_created: corrections.length, names_corrected: corrections.length };
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
  const db = pool || new Pool({
    connectionString: env.INGEST_DATABASE_URL, max: 2, connectionTimeoutMillis: 10000,
    application_name: 'trackhub-reviewed-name-correction',
    ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  try {
    if (!env.INGEST_DATABASE_URL && !pool) throw new Error('INGEST_DATABASE_URL is required');
    const state = await loadState(db, manifest);
    const plan = buildPlan(manifest.decisions, state);
    const outcome = commit ? await commitPlan(db, plan) : { aliases_created: 0, names_corrected: 0 };
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

module.exports = { buildPlan, normalizeName, parseArgs, readManifest, run };
