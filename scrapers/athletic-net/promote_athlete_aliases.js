#!/usr/bin/env node
/**
 * Promote reviewed AthleticLIVE identities into the private alias table.
 *
 * The manifest identifies the target by TFRRS id instead of an internal
 * athlete_id. Dry-run is the default. Add --commit only after the printed
 * plan contains only the expected approvals. This script never creates or
 * mutates rows in public.athletes.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DEFAULT_MANIFEST = path.join(__dirname, 'verified-identity-decisions.json');

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
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSchool(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b(university|college|univ|coll)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function schoolMatches(expected, actual) {
  const left = normalizeSchool(expected);
  const right = normalizeSchool(actual);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function readManifest(filePath) {
  const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!manifest || manifest.manifest_version !== 1 || !Array.isArray(manifest.decisions)) {
    throw new Error('manifest must contain manifest_version: 1 and a decisions array');
  }

  const seenKeys = new Set();
  for (const decision of manifest.decisions) {
    const required = ['source_athlete_key', 'source_athlete_name', 'source_gender', 'target_tfrrs_athlete_id', 'expected_school'];
    for (const field of required) {
      if (!String(decision[field] || '').trim()) throw new Error(`manifest decision missing ${field}`);
    }
    if (!['M', 'F'].includes(decision.source_gender)) {
      throw new Error(`invalid source_gender for ${decision.source_athlete_key}`);
    }
    if (decision.match_method !== 'verified_alias') {
      throw new Error(`only verified_alias decisions may be promoted: ${decision.source_athlete_key}`);
    }
    if (!Array.isArray(decision.evidence) || decision.evidence.length < 2) {
      throw new Error(`at least two evidence items are required: ${decision.source_athlete_key}`);
    }
    const key = `athletic_net|${String(decision.source_athlete_key).trim()}`;
    if (seenKeys.has(key)) throw new Error(`duplicate source identity in manifest: ${key}`);
    seenKeys.add(key);
  }
  return manifest;
}

function buildPlan(decisions, { targets = [], aliases = [] } = {}) {
  const targetsByTfrrs = new Map();
  for (const target of targets) {
    const key = String(target.tfrrs_athlete_id || '').trim();
    if (!key) continue;
    if (!targetsByTfrrs.has(key)) targetsByTfrrs.set(key, []);
    targetsByTfrrs.get(key).push(target);
  }

  const aliasesByKey = new Map(
    aliases.map(row => [`${row.source}|${String(row.source_athlete_key).trim()}`, row])
  );

  return decisions.map(decision => {
    const sourceKey = String(decision.source_athlete_key).trim();
    const aliasKey = `athletic_net|${sourceKey}`;
    const matches = targetsByTfrrs.get(String(decision.target_tfrrs_athlete_id).trim()) || [];
    const existingAlias = aliasesByKey.get(aliasKey) || null;
    const base = {
      source: 'athletic_net',
      source_athlete_key: sourceKey,
      source_athlete_name: decision.source_athlete_name,
      source_gender: decision.source_gender,
      target_tfrrs_athlete_id: String(decision.target_tfrrs_athlete_id).trim(),
      expected_school: decision.expected_school,
      evidence: decision.evidence,
      notes: decision.notes || null,
      existing_alias: existingAlias,
    };

    if (matches.length !== 1) {
      return { ...base, action: 'hold', reason: matches.length === 0 ? 'target_not_found' : 'target_tfrrs_id_not_unique' };
    }

    const target = matches[0];
    if (normalizeName(target.full_name) !== normalizeName(decision.source_athlete_name)) {
      return { ...base, action: 'hold', reason: 'target_name_mismatch', target };
    }
    if (target.gender !== decision.source_gender) {
      return { ...base, action: 'hold', reason: 'target_gender_mismatch', target };
    }
    if (!schoolMatches(decision.expected_school, target.school_name)) {
      return { ...base, action: 'hold', reason: 'target_school_mismatch', target };
    }
    if (existingAlias && String(existingAlias.target_athlete_id) !== String(target.athlete_id)) {
      return { ...base, action: 'hold', reason: 'existing_alias_conflict', target };
    }

    return {
      ...base,
      action: existingAlias ? 'already_active' : 'insert',
      reason: existingAlias ? 'existing_alias_matches' : 'verified_target',
      target,
    };
  });
}

async function loadState(pool, manifest) {
  const tfrrsIds = manifest.decisions.map(row => String(row.target_tfrrs_athlete_id).trim());
  const sourceKeys = manifest.decisions.map(row => String(row.source_athlete_key).trim());
  const [targets, aliases] = await Promise.all([
    pool.query(
      `SELECT a.athlete_id, a.full_name, a.gender, a.tfrrs_athlete_id,
              s.official_name AS school_name
         FROM public.athletes a
         JOIN public.schools s ON s.school_id = a.school_id
        WHERE a.tfrrs_athlete_id = ANY($1::text[])`,
      [tfrrsIds]
    ),
    pool.query(
      `SELECT athlete_alias_id, source, source_athlete_key, source_athlete_name,
              source_gender, target_athlete_id, match_method, status
         FROM ingest.athlete_aliases
        WHERE source = 'athletic_net'
          AND source_athlete_key = ANY($1::text[])`,
      [sourceKeys]
    ),
  ]);
  return { targets: targets.rows, aliases: aliases.rows };
}

async function insertPlan(pool, plan) {
  const inserts = plan.filter(row => row.action === 'insert');
  if (plan.some(row => row.action === 'hold')) throw new Error('refusing commit: plan contains held identity decisions');
  if (inserts.length === 0) return { inserted: 0 };

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
        [
          row.source_athlete_key,
          row.source_athlete_name,
          row.source_gender,
          row.target.athlete_id,
          row.notes,
        ]
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
      if (!actual || actual.status !== 'active' || String(actual.target_athlete_id) !== String(row.target.athlete_id)) {
        throw new Error(`alias verification failed for ${row.source_athlete_key}`);
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
    connectionString: env.INGEST_DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 10000,
    application_name: 'trackhub-athletic-net-alias-promotion',
    ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  try {
    if (!env.INGEST_DATABASE_URL && !pool) throw new Error('INGEST_DATABASE_URL is required');
    const state = await loadState(db, manifest);
    const plan = buildPlan(manifest.decisions, state);
    const outcome = commit ? await insertPlan(db, plan) : { inserted: 0 };
    return {
      manifest_version: manifest.manifest_version,
      mode: commit ? 'commit' : 'dry_run',
      public_athlete_writes: 0,
      private_alias_writes: outcome.inserted,
      plan,
    };
  } finally {
    if (ownsPool) await db.end();
  }
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  run({ manifestPath: args.manifest, commit: args.commit })
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
      console.error(`ERROR ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  buildPlan,
  normalizeName,
  normalizeSchool,
  parseArgs,
  readManifest,
  run,
  schoolMatches,
};
