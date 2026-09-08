#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const env = require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true }).parsed || {};
const rollbackSource = fs.readFileSync(
  path.join(__dirname, 'rollback_legacy_collegiate_status_backfill.sql'), 'utf8');
const rollbackSql = rollbackSource.replace(/^\s*BEGIN;\s*/i, '').replace(/\s*COMMIT;\s*$/i, '');

async function counts(client) {
  return (await client.query(`select
    (select count(*)::int from public.athlete_status_evidence
      where source='legacy_database' and evidence_type='legacy_relationship') evidence_rows,
    (select count(*)::int from public.athlete_status_periods
      where resolution_method='legacy_team_season_unresolved') period_rows,
    (select count(*)::int from public.athlete_status_period_evidence bridge
      join public.athlete_status_evidence evidence using (athlete_status_evidence_id)
      where evidence.source='legacy_database') bridge_rows`)).rows[0];
}

async function main() {
  assert(env.DB_PASSWORD, 'DB_PASSWORD is required');
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.hunbahsnaeeztmzqpnrl', password: env.DB_PASSWORD, database: 'postgres',
    ssl: { rejectUnauthorized: false }, statement_timeout: 180000,
    application_name: 'legacy-collegiate-status-rollback-test',
  });
  await client.connect();
  try {
    const before = await counts(client);
    assert.deepEqual(before, { evidence_rows: 127334, period_rows: 126925, bridge_rows: 127334 });
    await client.query('begin');
    await client.query("select pg_advisory_xact_lock(hashtext('20260908_legacy_collegiate_status_backfill'))");
    await client.query(rollbackSql);
    assert.deepEqual(await counts(client), { evidence_rows: 0, period_rows: 0, bridge_rows: 0 });
    assert.equal((await client.query(`select count(*)::int n from pg_constraint
      where conrelid='public.athlete_status_periods'::regclass
        and conname='athlete_status_periods_identity_uq'`)).rows[0].n, 0);
    await client.query('rollback');
    assert.deepEqual(await counts(client), before);
    console.log(JSON.stringify({ committed: false, rollback_rehearsed: true, restored: before }, null, 2));
  } finally {
    await client.query('rollback').catch(() => {});
    await client.end();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
