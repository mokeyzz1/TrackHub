#!/usr/bin/env node
/**
 * Add explicitly reviewed athlete PR facts without replacing existing PR rows.
 * Dry-run is the default; --commit is required to write.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DEFAULT_MANIFEST = path.join(__dirname, 'split-identity-decisions.json');

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
  for (const decision of manifest.decisions) {
    if (!String(decision.new_tfrrs_athlete_id || '').trim()) throw new Error('PR decision missing new_tfrrs_athlete_id');
    if (!Array.isArray(decision.verified_prs) || !decision.verified_prs.length) {
      throw new Error(`verified_prs must be non-empty: ${decision.new_tfrrs_athlete_id}`);
    }
    for (const pr of decision.verified_prs) {
      for (const field of ['event_name', 'mark_raw', 'season']) {
        if (!String(pr[field] || '').trim()) throw new Error(`PR decision missing ${field}`);
      }
      if (!Number.isFinite(Number(pr.mark_seconds)) || Number(pr.mark_seconds) <= 0) {
        throw new Error(`PR decision mark_seconds must be positive: ${decision.new_tfrrs_athlete_id}/${pr.event_name}`);
      }
    }
  }
  return manifest;
}

function buildPlan(decisions, { targets = [], existingPrs = [] } = {}) {
  const targetsByTfrrs = new Map();
  for (const target of targets) {
    const key = String(target.tfrrs_athlete_id).trim();
    if (!targetsByTfrrs.has(key)) targetsByTfrrs.set(key, []);
    targetsByTfrrs.get(key).push(target);
  }
  const prsByAthlete = new Map();
  for (const pr of existingPrs) {
    if (!prsByAthlete.has(Number(pr.athlete_id))) prsByAthlete.set(Number(pr.athlete_id), []);
    prsByAthlete.get(Number(pr.athlete_id)).push(pr);
  }

  return decisions.map(decision => {
    const tfrrsId = String(decision.new_tfrrs_athlete_id).trim();
    const matches = targetsByTfrrs.get(tfrrsId) || [];
    const base = { tfrrs_athlete_id: tfrrsId, evidence: decision.evidence || [], notes: decision.notes || null };
    if (matches.length !== 1) return { ...base, action: 'hold', reason: matches.length ? 'target_tfrrs_not_unique' : 'target_tfrrs_not_found' };
    const target = matches[0];
    if (decision.new_athlete_id && Number(target.athlete_id) !== Number(decision.new_athlete_id)) {
      return { ...base, action: 'hold', reason: 'target_athlete_id_mismatch', target };
    }
    if (decision.source_athlete_name && normalizeName(target.full_name) !== normalizeName(decision.source_athlete_name)) {
      return { ...base, action: 'hold', reason: 'target_name_mismatch', target };
    }
    if (decision.new_school_id && Number(target.school_id) !== Number(decision.new_school_id)) {
      return { ...base, action: 'hold', reason: 'target_school_mismatch', target };
    }
    const existing = prsByAthlete.get(Number(target.athlete_id)) || [];
    const existingByKey = new Map(existing.map(pr => [`${pr.event_name}|${pr.season}`, pr]));
    const inserts = [];
    const already = [];
    for (const pr of decision.verified_prs) {
      const key = `${pr.event_name}|${pr.season}`;
      const current = existingByKey.get(key);
      const intendedSeconds = Number(pr.mark_seconds);
      if (current) {
        if (String(current.mark_raw) !== String(pr.mark_raw) || Number(current.mark_seconds) !== intendedSeconds) {
          return { ...base, action: 'hold', reason: 'existing_pr_conflict', target, conflict: { current, intended: pr } };
        }
        already.push(current);
      } else {
        inserts.push({
          athlete_id: Number(target.athlete_id), event_name: pr.event_name, mark_raw: pr.mark_raw,
          mark_seconds: intendedSeconds, mark_meters: pr.mark_meters == null ? null : Number(pr.mark_meters),
          set_at: pr.set_at || null, meet_name: pr.meet_name || null, season: pr.season,
        });
      }
    }
    return {
      ...base, target, action: inserts.length ? 'insert' : 'already_present',
      reason: inserts.length ? 'verified_pr_facts' : 'verified_pr_facts_already_present',
      inserts, already,
    };
  });
}

async function loadState(pool, manifest) {
  const tfrrsIds = manifest.decisions.map(row => String(row.new_tfrrs_athlete_id).trim());
  const targets = await pool.query(
    `SELECT athlete_id, full_name, gender, school_id, tfrrs_athlete_id
       FROM public.athletes WHERE tfrrs_athlete_id = ANY($1::text[])`, [tfrrsIds]
  );
  const athleteIds = targets.rows.map(row => Number(row.athlete_id));
  const existingPrs = athleteIds.length ? (await pool.query(
    `SELECT id, athlete_id, event_name, mark_raw, mark_seconds, mark_meters, set_at, meet_name, season
       FROM public.athlete_prs WHERE athlete_id = ANY($1::bigint[])`, [athleteIds]
  )).rows : [];
  return { targets: targets.rows, existingPrs };
}

async function commitPlan(pool, plan) {
  if (plan.some(row => row.action === 'hold')) throw new Error('refusing PR commit: plan contains held conflicts');
  const inserts = plan.flatMap(row => row.inserts || []);
  if (!inserts.length) return { inserted: 0 };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of plan.filter(candidate => candidate.action === 'insert')) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`athlete-prs|${row.tfrrs_athlete_id}`]);
      for (const pr of row.inserts) {
        await client.query(
          `INSERT INTO public.athlete_prs
             (athlete_id,event_name,mark_raw,mark_seconds,mark_meters,set_at,meet_name,season)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (athlete_id,event_name,season) DO NOTHING`,
          [pr.athlete_id, pr.event_name, pr.mark_raw, pr.mark_seconds, pr.mark_meters, pr.set_at, pr.meet_name, pr.season]
        );
      }
    }
    // The unique-key inserts are rechecked with a simple per-row query because PostgreSQL cannot
    // safely parameterize a heterogeneous composite-key ANY() without a generated type.
    for (const pr of inserts) {
      const result = await client.query(
        `SELECT mark_raw,mark_seconds FROM public.athlete_prs
          WHERE athlete_id=$1 AND event_name=$2 AND season=$3`, [pr.athlete_id, pr.event_name, pr.season]
      );
      if (result.rowCount !== 1 || String(result.rows[0].mark_raw) !== String(pr.mark_raw) || Number(result.rows[0].mark_seconds) !== Number(pr.mark_seconds)) {
        throw new Error(`PR verification failed for ${pr.athlete_id}/${pr.event_name}/${pr.season}`);
      }
    }
    await client.query('COMMIT');
    return { inserted: inserts.length };
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
    application_name: 'trackhub-reviewed-athlete-prs',
    ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  try {
    if (!env.INGEST_DATABASE_URL && !pool) throw new Error('INGEST_DATABASE_URL is required');
    const state = await loadState(db, manifest);
    const plan = buildPlan(manifest.decisions, state);
    const outcome = commit ? await commitPlan(db, plan) : { inserted: 0 };
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
