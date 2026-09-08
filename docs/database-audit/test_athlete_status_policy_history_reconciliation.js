#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('../../node_modules/pg');
const dotenv = require('../../node_modules/dotenv');
const { fingerprint, ledgerFingerprint } = require('./reconcile_migrations');

const root = path.resolve(__dirname, '../..');
const historicalPath = path.join(root, 'supabase/migrations/20260908045520_add_athlete_status_evidence_model.sql');
const correctionPath = path.join(root, 'supabase/migrations/20260908205937_restrict_athlete_status_period_reads_to_confirmed.sql');
const historicalSource = fs.readFileSync(historicalPath, 'utf8');
const correctionSource = fs.readFileSync(correctionPath, 'utf8');
const correctionSql = correctionSource.replace(/^\s*BEGIN;\s*/i, '').replace(/\s*COMMIT;\s*$/i, '');
const commit = process.argv.includes('--commit');
const correctionVersion = '20260908205937';
const correctionName = 'restrict_athlete_status_period_reads_to_confirmed';

async function policyQual(client) {
  const rows = (await client.query(`
    SELECT qual
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename='athlete_status_periods'
      AND policyname='athlete_status_periods_public_read'`)).rows;
  assert.equal(rows.length, 1);
  return rows[0].qual;
}

async function main() {
  const env = dotenv.config({ path: path.join(root, '.env'), quiet: true }).parsed || {};
  assert.ok(env.DB_PASSWORD, 'DB_PASSWORD is required');
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.hunbahsnaeeztmzqpnrl', password: env.DB_PASSWORD, database: 'postgres',
    ssl: { rejectUnauthorized: false }, statement_timeout: 120000,
    application_name: 'athlete-status-policy-history-reconciliation',
  });
  await client.connect();
  try {
    const historicalLedger = (await client.query(`
      SELECT name, statements
      FROM supabase_migrations.schema_migrations
      WHERE version='20260908045520'`)).rows;
    assert.equal(historicalLedger.length, 1);
    assert.equal(historicalLedger[0].name, 'add_athlete_status_evidence_model');
    assert.equal(fingerprint(historicalSource), ledgerFingerprint(historicalLedger[0].statements || []),
      'historical migration file must match its recorded live statements');

    const beforeQual = await policyQual(client);
    assert.match(beforeQual, /resolution_status.*confirmed/);
    const existingCorrection = Number((await client.query(`
      SELECT count(*) AS n FROM supabase_migrations.schema_migrations
      WHERE version=$1`, [correctionVersion])).rows[0].n);

    if (commit) {
      assert.equal(existingCorrection, 0);
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('20260908205937_status_policy_reconciliation'))");
      assert.match(await policyQual(client), /resolution_status.*confirmed/);
      await client.query(`
        INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
        VALUES ($1,$2,$3::text[])`, [correctionVersion, correctionName, [correctionSource]]);
      await client.query('COMMIT');
      assert.equal(await policyQual(client), beforeQual);
      assert.equal(Number((await client.query(`
        SELECT count(*) AS n FROM supabase_migrations.schema_migrations
        WHERE version=$1 AND name=$2`, [correctionVersion, correctionName])).rows[0].n), 1);
      console.log(JSON.stringify({ historical_bytes_restored: true, correction_ledger_recorded: true, live_policy_unchanged: true }, null, 2));
      return;
    }

    await client.query('BEGIN');
    await client.query(correctionSql);
    assert.match(await policyQual(client), /resolution_status.*confirmed/);
    await client.query('ROLLBACK');
    assert.equal(await policyQual(client), beforeQual);
    assert.equal(Number((await client.query(`
      SELECT count(*) AS n FROM supabase_migrations.schema_migrations
      WHERE version=$1 AND name=$2`, [correctionVersion, correctionName])).rows[0].n), existingCorrection);
    console.log(JSON.stringify({ historical_bytes_restored: true, correction_replay_rehearsed: true, rollback_exact: true, ledger_entries_unchanged: existingCorrection }, null, 2));
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
