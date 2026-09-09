#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const env = require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true }).parsed || {};
const migrationPath = path.join(__dirname, '../../supabase/migrations/20260908190000_publish_athlete_status_summary.sql');
const source = fs.readFileSync(migrationPath, 'utf8');
const sql = source.replace(/^\s*BEGIN;\s*/i, '').replace(/\s*COMMIT;\s*$/i, '');
const commit = process.argv.includes('--commit');

async function main() {
  assert(env.DB_PASSWORD, 'DB_PASSWORD is required');
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.hunbahsnaeeztmzqpnrl', password: env.DB_PASSWORD, database: 'postgres',
    ssl: { rejectUnauthorized: false }, statement_timeout: 120000,
    application_name: 'athlete-status-summary-migration-test',
  });
  await client.connect();
  try {
    if (process.argv.includes('--verify')) {
      const columns = (await client.query(`select column_name from information_schema.columns
        where table_schema='public' and table_name='v_athlete_status_summary'
        order by ordinal_position`)).rows.map(row => row.column_name);
      assert.deepEqual(columns, [
        'athlete_id', 'current_school_id', 'current_school_institution_type',
        'has_collegiate_school', 'has_collegiate_team_season',
        'has_collegiate_individual_result', 'has_collegiate_relay_result',
        'has_collegiate_history', 'confirmed_current_career_stage',
        'confirmed_current_career_stage_from', 'confirmed_current_career_stage_to',
        'confirmed_current_professional_status', 'confirmed_current_professional_status_from',
        'confirmed_current_professional_status_to',
      ]);
      const live = (await client.query(`select
        has_table_privilege('anon','public.v_athlete_status_summary','select') anon_can_read,
        has_table_privilege('authenticated','public.v_athlete_status_summary','select') authenticated_can_read,
        (select reloptions @> array['security_invoker=true']
           from pg_class where oid='public.v_athlete_status_summary'::regclass) security_invoker,
        (select count(*)::int from public.athletes) athlete_rows,
        (select count(*)::int from public.v_athlete_status_summary) summary_rows,
        (select count(distinct athlete_id)::int from public.v_athlete_status_summary) unique_athletes,
        (select count(*)::int from supabase_migrations.schema_migrations
          where version='20260908190000') ledger_rows`)).rows[0];
      assert.equal(live.anon_can_read, true);
      assert.equal(live.authenticated_can_read, true);
      assert.equal(live.security_invoker, true);
      assert.equal(live.summary_rows, live.athlete_rows);
      assert.equal(live.unique_athletes, live.athlete_rows);
      assert.equal(live.ledger_rows, 1);
      await client.query('begin');
      await client.query('set local role anon');
      await client.query('select * from public.v_athlete_status_summary limit 1');
      await assert.rejects(client.query('select * from public.athlete_status_evidence limit 1'), { code: '42501' });
      await client.query('rollback');
      console.log(JSON.stringify({ ...live, private_evidence_hidden: true }, null, 2));
      return;
    }

    assert.equal((await client.query("select to_regclass('public.v_athlete_status_summary') relation")).rows[0].relation, null);
    await client.query('begin');
    await client.query("select pg_advisory_xact_lock(hashtext('20260908_athlete_status_summary'))");
    await client.query(sql);
    const columns = (await client.query(`select column_name from information_schema.columns
      where table_schema='public' and table_name='v_athlete_status_summary' order by ordinal_position`)).rows.map(row => row.column_name);
    assert.deepEqual(columns, [
      'athlete_id', 'current_school_id', 'current_school_institution_type',
      'has_collegiate_school', 'has_collegiate_team_season',
      'has_collegiate_individual_result', 'has_collegiate_relay_result',
      'has_collegiate_history', 'confirmed_current_career_stage',
      'confirmed_current_career_stage_from', 'confirmed_current_career_stage_to',
      'confirmed_current_professional_status', 'confirmed_current_professional_status_from',
      'confirmed_current_professional_status_to',
    ]);
    const historical = (await client.query(`select * from public.v_athlete_status_summary
      where has_collegiate_team_season order by athlete_id limit 1`)).rows[0];
    assert(historical);
    assert.equal(historical.has_collegiate_history, true);
    assert.equal(historical.confirmed_current_career_stage, null);
    await client.query('savepoint role_test');
    await client.query('set local role anon');
    const publicRow = (await client.query(`select * from public.v_athlete_status_summary
      where athlete_id=$1`, [historical.athlete_id])).rows[0];
    assert.equal(publicRow.has_collegiate_history, true);
    assert.equal(Object.hasOwn(publicRow, 'evidence'), false);
    assert.equal(Object.hasOwn(publicRow, 'resolution_method'), false);
    await assert.rejects(client.query('select * from public.athlete_status_evidence limit 1'), { code: '42501' });
    await client.query('rollback to savepoint role_test');
    await client.query('release savepoint role_test');

    if (commit) {
      const version = '20260908190000';
      const name = 'publish_athlete_status_summary';
      assert.equal((await client.query(`select count(*)::int n from supabase_migrations.schema_migrations
        where version=$1`, [version])).rows[0].n, 0);
      await client.query(`insert into supabase_migrations.schema_migrations(version,name,statements)
        values($1,$2,$3::text[])`, [version, name, [source]]);
      await client.query('commit');
      const live = (await client.query(`select
        has_table_privilege('anon','public.v_athlete_status_summary','select') anon_can_read,
        (select count(*)::int from supabase_migrations.schema_migrations where version=$1) ledger_rows`, [version])).rows[0];
      assert.deepEqual(live, { anon_can_read: true, ledger_rows: 1 });
      console.log(JSON.stringify({ committed: true, ...live, private_evidence_hidden: true }, null, 2));
      return;
    }
    await client.query('rollback');
    assert.equal((await client.query("select to_regclass('public.v_athlete_status_summary') relation")).rows[0].relation, null);
    console.log(JSON.stringify({ committed: false, public_contract_verified: true, private_evidence_hidden: true }, null, 2));
  } finally {
    await client.query('rollback').catch(() => {});
    await client.end();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
