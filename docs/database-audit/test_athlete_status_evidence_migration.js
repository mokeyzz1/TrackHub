#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const env = require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true }).parsed || {};
const migrationPath = path.join(__dirname, '../../supabase/migrations/20260908045520_add_athlete_status_evidence_model.sql');
const source = fs.readFileSync(migrationPath, 'utf8');
const sql = source.replace(/^\s*BEGIN;\s*/i, '').replace(/\s*COMMIT;\s*$/i, '');
const commit = process.argv.includes('--commit');
const verifyLive = process.argv.includes('--verify-live');
assert(!(commit && verifyLive), '--commit and --verify-live cannot be combined');

for (const table of ['athletes','results','relay_results','relay_athletes','athlete_team_seasons','schools','teams']) {
  assert(!new RegExp(`(?:insert\\s+into|update|delete\\s+from|truncate)\\s+(?:public\\.)?${table}\\b`, 'i').test(source), `Migration writes existing table ${table}`);
}

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

async function main() {
  const client = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432, user: 'postgres.hunbahsnaeeztmzqpnrl', password: env.DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("select pg_advisory_xact_lock(hashtext('20260908_athlete_status_evidence'))");
    if (!verifyLive) await client.query(sql);
    if (commit) {
      await client.query('COMMIT');
      console.log(JSON.stringify({ committed: true, schema_only: true, synthetic_rows_committed: false, existing_facts_untouched: true }, null, 2));
      return;
    }
    const athleteId = (await client.query('select min(athlete_id) athlete_id from public.athletes')).rows[0].athlete_id;
    const evidence = (await client.query(`insert into public.athlete_status_evidence
      (athlete_id,status_axis,status_value,effective_from,effective_to,evidence_type,source,source_record_key,verification_status,confidence)
      values ($1,'career_stage','collegiate','2025-07-01','2027-07-01','roster','migration_test','athlete-1-2025','source_verified',1)
      returning athlete_status_evidence_id`, [athleteId])).rows[0];
    const period = (await client.query(`insert into public.athlete_status_periods
      (athlete_id,status_axis,status_value,effective_from,effective_to,resolution_status,resolution_method)
      values ($1,'career_stage','collegiate','2025-07-01','2027-07-01','confirmed','migration_test')
      returning athlete_status_period_id`, [athleteId])).rows[0];
    await client.query('insert into public.athlete_status_period_evidence values ($1,$2,now())', [period.athlete_status_period_id, evidence.athlete_status_evidence_id]);
    await expectSqlState(client, `insert into public.athlete_status_periods
      (athlete_id,status_axis,status_value,effective_from,effective_to,resolution_status,resolution_method)
      values (${Number(athleteId)},'career_stage','post_collegiate','2026-01-01','2028-01-01','confirmed','overlap_test')`, '23P01');
    await client.query(`insert into public.athlete_status_periods
      (athlete_id,status_axis,status_value,effective_from,effective_to,resolution_status,resolution_method)
      values ($1,'professional_status','professional','2026-01-01',null,'confirmed','independent_axis_test')`, [athleteId]);
    await client.query(`insert into public.athlete_status_periods
      (athlete_id,status_axis,status_value,effective_from,effective_to,resolution_status,resolution_method)
      values ($1,'career_stage','post_collegiate','2026-01-01',null,'provisional','private_review_test')`, [athleteId]);
    const current = (await client.query('select * from public.v_athlete_current_status where athlete_id=$1', [athleteId])).rows[0];
    assert.equal(current.career_stage, 'collegiate');
    assert.equal(current.professional_status, 'professional');
    await client.query('SET LOCAL ROLE anon');
    assert.equal((await client.query('select count(*) n from public.athlete_status_periods')).rows[0].n, '2');
    await client.query('select * from public.v_athlete_current_status where athlete_id=$1', [athleteId]);
    await expectSqlState(client, 'select * from public.athlete_status_evidence', '42501');
    await client.query('RESET ROLE');
    await client.query('ROLLBACK');
    console.log(JSON.stringify({ committed: false, raw_evidence_private: true, current_status_public: true, confirmed_overlap_blocked: true, independent_axes: true, existing_facts_untouched: true }, null, 2));
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { await client.end(); }
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
