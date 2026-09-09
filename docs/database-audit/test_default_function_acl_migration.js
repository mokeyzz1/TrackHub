#!/usr/bin/env node
// Bounded live test for SEC-01's future-function default ACL migration.
// Default mode rehearses the change and rolls it back; --commit applies the exact
// SQL and records the matching private migration-ledger entry; --verify is read-only.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const env = require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true }).parsed || {};

const version = '20260908213000';
const name = 'harden_default_function_execute_acl';
const migrationPath = path.join(__dirname, '../../supabase/migrations/20260908213000_harden_default_function_execute_acl.sql');
const source = fs.readFileSync(migrationPath, 'utf8');
const sql = source.replace(/^\s*BEGIN;\s*/i, '').replace(/\s*COMMIT;\s*$/i, '');
const commit = process.argv.includes('--commit');
const verify = process.argv.includes('--verify');

function client() {
  return new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.hunbahsnaeeztmzqpnrl',
    password: env.DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    statement_timeout: 120000,
    application_name: 'sec-01-default-function-acl-test',
  });
}

async function readDefaults(db) {
  return (await db.query(`
    select coalesce(n.nspname, '<all>') as schema_name, d.defaclobjtype,
           coalesce(d.defaclacl::text, '<default>') as acl
      from pg_default_acl d
      left join pg_namespace n on n.oid=d.defaclnamespace
     where d.defaclrole='postgres'::regrole
       and d.defaclobjtype='f'
       and (d.defaclnamespace=0 or n.nspname in ('public','ingest','archive'))
     order by 1
  `)).rows;
}

async function assertHardened(db, probe = null) {
  const defaults = await readDefaults(db);
  const bySchema = new Map(defaults.map(row => [row.schema_name, row.acl]));
  const global = bySchema.get('<all>') || '';
  assert.equal(/(?:^|,)=X\/postgres/.test(global), false);
  assert.match(bySchema.get('public') || '', /postgres=X\/postgres/);
  assert.match(bySchema.get('public') || '', /service_role=X\/postgres/);
  assert.equal(/anon=X\/postgres/.test(bySchema.get('public') || ''), false);
  assert.equal(/authenticated=X\/postgres/.test(bySchema.get('public') || ''), false);
  assert.equal(bySchema.get('ingest'), '{service_role=X/postgres}');
  assert.equal(bySchema.get('archive'), '{service_role=X/postgres}');
  for (const signature of [
    'public.detect_timing_platform(text)',
    'public.get_top_performances(date,date,text,character,integer)',
    'public.get_weekly_performances(date,date,text,integer)',
    'public.register_push_token(text,text)',
  ]) {
    const row = (await db.query('select has_function_privilege($1,$2,$3) as anon, has_function_privilege($4,$2,$3) as auth',
      ['anon', signature, 'execute', 'authenticated'])).rows[0];
    assert.equal(row.anon, true, `${signature} must retain anon EXECUTE`);
    assert.equal(row.auth, true, `${signature} must retain authenticated EXECUTE`);
  }
  const helpers = (await db.query(`select
      has_function_privilege('anon','public.update_updated_at_column()','execute') as public_helper,
      has_function_privilege('anon','ingest.clear_recovery_queue_error_on_complete()','execute') as ingest_helper`)).rows[0];
  assert.deepEqual(helpers, { public_helper: false, ingest_helper: false });
  if (probe) {
    const privileges = (await db.query(`select
      has_function_privilege('anon',$1,'execute') as anon,
      has_function_privilege('authenticated',$1,'execute') as authenticated,
      has_function_privilege('service_role',$1,'execute') as service_role`, [probe])).rows[0];
    assert.deepEqual(privileges, { anon: false, authenticated: false, service_role: true });
  }
  return defaults;
}

async function main() {
  assert(env.DB_PASSWORD, 'DB_PASSWORD is required');
  const db = client();
  await db.connect();
  try {
    const existing = (await db.query('select count(*)::int as count from supabase_migrations.schema_migrations where version=$1', [version])).rows[0].count;
    if (verify) {
      assert.equal(existing, 1, 'live migration ledger must contain one SEC-01 entry');
      const defaults = await assertHardened(db);
      console.log(JSON.stringify({ verified: true, ledger_rows: existing, function_defaults: defaults }, null, 2));
      return;
    }
    assert.equal(existing, 0, `migration ${version} is already recorded`);
    await db.query('begin');
    await db.query(sql);
    await db.query(`create function public.sec01_default_acl_probe() returns integer
      language sql immutable as $$ select 1 $$`);
    const defaults = await assertHardened(db, 'public.sec01_default_acl_probe()');
    await db.query('drop function public.sec01_default_acl_probe()');
    if (commit) {
      await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])',
        [version, name, [source]]);
      await db.query('commit');
      assert.equal((await db.query('select count(*)::int as count from supabase_migrations.schema_migrations where version=$1', [version])).rows[0].count, 1);
      console.log(JSON.stringify({ committed: true, ledger_rows: 1, function_defaults: defaults }, null, 2));
      return;
    }
    await db.query('rollback');
    assert.equal((await db.query('select count(*)::int as count from supabase_migrations.schema_migrations where version=$1', [version])).rows[0].count, 0);
    console.log(JSON.stringify({ committed: false, rolled_back: true, function_defaults_rehearsed: true }, null, 2));
  } finally {
    await db.query('rollback').catch(() => {});
    await db.end();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
