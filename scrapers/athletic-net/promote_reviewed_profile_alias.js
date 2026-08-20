#!/usr/bin/env node
/**
 * Promote a reviewed Athletic.net profile match when no TFRRS id exists.
 *
 * This path requires an exact existing Athletic.net URL, matching gender, an explicit
 * name-format decision, and an empty public row before it can normalize that row. Dry-run
 * is the default; --commit is required to write.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DEFAULT_MANIFEST = path.join(__dirname, 'profile-identity-decisions.json');

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
    for (const field of ['source_athlete_key', 'source_athlete_name', 'source_gender', 'target_athlete_id', 'athletic_net_profile_id', 'evidence']) {
      if (decision[field] == null || (typeof decision[field] === 'string' && !decision[field].trim())) {
        throw new Error(`profile decision missing ${field}`);
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
  const targetsById = new Map(targets.map(row => [Number(row.athlete_id), row]));
  const aliasesByKey = new Map(aliases.map(row => [String(row.source_athlete_key), row]));
  return decisions.map(decision => {
    const key = String(decision.source_athlete_key).trim();
    const target = targetsById.get(Number(decision.target_athlete_id));
    const alias = aliasesByKey.get(key) || null;
    const base = {
      source: 'athletic_net', source_athlete_key: key, source_athlete_name: decision.source_athlete_name,
      source_gender: decision.source_gender, target_athlete_id: Number(decision.target_athlete_id),
      athletic_net_profile_id: String(decision.athletic_net_profile_id).trim(),
      athletic_net_url: `https://www.athletic.net/athlete/${String(decision.athletic_net_profile_id).trim()}/track-and-field`,
      evidence: decision.evidence, notes: decision.notes || null, alias,
    };
    if (!target) return { ...base, action: 'hold', reason: 'target_athlete_not_found' };
    if (target.gender !== decision.source_gender) return { ...base, action: 'hold', reason: 'target_gender_mismatch', target };
    if (String(target.athletic_net_url || '').replace(/\/$/, '') !== base.athletic_net_url) {
      return { ...base, action: 'hold', reason: 'target_profile_url_mismatch', target };
    }
    const sourceName = normalizeName(decision.source_athlete_name);
    const targetName = normalizeName(target.full_name);
    const allowedNameFormat = targetName === sourceName || targetName.endsWith(` ${sourceName}`);
    if (!allowedNameFormat) return { ...base, action: 'hold', reason: 'target_name_mismatch', target };
    if (alias && Number(alias.target_athlete_id) !== Number(target.athlete_id)) return { ...base, action: 'hold', reason: 'existing_alias_conflict', target };
    if (alias && targetName === sourceName) {
      return { ...base, target, action: 'already_active', reason: 'existing_alias_and_normalized_name', normalize_public_name: false };
    }
    if (Number(target.results_count) || Number(target.relay_legs_count) || Number(target.prs_count) || Number(target.seasons_count) || Number(target.live_refs_count)) {
      return { ...base, action: 'hold', reason: 'target_row_not_empty', target };
    }
    const action = alias ? 'already_active' : 'insert_alias';
    return {
      ...base, action, reason: alias ? 'existing_alias_matches' : 'exact_profile_match', target,
      normalize_public_name: decision.normalize_public_name !== false,
      expected_current_name: decision.expected_current_name || target.full_name,
    };
  });
}

async function loadState(pool, manifest) {
  const ids = manifest.decisions.map(row => Number(row.target_athlete_id));
  const keys = manifest.decisions.map(row => String(row.source_athlete_key).trim());
  const [targets, aliases] = await Promise.all([
    pool.query(
      `SELECT a.athlete_id,a.full_name,a.first_name,a.last_name,a.gender,a.athletic_net_url,
              (SELECT count(*) FROM public.results r WHERE r.athlete_id=a.athlete_id)::int AS results_count,
              (SELECT count(*) FROM public.relay_athletes ra WHERE ra.athlete_id=a.athlete_id)::int AS relay_legs_count,
              (SELECT count(*) FROM public.athlete_prs p WHERE p.athlete_id=a.athlete_id)::int AS prs_count,
              (SELECT count(*) FROM public.athlete_team_seasons ats WHERE ats.athlete_id=a.athlete_id)::int AS seasons_count,
              (SELECT count(*) FROM public.live_results lr WHERE lr.athlete_id=a.athlete_id)::int
                + (SELECT count(*) FROM public.unprocessed_live_results ulr WHERE ulr.athlete_id=a.athlete_id)::int
                + (SELECT count(*) FROM public.external_ids x WHERE x.athlete_id=a.athlete_id)::int AS live_refs_count
         FROM public.athletes a WHERE a.athlete_id=ANY($1::bigint[])`, [ids]
    ),
    pool.query(
      `SELECT source_athlete_key,target_athlete_id,status
         FROM ingest.athlete_aliases WHERE source='athletic_net' AND source_athlete_key=ANY($1::text[])`, [keys]
    ),
  ]);
  return { targets: targets.rows, aliases: aliases.rows };
}

async function commitPlan(pool, plan) {
  if (plan.some(row => row.action === 'hold')) throw new Error('refusing profile alias commit: plan contains holds');
  const inserts = plan.filter(row => row.action === 'insert_alias');
  if (!inserts.length) return { aliases_created: 0, names_normalized: 0 };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let namesNormalized = 0;
    for (const row of inserts) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`profile-alias|${row.athletic_net_profile_id}`]);
      const target = (await client.query(
        `SELECT athlete_id,full_name,first_name,last_name,gender,athletic_net_url
           FROM public.athletes WHERE athlete_id=$1 FOR UPDATE`, [row.target_athlete_id]
      )).rows[0];
      if (!target || target.gender !== row.source_gender || String(target.athletic_net_url || '').replace(/\/$/, '') !== row.athletic_net_url) {
        throw new Error(`profile target guard failed for ${row.source_athlete_key}`);
      }
      if (row.normalize_public_name) {
        if (String(target.full_name) !== String(row.expected_current_name)) throw new Error(`name guard failed for ${row.source_athlete_key}`);
        const parts = String(row.source_athlete_name).trim().split(/\s+/);
        const updated = await client.query(
          `UPDATE public.athletes SET full_name=$2,first_name=$3,last_name=$4,updated_at=now()
            WHERE athlete_id=$1 AND full_name=$5
           RETURNING athlete_id`, [row.target_athlete_id, row.source_athlete_name.trim(), parts[0], parts.slice(1).join(' '), row.expected_current_name]
        );
        if (updated.rowCount !== 1) throw new Error(`name normalization failed for ${row.source_athlete_key}`);
        namesNormalized += 1;
      }
      await client.query(
        `INSERT INTO ingest.athlete_aliases
           (source,source_athlete_key,source_athlete_name,source_gender,target_athlete_id,match_method,status,notes,verified_at,updated_at)
         VALUES ('athletic_net',$1,$2,$3,$4,'verified_alias','active',$5,now(),now())
         ON CONFLICT (source,source_athlete_key) DO NOTHING`,
        [row.source_athlete_key,row.source_athlete_name,row.source_gender,row.target_athlete_id,row.notes]
      );
      const verify = await client.query(
        `SELECT target_athlete_id,status FROM ingest.athlete_aliases
          WHERE source='athletic_net' AND source_athlete_key=$1`, [row.source_athlete_key]
      );
      if (verify.rowCount !== 1 || Number(verify.rows[0].target_athlete_id) !== row.target_athlete_id || verify.rows[0].status !== 'active') {
        throw new Error(`profile alias verification failed for ${row.source_athlete_key}`);
      }
    }
    await client.query('COMMIT');
    return { aliases_created: inserts.length, names_normalized: namesNormalized };
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
    application_name: 'trackhub-reviewed-profile-alias',
    ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  try {
    if (!env.INGEST_DATABASE_URL && !pool) throw new Error('INGEST_DATABASE_URL is required');
    const state = await loadState(db, manifest);
    const plan = buildPlan(manifest.decisions, state);
    const outcome = commit ? await commitPlan(db, plan) : { aliases_created: 0, names_normalized: 0 };
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
