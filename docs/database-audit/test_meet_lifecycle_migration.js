#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const env = require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true }).parsed || {};

const version = '20260909172553';
const name = 'add_meet_lifecycle_contract';
const migrationSource = fs.readFileSync(path.join(__dirname, `../../supabase/migrations/${version}_${name}.sql`), 'utf8');
const rollbackSource = fs.readFileSync(path.join(__dirname, 'rollback_meet_lifecycle_contract.sql'), 'utf8');
const transactionBody = source => source.replace(/^\s*BEGIN;\s*/i, '').replace(/\s*COMMIT;\s*$/i, '');
const migration = transactionBody(migrationSource);
const rollback = transactionBody(rollbackSource);
const commit = process.argv.includes('--commit');
const verify = process.argv.includes('--verify');

async function expectSqlState(client, statement, code) {
  await client.query('SAVEPOINT expected_failure');
  try {
    await client.query(statement);
    assert.fail(`Expected SQLSTATE ${code}`);
  } catch (error) {
    assert.equal(error.code, code, error.message);
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT expected_failure');
    await client.query('RELEASE SAVEPOINT expected_failure');
  }
}

async function schemaState(client) {
  return (await client.query(`SELECT
    to_regclass('public.v_meets_lifecycle')::text AS lifecycle_view,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='meets' AND column_name='meet_timezone') AS has_timezone,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='meets' AND column_name='status_override') AS has_override,
    (SELECT count(*)::int FROM public.meets) AS meet_rows,
    (SELECT count(*)::int FROM public.meets WHERE end_date IS NULL) AS null_end_dates,
    (SELECT count(*)::int FROM supabase_migrations.schema_migrations WHERE version=$1) AS ledger_rows
  `, [version])).rows[0];
}

async function verifyContract(client) {
  const state = await schemaState(client);
  assert.equal(state.lifecycle_view, 'v_meets_lifecycle');
  assert.equal(state.has_timezone, true);
  assert.equal(state.has_override, true);
  assert.equal(state.null_end_dates, 0);
  const statuses = (await client.query(`SELECT
    public.meet_effective_status('2026-04-26','2026-04-26',NULL,NULL,NULL,'2026-04-25 19:00+00') upcoming,
    public.meet_effective_status('2026-04-23','2026-04-25','https://timing.test',NULL,NULL,'2026-04-25 19:00+00') live,
    public.meet_effective_status('2026-04-20','2026-04-20',NULL,NULL,NULL,'2026-04-25 19:00+00') completed,
    public.meet_effective_status('2026-04-26','2026-04-26',NULL,'cancelled',NULL,'2026-04-25 19:00+00') cancelled
  `)).rows[0];
  assert.deepEqual(statuses, {
    upcoming: 'upcoming', live: 'live', completed: 'completed', cancelled: 'cancelled',
  });
  const access = (await client.query(`SELECT
    (SELECT reloptions @> ARRAY['security_invoker=true'] FROM pg_class WHERE oid='public.v_meets_lifecycle'::regclass) AS security_invoker,
    has_table_privilege('anon','public.v_meets_lifecycle','select') AS anon_select,
    has_table_privilege('anon','public.v_meets_lifecycle','update') AS anon_update,
    (SELECT count(*)::int FROM public.v_meets_lifecycle) AS view_rows
  `)).rows[0];
  assert.deepEqual(access, {
    security_invoker: true,
    anon_select: true,
    anon_update: false,
    view_rows: state.meet_rows,
  });
  await expectSqlState(client, `UPDATE public.meets SET meet_timezone='Not/AZone'
    WHERE meet_id=(SELECT min(meet_id) FROM public.meets)`, '23514');
  await client.query('SAVEPOINT anon_read');
  await client.query('SET LOCAL ROLE anon');
  await client.query('SELECT meet_id,effective_status FROM public.v_meets_lifecycle LIMIT 1');
  await client.query('ROLLBACK TO SAVEPOINT anon_read');
  await client.query('RELEASE SAVEPOINT anon_read');
  return state;
}

async function main() {
  assert(env.DB_PASSWORD, 'DB_PASSWORD is required');
  assert(!(commit && verify), '--commit and --verify cannot be combined');
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.hunbahsnaeeztmzqpnrl', password: env.DB_PASSWORD, database: 'postgres',
    ssl: { rejectUnauthorized: false }, statement_timeout: 120000,
    application_name: 'meet-lifecycle-migration-test',
  });
  await client.connect();
  try {
    if (verify) {
      await client.query('BEGIN');
      const state = await verifyContract(client);
      assert.equal(state.ledger_rows, 1);
      await client.query('ROLLBACK');
      console.log(JSON.stringify({ verified: true, ...state }, null, 2));
      return;
    }
    const before = await schemaState(client);
    assert.equal(before.lifecycle_view, null);
    assert.equal(before.has_timezone, false);
    assert.equal(before.has_override, false);
    assert.equal(before.ledger_rows, 0);

    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('20260909_meet_lifecycle_contract'))");
    await client.query(migration);
    const migrated = await verifyContract(client);
    assert.equal(migrated.meet_rows, before.meet_rows);

    await client.query(rollback);
    const restored = await schemaState(client);
    assert.deepEqual(restored, before);

    await client.query(migration);
    await verifyContract(client);
    if (commit) {
      await client.query(`INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
        VALUES($1,$2,$3::text[])`, [version, name, [migrationSource]]);
      await client.query('COMMIT');
      const deployed = await schemaState(client);
      assert.equal(deployed.ledger_rows, 1);
      console.log(JSON.stringify({ committed: true, ...deployed }, null, 2));
    } else {
      await client.query('ROLLBACK');
      assert.deepEqual(await schemaState(client), before);
      console.log(JSON.stringify({ committed: false, rollback_rehearsed: true, ...before }, null, 2));
    }
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
