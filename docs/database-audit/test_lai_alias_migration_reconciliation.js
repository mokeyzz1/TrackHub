#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('../../node_modules/pg');
const dotenv = require('../../node_modules/dotenv');

const root = path.resolve(__dirname, '../..');
const migrationPath = path.join(root, 'supabase/migrations/20260829180000_add_lai_athletic_net_team_aliases.sql');
const source = fs.readFileSync(migrationPath, 'utf8');
const version = '20260829180000';
const name = 'add_lai_athletic_net_team_aliases';
const commit = process.argv.includes('--commit');

const expected = [
  ['Pontificia Univ. Catolica', 'F', 3694, 1876, 'Pontificia Universidad Catolica de Puerto Rico'],
  ['Pontificia Univ. Catolica', 'M', 3693, 1876, 'Pontificia Universidad Catolica de Puerto Rico'],
  ['Sagrado Corazon', 'F', 3700, 1879, 'Sagrado Corazon'],
  ['UPR Bayamon', 'M', 1119, 567, 'P.R.-Bayamon'],
  ['UPR Cayey', 'M', 1123, 569, 'P.R.-Cayey'],
];

async function loadAliases(client) {
  return (await client.query(`
    SELECT alias.source_team_key, alias.source_team_name, alias.source_gender,
           alias.normalized_source_team_key, alias.normalized_source_team_name,
           alias.team_id, alias.match_method, alias.status, alias.notes,
           alias.verified_at, alias.created_at, alias.updated_at,
           school.school_id, school.official_name, team.gender AS team_gender
    FROM ingest.team_aliases alias
    JOIN public.teams team ON team.team_id = alias.team_id
    JOIN public.schools school ON school.school_id = team.school_id
    WHERE alias.source = 'athletic_net'
      AND (alias.source_team_key, alias.source_gender) IN (
        ('Pontificia Univ. Catolica', 'F'), ('Pontificia Univ. Catolica', 'M'),
        ('Sagrado Corazon', 'F'), ('UPR Bayamon', 'M'), ('UPR Cayey', 'M')
      )
    ORDER BY alias.source_team_key, alias.source_gender`)).rows;
}

function assertExpected(rows) {
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map(row => [
    row.source_team_key,
    row.source_gender,
    Number(row.team_id),
    Number(row.school_id),
    row.official_name,
  ]), expected);
  for (const row of rows) {
    assert.equal(row.source_team_name, row.source_team_key);
    assert.equal(row.team_gender, row.source_gender);
    assert.equal(row.match_method, 'verified_alias');
    assert.equal(row.status, 'active');
    assert.equal(row.notes, 'Exact Athletic.net LAI team label corroborated by the canonical Puerto Rico school and existing source identity mappings.');
  }
}

async function main() {
  const env = dotenv.config({ path: path.join(root, '.env'), quiet: true }).parsed || {};
  assert.ok(env.DB_PASSWORD, 'DB_PASSWORD is required');
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.hunbahsnaeeztmzqpnrl', password: env.DB_PASSWORD, database: 'postgres',
    ssl: { rejectUnauthorized: false }, statement_timeout: 120000,
    application_name: 'lai-alias-migration-reconciliation',
  });
  await client.connect();
  try {
    const before = await loadAliases(client);
    assertExpected(before);
    const ledgerBefore = Number((await client.query(`
      SELECT count(*) AS n FROM supabase_migrations.schema_migrations WHERE version=$1`, [version])).rows[0].n);

    if (commit) {
      assert.equal(ledgerBefore, 0, `migration ${version} must be absent before reconciliation`);
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('20260829180000_lai_alias_reconciliation'))");
      assertExpected(await loadAliases(client));
      await client.query(`
        INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
        VALUES ($1, $2, $3::text[])`, [version, name, [source]]);
      await client.query('COMMIT');
      const after = await loadAliases(client);
      assert.deepEqual(after, before, 'ledger-only reconciliation must not alter aliases');
      const ledgerAfter = Number((await client.query(`
        SELECT count(*) AS n FROM supabase_migrations.schema_migrations
        WHERE version=$1 AND name=$2`, [version, name])).rows[0].n);
      assert.equal(ledgerAfter, 1);
      console.log(JSON.stringify({ ledger_recorded: true, aliases_unchanged: true, alias_rows: after.length }, null, 2));
      return;
    }

    await client.query('BEGIN');
    await client.query(source);
    assertExpected(await loadAliases(client));
    await client.query('ROLLBACK');
    const afterRollback = await loadAliases(client);
    assert.deepEqual(afterRollback, before);
    assert.equal(Number((await client.query(`
      SELECT count(*) AS n FROM supabase_migrations.schema_migrations WHERE version=$1`, [version])).rows[0].n), ledgerBefore);
    console.log(JSON.stringify({ replay_rehearsed: true, rollback_exact: true, alias_rows: afterRollback.length, ledger_entries_unchanged: ledgerBefore }, null, 2));
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
