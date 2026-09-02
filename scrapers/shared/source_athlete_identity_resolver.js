/**
 * Resolve stable source athlete keys to one canonical public.athletes row.
 *
 * Reviewed mappings live in the existing ingest.athlete_aliases and public.external_ids tables.
 * They intentionally take precedence over the legacy one-ID columns on public.athletes: during a
 * reviewed merge the old athlete row can still carry a secondary profile ID until the final delete.
 * If reviewed mappings disagree, resolution fails closed and the caller must not create an athlete.
 */
const { Pool } = require('pg');
const { ensureIngestDatabaseUrl } = require('./private_database_url');

const SOURCE_CONFIG = {
  tfrrs: {
    directSql: `
      SELECT trim(a.tfrrs_athlete_id) AS source_athlete_key,
             a.athlete_id, a.school_id, 'direct_profile'::text AS identity_method
        FROM public.athletes a
       WHERE trim(a.tfrrs_athlete_id) = ANY($2::text[])`
  },
  athletic_net: {
    directSql: `
      SELECT substring(a.athletic_net_url FROM '/athlete/([0-9]+)') AS source_athlete_key,
             a.athlete_id, a.school_id, 'direct_profile'::text AS identity_method
        FROM public.athletes a
       WHERE substring(a.athletic_net_url FROM '/athlete/([0-9]+)') = ANY($2::text[])`
  }
};

function normalizedKeys(values = []) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

class SourceAthleteIdentityResolver {
  constructor(rows = []) {
    this.bySourceKey = new Map();
    for (const row of rows) {
      const sourceKey = String(row.source_athlete_key || '').trim();
      const athleteId = Number(row.athlete_id);
      if (!sourceKey || !Number.isInteger(athleteId)) continue;
      if (!this.bySourceKey.has(sourceKey)) this.bySourceKey.set(sourceKey, []);
      this.bySourceKey.get(sourceKey).push({
        athlete_id: athleteId,
        school_id: row.school_id == null ? null : Number(row.school_id),
        identity_method: row.identity_method
      });
    }
  }

  inspect(sourceKey) {
    const candidates = this.bySourceKey.get(String(sourceKey || '').trim()) || [];
    if (!candidates.length) return { status: 'missing', resolution: null };
    const reviewed = candidates.filter(row =>
      row.identity_method === 'verified_alias' || row.identity_method === 'verified_external_id');
    const eligible = reviewed.length ? reviewed : candidates.filter(row => row.identity_method === 'direct_profile');
    const athleteIds = new Set(eligible.map(row => row.athlete_id));
    if (athleteIds.size !== 1) return { status: 'conflict', resolution: null };
    const athleteId = [...athleteIds][0];
    const row = eligible.find(candidate => candidate.athlete_id === athleteId);
    return {
      status: 'resolved',
      resolution: {
        athlete_id: athleteId,
        school_id: row.school_id,
        identity_method: reviewed.length ? 'reviewed_identity' : 'direct_profile'
      }
    };
  }

  resolve(sourceKey) {
    return this.inspect(sourceKey).resolution;
  }

  hasConflict(sourceKey) {
    return this.inspect(sourceKey).status === 'conflict';
  }

  toAthleteIdMap(sourceKeys = []) {
    const lookup = new Map();
    for (const sourceKey of normalizedKeys(sourceKeys)) {
      const resolved = this.resolve(sourceKey);
      if (!resolved) continue;
      lookup.set(sourceKey, resolved.athlete_id);
      const numericKey = Number(sourceKey);
      if (Number.isFinite(numericKey)) lookup.set(numericKey, resolved.athlete_id);
    }
    return lookup;
  }
}

async function queryIdentityRows(pool, source, sourceKeys) {
  const config = SOURCE_CONFIG[source];
  if (!config) throw new Error(`unsupported athlete identity source: ${source}`);
  const keys = normalizedKeys(sourceKeys);
  if (!keys.length) return [];

  const { rows } = await pool.query(
    `WITH identity_candidates AS (
       SELECT aa.source_athlete_key, aa.target_athlete_id AS athlete_id,
              a.school_id, 'verified_alias'::text AS identity_method
         FROM ingest.athlete_aliases aa
         JOIN public.athletes a ON a.athlete_id = aa.target_athlete_id
        WHERE aa.source = $1
          AND aa.status = 'active'
          AND aa.source_athlete_key = ANY($2::text[])
       UNION ALL
       SELECT x.external_key AS source_athlete_key, x.athlete_id,
              a.school_id, 'verified_external_id'::text AS identity_method
         FROM public.external_ids x
         JOIN public.athletes a ON a.athlete_id = x.athlete_id
        WHERE x.source = $1
          AND x.verified IS TRUE
          AND x.external_key = ANY($2::text[])
       UNION ALL
       ${config.directSql}
     )
     SELECT source_athlete_key, athlete_id, school_id, identity_method
       FROM identity_candidates`,
    [source, keys]
  );
  return rows;
}

async function loadSourceAthleteIdentityResolver({ pool = null, source, sourceKeys, env = process.env } = {}) {
  let activePool = pool;
  let ownsPool = false;
  if (!activePool) {
    ensureIngestDatabaseUrl(env);
    if (!env.INGEST_DATABASE_URL) throw new Error('INGEST_DATABASE_URL is required for athlete identity lookup');
    activePool = new Pool({
      connectionString: env.INGEST_DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      query_timeout: 30000,
      application_name: 'trackhub-athlete-identity-resolver',
      ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
    });
    ownsPool = true;
  }

  try {
    return new SourceAthleteIdentityResolver(await queryIdentityRows(activePool, source, sourceKeys));
  } finally {
    if (ownsPool) await activePool.end();
  }
}

module.exports = {
  SourceAthleteIdentityResolver,
  loadSourceAthleteIdentityResolver,
  normalizedKeys,
  queryIdentityRows
};
