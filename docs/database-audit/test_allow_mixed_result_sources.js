#!/usr/bin/env node
// Rehearse or apply the mixed-provider meet summary constraint with its exact rollback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const env = require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true }).parsed || {};

const version = '20260909041600';
const name = 'allow_mixed_result_sources';
const source = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260909041600_allow_mixed_result_sources.sql'), 'utf8');
const rollback = fs.readFileSync(path.join(__dirname, 'rollback_allow_mixed_result_sources.sql'), 'utf8');
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
    application_name: 'mixed-result-source-migration-test',
  });
}

async function constraintDefinition(db) {
  const result = await db.query(`
    select pg_get_constraintdef(oid) as definition
      from pg_constraint
     where conrelid='public.meets'::regclass
       and conname='meets_results_source_check'
  `);
  assert.equal(result.rowCount, 1, 'expected exactly one results-source constraint');
  return result.rows[0].definition;
}

async function main() {
  assert(env.DB_PASSWORD, 'DB_PASSWORD is required');
  const db = client();
  await db.connect();
  try {
    const ledgerRows = Number((await db.query(
      'select count(*)::int as count from supabase_migrations.schema_migrations where version=$1',
      [version]
    )).rows[0].count);
    if (verify) {
      assert.equal(ledgerRows, 1);
      assert.match(await constraintDefinition(db), /mixed/);
      console.log(JSON.stringify({ verified: true, ledger_rows: ledgerRows }));
      return;
    }
    assert.equal(ledgerRows, 0, `migration ${version} is already recorded`);

    await db.query('begin');
    await db.query(source);
    assert.match(await constraintDefinition(db), /mixed/);
    await db.query(rollback);
    assert.doesNotMatch(await constraintDefinition(db), /mixed/);
    await db.query(source);
    assert.match(await constraintDefinition(db), /mixed/);

    if (commit) {
      await db.query(
        'insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])',
        [version, name, [source]]
      );
      await db.query('commit');
      console.log(JSON.stringify({ committed: true, ledger_rows: 1 }));
    } else {
      await db.query('rollback');
      console.log(JSON.stringify({ committed: false, rolled_back: true }));
    }
  } finally {
    await db.query('rollback').catch(() => {});
    await db.end();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
