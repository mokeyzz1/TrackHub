#!/usr/bin/env node
/**
 * Create a new public athlete only from an explicitly reviewed identity
 * manifest, then attach the source identity in ingest.athlete_aliases.
 *
 * This path is intentionally separate from the normal import resolver. It
 * refuses existing TFRRS identities and same-name/same-school rows, so a
 * missing source athlete cannot silently become a duplicate or overwrite an
 * existing profile. Dry-run is the default; --commit is required to write.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { parseName } = require('../shared/name_parser');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DEFAULT_MANIFEST = path.join(__dirname, 'new-identity-decisions.json');

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

function readManifest(filePath) {
  const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!manifest || manifest.manifest_version !== 1 || !Array.isArray(manifest.decisions)) {
    throw new Error('manifest must contain manifest_version: 1 and a decisions array');
  }
  const seen = new Set();
  for (const decision of manifest.decisions) {
    for (const field of [
      'source_athlete_key', 'source_athlete_name', 'source_gender',
      'target_tfrrs_athlete_id', 'expected_school', 'athletic_net_profile_id'
    ]) {
      if (!String(decision[field] || '').trim()) throw new Error(`manifest decision missing ${field}`);
    }
    if (!['M', 'F'].includes(decision.source_gender)) throw new Error(`invalid source_gender for ${decision.source_athlete_key}`);
    if (!Array.isArray(decision.evidence) || decision.evidence.length < 2) {
      throw new Error(`at least two evidence items are required: ${decision.source_athlete_key}`);
    }
    const key = `athletic_net|${String(decision.source_athlete_key).trim()}`;
    if (seen.has(key)) throw new Error(`duplicate source identity in manifest: ${key}`);
    seen.add(key);
  }
  return manifest;
}

function buildPlan(decisions, { schools = [], byTfrrs = [], byNameSchool = [], aliases = [] } = {}) {
  const schoolByKey = new Map();
  for (const school of schools) {
    for (const key of [school.official_name, school.short_name]) {
      const normalized = normalizeName(key);
      if (!normalized) continue;
      if (!schoolByKey.has(normalized)) schoolByKey.set(normalized, []);
      schoolByKey.get(normalized).push(school);
    }
  }
  const aliasByKey = new Map(aliases.map(row => [
    `athletic_net|${String(row.source_athlete_key).trim()}`,
    row,
  ]));
  const tfrrsById = new Map();
  for (const row of byTfrrs) {
    const key = String(row.tfrrs_athlete_id || '').trim();
    if (!tfrrsById.has(key)) tfrrsById.set(key, []);
    tfrrsById.get(key).push(row);
  }

  return decisions.map(decision => {
    const sourceKey = String(decision.source_athlete_key).trim();
    const tfrrsId = String(decision.target_tfrrs_athlete_id).trim();
    const sourceName = String(decision.source_athlete_name).trim();
    const schoolMatches = (schoolByKey.get(normalizeName(decision.expected_school)) || []).filter((school, index, all) => (
      all.findIndex(other => other.school_id === school.school_id) === index
    ));
    const targetSchool = schoolMatches.length === 1 ? schoolMatches[0] : null;
    const nameRows = targetSchool
      ? byNameSchool.filter(row => row.school_id === targetSchool.school_id && normalizeName(row.full_name) === normalizeName(sourceName) && row.gender === decision.source_gender)
      : [];
    const tfrrsRows = tfrrsById.get(tfrrsId) || [];
    const existingAlias = aliasByKey.get(`athletic_net|${sourceKey}`) || null;
    const base = {
      source: 'athletic_net',
      source_athlete_key: sourceKey,
      source_athlete_name: sourceName,
      source_gender: decision.source_gender,
      target_tfrrs_athlete_id: tfrrsId,
      expected_school: decision.expected_school,
      athletic_net_profile_id: String(decision.athletic_net_profile_id).trim(),
      evidence: decision.evidence,
      notes: decision.notes || null,
      target_school: targetSchool,
      existing_alias: existingAlias,
    };

    if (schoolMatches.length !== 1) return { ...base, action: 'hold', reason: schoolMatches.length === 0 ? 'school_not_found' : 'school_not_unique' };
    if (tfrrsRows.length !== 0) return { ...base, action: 'hold', reason: 'target_tfrrs_already_exists', existing_tfrrs_rows: tfrrsRows };
    if (nameRows.length !== 0) return { ...base, action: 'hold', reason: 'same_name_school_exists', existing_name_school_rows: nameRows };
    if (existingAlias) return { ...base, action: 'hold', reason: 'source_alias_already_exists' };

    return {
      ...base,
      action: 'create_and_alias',
      reason: 'verified_new_identity',
      athlete: {
        school_id: targetSchool.school_id,
        full_name: sourceName,
        ...(parseName(sourceName) || {}),
        gender: decision.source_gender,
        tfrrs_athlete_id: tfrrsId,
        tfrrs_profile_url: decision.tfrrs_profile_url || null,
        athletic_net_url: `https://www.athletic.net/athlete/${base.athletic_net_profile_id}/track-and-field`,
        is_active: true,
      },
    };
  });
}

async function loadState(pool, manifest) {
  const tfrrsIds = manifest.decisions.map(row => String(row.target_tfrrs_athlete_id).trim());
  const sourceKeys = manifest.decisions.map(row => String(row.source_athlete_key).trim());
  const schools = await pool.query(
    `SELECT school_id, official_name, short_name
       FROM public.schools
      WHERE lower(official_name) = ANY($1::text[])
         OR lower(short_name) = ANY($1::text[])`,
    [manifest.decisions.flatMap(row => [String(row.expected_school).toLowerCase(), String(row.expected_school).toLowerCase()])]
  );
  const [byTfrrs, byNameSchool, aliases] = await Promise.all([
    pool.query(
      `SELECT athlete_id, full_name, gender, school_id, tfrrs_athlete_id
         FROM public.athletes
        WHERE tfrrs_athlete_id = ANY($1::text[])`,
      [tfrrsIds]
    ),
    pool.query(
      `SELECT athlete_id, full_name, gender, school_id, tfrrs_athlete_id
         FROM public.athletes
        WHERE lower(full_name) = ANY($1::text[])
           OR regexp_replace(lower(full_name), '\\s+', ' ', 'g') = ANY($2::text[])`,
      [
        manifest.decisions.map(row => String(row.source_athlete_name).toLowerCase()),
        manifest.decisions.map(row => String(row.source_athlete_name).toLowerCase().replace(/\s+/g, ' ').trim()),
      ]
    ),
    pool.query(
      `SELECT athlete_alias_id, source, source_athlete_key, target_athlete_id, status
         FROM ingest.athlete_aliases
        WHERE source = 'athletic_net'
          AND source_athlete_key = ANY($1::text[])`,
      [sourceKeys]
    ),
  ]);

  return {
    schools: schools.rows,
    byTfrrs: byTfrrs.rows,
    byNameSchool: byNameSchool.rows,
    aliases: aliases.rows,
  };
}

async function commitPlan(pool, plan) {
  const creates = plan.filter(row => row.action === 'create_and_alias');
  if (plan.some(row => row.action === 'hold')) throw new Error('refusing commit: plan contains held new-athlete decisions');
  if (creates.length === 0) return { athletes_created: 0, aliases_created: 0 };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of creates) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `athletic_net|${row.source_athlete_key}|${row.target_tfrrs_athlete_id}`,
      ]);
      const inserted = await client.query(
        `INSERT INTO public.athletes
           (school_id, full_name, first_name, last_name, gender,
            tfrrs_athlete_id, tfrrs_profile_url, athletic_net_url, is_active)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, true
          WHERE NOT EXISTS (
            SELECT 1 FROM public.athletes
             WHERE tfrrs_athlete_id = $6
                OR (school_id = $1 AND lower(full_name) = lower($2) AND gender = $5)
          )
         RETURNING athlete_id`,
        [
          row.athlete.school_id,
          row.athlete.full_name,
          row.athlete.first_name || null,
          row.athlete.last_name || null,
          row.athlete.gender,
          row.athlete.tfrrs_athlete_id,
          row.athlete.tfrrs_profile_url,
          row.athlete.athletic_net_url,
        ]
      );
      if (inserted.rowCount !== 1) throw new Error(`new-athlete insert guard failed for ${row.source_athlete_key}`);
      const athleteId = inserted.rows[0].athlete_id;
      await client.query(
        `INSERT INTO ingest.athlete_aliases
           (source, source_athlete_key, source_athlete_name, source_gender,
            target_athlete_id, match_method, status, notes, verified_at, updated_at)
         VALUES ('athletic_net', $1, $2, $3, $4, 'verified_alias', 'active', $5, now(), now())
         ON CONFLICT (source, source_athlete_key) DO NOTHING`,
        [row.source_athlete_key, row.source_athlete_name, row.source_gender, athleteId, row.notes]
      );
      row.created_athlete_id = athleteId;
    }
    const verify = await client.query(
      `SELECT source_athlete_key, target_athlete_id, status
         FROM ingest.athlete_aliases
        WHERE source = 'athletic_net'
          AND source_athlete_key = ANY($1::text[])`,
      [creates.map(row => row.source_athlete_key)]
    );
    const aliasesByKey = new Map(verify.rows.map(row => [row.source_athlete_key, row]));
    for (const row of creates) {
      const alias = aliasesByKey.get(row.source_athlete_key);
      if (!alias || alias.status !== 'active' || String(alias.target_athlete_id) !== String(row.created_athlete_id)) {
        throw new Error(`alias verification failed for ${row.source_athlete_key}`);
      }
    }
    await client.query('COMMIT');
    return { athletes_created: creates.length, aliases_created: creates.length };
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
    application_name: 'trackhub-reviewed-athlete-creation',
    ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  try {
    if (!env.INGEST_DATABASE_URL && !pool) throw new Error('INGEST_DATABASE_URL is required');
    const state = await loadState(db, manifest);
    const plan = buildPlan(manifest.decisions, state);
    const outcome = commit ? await commitPlan(db, plan) : { athletes_created: 0, aliases_created: 0 };
    return {
      mode: commit ? 'commit' : 'dry_run',
      public_athlete_writes: outcome.athletes_created,
      private_alias_writes: outcome.aliases_created,
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
  parseArgs,
  readManifest,
  run,
};
