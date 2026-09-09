#!/usr/bin/env node
/**
 * Attach a reviewed DirectAthletics identity to an existing, non-empty athlete.
 *
 * This path requires an exact name/school match plus at least two explicit
 * historical result overlaps. It never moves, deletes, or rewrites results.
 * Dry-run is the default; --commit is required to write.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DEFAULT_MANIFEST = path.join(__dirname, 'directathletics-history-identity-decisions.json');

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

function normalizeSchool(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function schoolMatches(expected, actual) {
  return normalizeSchool(expected) === normalizeSchool(actual);
}

function historyKey(row) {
  return [
    row.athlete_id,
    row.meet_id,
    row.event_type_id,
    String(row.mark_raw || '').trim(),
    row.place == null ? '' : row.place,
    row.round == null ? '' : row.round,
  ].join('|');
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
      'target_athlete_id', 'directathletics_profile_id', 'expected_school',
      'public_name', 'evidence', 'history_matches',
    ]) {
      if (decision[field] == null || (typeof decision[field] === 'string' && !decision[field].trim())) {
        throw new Error(`history identity decision missing ${field}`);
      }
    }
    if (!['M', 'F'].includes(decision.source_gender)) throw new Error(`invalid gender: ${decision.source_athlete_key}`);
    if (!Array.isArray(decision.evidence) || decision.evidence.length < 2) {
      throw new Error(`at least two evidence items are required: ${decision.source_athlete_key}`);
    }
    if (!Array.isArray(decision.history_matches) || decision.history_matches.length < 2) {
      throw new Error(`at least two history matches are required: ${decision.source_athlete_key}`);
    }
    if (normalizeName(decision.public_name) !== normalizeName(decision.source_athlete_name)) {
      throw new Error(`public_name must normalize to source name: ${decision.source_athlete_key}`);
    }
    const key = String(decision.source_athlete_key).trim();
    if (seen.has(key)) throw new Error(`duplicate source key: ${key}`);
    seen.add(key);
    for (const match of decision.history_matches) {
      for (const field of ['meet_id', 'event_type_id', 'mark_raw', 'place', 'round']) {
        if (match[field] == null || (typeof match[field] === 'string' && !match[field].trim())) {
          throw new Error(`history match missing ${field}: ${key}`);
        }
      }
    }
  }
  return manifest;
}

function buildPlan(decisions, { targets = [], aliases = [], externalIds = [], resultMatches = [] } = {}) {
  const targetsById = new Map(targets.map(row => [Number(row.athlete_id), row]));
  const aliasesByKey = new Map(aliases.map(row => [String(row.source_athlete_key), row]));
  const externalByKey = new Map(externalIds.map(row => [`${row.source}|${row.external_key}`, row]));
  const resultsByKey = new Set(resultMatches.map(historyKey));

  return decisions.map(decision => {
    const sourceKey = String(decision.source_athlete_key).trim();
    const directId = String(decision.directathletics_profile_id).trim();
    const target = targetsById.get(Number(decision.target_athlete_id));
    const alias = aliasesByKey.get(sourceKey) || null;
    const external = externalByKey.get(`directathletics|${directId}`) || null;
    const base = {
      source: 'athletic_net',
      source_athlete_key: sourceKey,
      source_athlete_name: String(decision.source_athlete_name).trim(),
      source_gender: decision.source_gender,
      target_athlete_id: Number(decision.target_athlete_id),
      directathletics_profile_id: directId,
      directathletics_url: `https://www.directathletics.com/athletes/track/${directId}.html`,
      expected_school: decision.expected_school,
      public_name: String(decision.public_name).trim(),
      evidence: decision.evidence,
      history_matches: decision.history_matches,
      notes: decision.notes || null,
      alias,
      external,
    };

    if (!target) return { ...base, action: 'hold', reason: 'target_athlete_not_found' };
    if (alias && Number(alias.target_athlete_id) !== Number(target.athlete_id)) {
      return { ...base, action: 'hold', reason: 'existing_alias_conflict', target };
    }
    if (external && Number(external.athlete_id) !== Number(target.athlete_id)) {
      return { ...base, action: 'hold', reason: 'existing_external_identity_conflict', target, external };
    }
    if (normalizeName(target.full_name) !== normalizeName(base.source_athlete_name)) {
      return { ...base, action: 'hold', reason: 'target_name_mismatch', target };
    }
    if (!schoolMatches(base.expected_school, target.school_name)) {
      return { ...base, action: 'hold', reason: 'target_school_mismatch', target };
    }
    if (target.gender != null && target.gender !== base.source_gender) {
      return { ...base, action: 'hold', reason: 'target_gender_mismatch', target };
    }

    const verifiedHistory = base.history_matches.every(match => resultsByKey.has(historyKey({
      athlete_id: target.athlete_id,
      ...match,
    })));
    if (!verifiedHistory) return { ...base, action: 'hold', reason: 'history_overlap_not_found', target };

    const identityAlreadyActive = alias?.status === 'active'
      && external?.verified === true;
    if (identityAlreadyActive) return { ...base, action: 'already_active', reason: 'existing_alias_and_external_identity', target };
    if (alias || external) return { ...base, action: 'hold', reason: 'partial_identity_exists', target, external };

    return {
      ...base,
      action: 'attach_existing_identity',
      reason: 'verified_directathletics_history_overlap',
      target,
      normalize_gender: target.gender == null,
    };
  });
}

async function loadState(pool, manifest) {
  const ids = manifest.decisions.map(row => Number(row.target_athlete_id));
  const sourceKeys = manifest.decisions.map(row => String(row.source_athlete_key).trim());
  const directIds = manifest.decisions.map(row => String(row.directathletics_profile_id).trim());
  const [targets, aliases, externalIds, resultMatches] = await Promise.all([
    pool.query(
      `SELECT a.athlete_id,a.full_name,a.gender,a.school_id,s.official_name AS school_name
         FROM public.athletes a JOIN public.schools s ON s.school_id=a.school_id
        WHERE a.athlete_id=ANY($1::bigint[])`, [ids]
    ),
    pool.query(
      `SELECT source_athlete_key,target_athlete_id,status
         FROM ingest.athlete_aliases
        WHERE source='athletic_net' AND source_athlete_key=ANY($1::text[])`, [sourceKeys]
    ),
    pool.query(
      `SELECT athlete_id,source,external_key,verified
         FROM public.external_ids
        WHERE source='directathletics' AND external_key=ANY($1::text[])`, [directIds]
    ),
    pool.query(
      `SELECT athlete_id,meet_id,event_type_id,mark_raw,place,round
         FROM public.results WHERE athlete_id=ANY($1::bigint[])`, [ids]
    ),
  ]);
  return {
    targets: targets.rows,
    aliases: aliases.rows,
    externalIds: externalIds.rows,
    resultMatches: resultMatches.rows,
  };
}

async function commitPlan(pool, plan) {
  if (plan.some(row => row.action === 'hold')) throw new Error('refusing DirectAthletics history identity commit: plan contains holds');
  const attaches = plan.filter(row => row.action === 'attach_existing_identity');
  if (!attaches.length) return { identities_created: 0, aliases_created: 0, genders_normalized: 0 };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let gendersNormalized = 0;
    for (const row of attaches) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `directathletics-history-identity|${row.directathletics_profile_id}`,
      ]);
      const target = (await client.query(
        `SELECT a.athlete_id,a.full_name,a.gender,a.school_id,s.official_name AS school_name
           FROM public.athletes a JOIN public.schools s ON s.school_id=a.school_id
          WHERE a.athlete_id=$1 FOR UPDATE`, [row.target_athlete_id]
      )).rows[0];
      if (!target || normalizeName(target.full_name) !== normalizeName(row.source_athlete_name)
          || !schoolMatches(row.expected_school, target.school_name)
          || (target.gender != null && target.gender !== row.source_gender)) {
        throw new Error(`existing target guard failed for ${row.source_athlete_key}`);
      }
      for (const match of row.history_matches) {
        const verified = await client.query(
          `SELECT 1 FROM public.results
            WHERE athlete_id=$1 AND meet_id=$2 AND event_type_id=$3
              AND mark_raw=$4 AND place=$5 AND round=$6 LIMIT 1`,
          [row.target_athlete_id, match.meet_id, match.event_type_id, match.mark_raw, match.place, match.round]
        );
        if (verified.rowCount !== 1) throw new Error(`history overlap guard failed for ${row.source_athlete_key}`);
      }
      if (target.gender == null) {
        const updated = await client.query(
          `UPDATE public.athletes SET gender=$2,updated_at=now()
            WHERE athlete_id=$1 AND full_name=$3 AND gender IS NULL
           RETURNING athlete_id`, [row.target_athlete_id, row.source_gender, target.full_name]
        );
        if (updated.rowCount !== 1) throw new Error(`gender normalization failed for ${row.source_athlete_key}`);
        gendersNormalized += 1;
      }
      await client.query(
        `INSERT INTO public.external_ids
           (athlete_id,source,external_name,external_key,external_url,verified)
         VALUES ($1,'directathletics',$2,$3,$4,true)
         ON CONFLICT (source,external_key) DO NOTHING`,
        [row.target_athlete_id, row.source_athlete_name, row.directathletics_profile_id, row.directathletics_url]
      );
      const external = await client.query(
        `SELECT athlete_id,verified
           FROM public.external_ids
          WHERE source='directathletics' AND external_key=$1
          FOR SHARE`, [row.directathletics_profile_id]
      );
      if (external.rowCount !== 1 || Number(external.rows[0].athlete_id) !== row.target_athlete_id
          || external.rows[0].verified !== true) {
        throw new Error(`external identity verification failed for ${row.source_athlete_key}`);
      }
      await client.query(
        `INSERT INTO ingest.athlete_aliases
           (source,source_athlete_key,source_athlete_name,source_gender,target_athlete_id,
            match_method,status,notes,verified_at,updated_at)
         VALUES ('athletic_net',$1,$2,$3,$4,'verified_alias','active',$5,now(),now())
         ON CONFLICT (source,source_athlete_key) DO NOTHING`,
        [row.source_athlete_key, row.source_athlete_name, row.source_gender, row.target_athlete_id, row.notes]
      );
    }
    const aliases = await client.query(
      `SELECT source_athlete_key,target_athlete_id,status
         FROM ingest.athlete_aliases
        WHERE source='athletic_net' AND source_athlete_key=ANY($1::text[])`,
      [attaches.map(row => row.source_athlete_key)]
    );
    const byKey = new Map(aliases.rows.map(row => [row.source_athlete_key, row]));
    for (const row of attaches) {
      const alias = byKey.get(row.source_athlete_key);
      if (!alias || alias.status !== 'active' || Number(alias.target_athlete_id) !== row.target_athlete_id) {
        throw new Error(`alias verification failed for ${row.source_athlete_key}`);
      }
    }
    await client.query('COMMIT');
    return { identities_created: attaches.length, aliases_created: attaches.length, genders_normalized: gendersNormalized };
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
    application_name: 'trackhub-reviewed-directathletics-history-identity',
    ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  try {
    if (!env.INGEST_DATABASE_URL && !pool) throw new Error('INGEST_DATABASE_URL is required');
    const state = await loadState(db, manifest);
    const plan = buildPlan(manifest.decisions, state);
    const outcome = commit ? await commitPlan(db, plan) : {
      identities_created: 0, aliases_created: 0, genders_normalized: 0,
    };
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

module.exports = {
  buildPlan,
  historyKey,
  normalizeName,
  normalizeSchool,
  parseArgs,
  readManifest,
  run,
  schoolMatches,
};
