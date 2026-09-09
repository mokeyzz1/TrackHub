#!/usr/bin/env node
// Read-only ID-01 audit. It reports identity ownership and collision counts; it never writes data.
const path = require('node:path');
const { Client } = require('pg');
const dotenv = require('dotenv');

const root = path.resolve(__dirname, '../..');
const env = dotenv.config({ path: path.join(root, '.env'), quiet: true }).parsed || {};

async function main() {
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.hunbahsnaeeztmzqpnrl',
    password: env.DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    statement_timeout: 120000,
    application_name: 'id01-identity-audit',
  });
  await client.connect();
  try {
    const query = async (sql, values = []) => (await client.query(sql, values)).rows;
    const result = {};
    result.athletes = (await query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE is_active)::int AS active,
             count(*) FILTER (WHERE nullif(btrim(tfrrs_athlete_id), '') IS NOT NULL)::int AS with_tfrrs,
             count(*) FILTER (WHERE nullif(btrim(athletic_net_url), '') IS NOT NULL)::int AS with_athletic_net,
             count(*) FILTER (WHERE nullif(btrim(tfrrs_athlete_id), '') IS NULL
                               AND nullif(btrim(athletic_net_url), '') IS NULL)::int AS with_no_legacy_source,
             count(*) FILTER (WHERE lower(full_name) LIKE '%withheld%'
                               OR lower(full_name) LIKE '%unknown%')::int AS placeholder_like
      FROM public.athletes`))[0];
    result.duplicate_tfrrs = (await query(`
      SELECT count(*)::int AS groups, coalesce(sum(n - 1), 0)::int AS extra
      FROM (
        SELECT lower(btrim(tfrrs_athlete_id)) AS key, count(*)::int AS n
        FROM public.athletes
        WHERE nullif(btrim(tfrrs_athlete_id), '') IS NOT NULL
        GROUP BY 1 HAVING count(*) > 1
      ) duplicates`))[0];
    result.duplicate_athletic_net = (await query(`
      SELECT count(*)::int AS groups, coalesce(sum(n - 1), 0)::int AS extra
      FROM (
        SELECT lower(btrim(athletic_net_url)) AS key, count(*)::int AS n
        FROM public.athletes
        WHERE nullif(btrim(athletic_net_url), '') IS NOT NULL
        GROUP BY 1 HAVING count(*) > 1
      ) duplicates`))[0];
    result.athletic_net_collision_shapes = (await query(`
      SELECT count(*)::int AS groups,
             count(*) FILTER (WHERE same_shape)::int AS same_shape,
             count(*) FILTER (WHERE NOT same_shape)::int AS mixed_shape
      FROM (
        SELECT lower(btrim(athletic_net_url)) AS key,
               count(DISTINCT lower(regexp_replace(full_name, '[^a-z0-9]+', '', 'g'))) = 1
                 AND count(DISTINCT gender) = 1
                 AND count(DISTINCT school_id) = 1 AS same_shape
        FROM public.athletes
        WHERE nullif(btrim(athletic_net_url), '') IS NOT NULL
        GROUP BY 1 HAVING count(*) > 1
      ) collisions`))[0];
    result.external_ids = (await query(`
      SELECT count(*)::int AS rows, count(DISTINCT athlete_id)::int AS athletes,
             count(*) FILTER (WHERE verified)::int AS verified
      FROM public.external_ids`))[0];
    result.external_id_collisions = (await query(`
      SELECT count(*)::int AS groups, coalesce(sum(n - 1), 0)::int AS extra
      FROM (
        SELECT lower(source) || '|' || lower(btrim(coalesce(external_key, external_url, external_name, external_id::text))) AS key,
               count(*)::int AS n
        FROM public.external_ids
        GROUP BY 1 HAVING count(*) > 1
      ) duplicates`))[0];
    result.aliases = (await query(`
      SELECT count(*)::int AS rows, count(DISTINCT target_athlete_id)::int AS athletes,
             count(*) FILTER (WHERE status = 'active')::int AS active,
             count(*) FILTER (WHERE status <> 'active')::int AS inactive
      FROM ingest.athlete_aliases`))[0];
    result.external_ids_by_source = await query(`
      SELECT source, count(*)::int AS rows, count(DISTINCT athlete_id)::int AS athletes
      FROM public.external_ids GROUP BY source ORDER BY source`);
    result.aliases_by_source = await query(`
      SELECT source, count(*)::int AS rows, count(DISTINCT target_athlete_id)::int AS athletes
      FROM ingest.athlete_aliases GROUP BY source ORDER BY source`);
    result.legacy_tfrrs_alias_coverage = (await query(`
      SELECT count(*)::int AS rows
      FROM public.athletes athlete
      JOIN ingest.athlete_aliases alias
        ON alias.target_athlete_id = athlete.athlete_id
       AND alias.source = 'tfrrs'
       AND lower(btrim(alias.source_athlete_key)) = lower(btrim(athlete.tfrrs_athlete_id))
      WHERE nullif(btrim(athlete.tfrrs_athlete_id), '') IS NOT NULL`))[0];
    result.legacy_athletic_net_alias_coverage = (await query(`
      SELECT count(*)::int AS rows
      FROM public.athletes athlete
      JOIN ingest.athlete_aliases alias
        ON alias.target_athlete_id = athlete.athlete_id
       AND alias.source = 'athletic_net'
       AND lower(btrim(alias.source_athlete_key)) = substring(lower(btrim(athlete.athletic_net_url)) FROM '/athlete/([0-9]+)')
      WHERE athlete.athletic_net_url LIKE '%/athlete/%'`))[0];
    result.alias_key_shapes = await query(`
      SELECT source,
             count(*) FILTER (WHERE source_athlete_key ~ '^[0-9]+$')::int AS numeric_keys,
             count(*) FILTER (WHERE source_athlete_key LIKE 'http%')::int AS url_keys,
             count(*) FILTER (WHERE source_athlete_key LIKE '%/%'
                               AND source_athlete_key NOT LIKE 'http%')::int AS path_keys,
             count(*) FILTER (WHERE source_athlete_key !~ '^[0-9]+$'
                               AND source_athlete_key NOT LIKE 'http%'
                               AND source_athlete_key NOT LIKE '%/%')::int AS other_keys
      FROM ingest.athlete_aliases
      GROUP BY source ORDER BY source`);
    result.external_key_shapes = await query(`
      SELECT source,
             count(*) FILTER (WHERE nullif(btrim(external_key), '') IS NOT NULL)::int AS external_key_rows,
             count(*) FILTER (WHERE nullif(btrim(external_url), '') IS NOT NULL)::int AS external_url_rows,
             count(*) FILTER (WHERE nullif(btrim(external_name), '') IS NOT NULL)::int AS external_name_rows
      FROM public.external_ids
      GROUP BY source ORDER BY source`);
    result.alias_collisions = (await query(`
      SELECT count(*)::int AS groups, coalesce(sum(n - 1), 0)::int AS extra
      FROM (
        SELECT lower(source) || '|' || lower(btrim(source_athlete_key)) AS key, count(*)::int AS n
        FROM ingest.athlete_aliases
        WHERE status = 'active'
        GROUP BY 1 HAVING count(*) > 1
      ) duplicates`))[0];
    result.alias_orphans = (await query(`
      SELECT count(*)::int AS orphan_rows
      FROM ingest.athlete_aliases alias
      LEFT JOIN public.athletes athlete ON athlete.athlete_id = alias.target_athlete_id
      WHERE athlete.athlete_id IS NULL`))[0];
    result.external_orphans = (await query(`
      SELECT count(*)::int AS orphan_rows
      FROM public.external_ids external_id
      LEFT JOIN public.athletes athlete ON athlete.athlete_id = external_id.athlete_id
      WHERE athlete.athlete_id IS NULL`))[0];
    result.identity_constraints = await query(`
      SELECT conname, contype, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid IN ('public.athletes'::regclass, 'public.external_ids'::regclass,
                         'ingest.athlete_aliases'::regclass)
      ORDER BY conrelid::text, conname`);
    result.identity_indexes = await query(`
      SELECT schemaname, tablename, indexname, indexdef
      FROM pg_indexes
      WHERE (schemaname, tablename) IN (('public', 'athletes'),
                                        ('public', 'external_ids'),
                                        ('ingest', 'athlete_aliases'))
      ORDER BY schemaname, tablename, indexname`);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
