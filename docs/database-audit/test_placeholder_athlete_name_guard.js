#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('../../node_modules/pg');
const dotenv = require('../../node_modules/dotenv');

const root = path.resolve(__dirname, '../..');
const migrationPath = path.join(root, 'supabase/migrations/20260908202312_reject_placeholder_athlete_names.sql');
const source = fs.readFileSync(migrationPath, 'utf8');
const commit = process.argv.includes('--commit');

assert.match(source, /athletes_full_name_not_placeholder/);
assert.match(source, /VALIDATE CONSTRAINT athletes_full_name_not_placeholder/);
assert.match(source, /namewithheld/);
assert.match(source, /unknownathlete/);

if (!process.argv.includes('--live')) {
  console.log('placeholder athlete guard migration: static checks passed');
  process.exit(0);
}

async function main() {
  const env = dotenv.config({ path: path.join(root, '.env'), quiet: true }).parsed || {};
  assert.ok(env.DB_PASSWORD, 'DB_PASSWORD is required for --live');
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.hunbahsnaeeztmzqpnrl',
    password: env.DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    statement_timeout: 120000,
    application_name: 'placeholder-name-guard-rollback-test',
  });
  const validId = -900000000000001;
  const invalidId = -900000000000002;
  await client.connect();
  try {
    if (process.argv.includes('--verify')) {
      const live = (await client.query(`
        SELECT constraint_row.convalidated,
          (SELECT count(*)::int
             FROM supabase_migrations.schema_migrations
            WHERE version = '20260908202312') AS ledger_rows,
          (SELECT count(*)::int
             FROM public.athletes athlete
            WHERE btrim(athlete.full_name) = ''
               OR regexp_replace(lower(btrim(athlete.full_name)), '[^a-z0-9]+', '', 'g') IN (
                 'namewithheld', 'identitywithheld', 'withheld', 'unknown', 'unknownathlete',
                 'anonymous', 'redacted', 'unidentified', 'noname', 'notavailable', 'na',
                 'athlete', 'unattached'
               )) AS invalid_athletes
        FROM pg_constraint constraint_row
        WHERE constraint_row.conrelid = 'public.athletes'::regclass
          AND constraint_row.conname = 'athletes_full_name_not_placeholder'`)).rows[0];
      assert.deepEqual(live, { convalidated: true, ledger_rows: 1, invalid_athletes: 0 });
      console.log(JSON.stringify(live, null, 2));
      return;
    }

    const wasDeployed = Boolean((await client.query(`
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.athletes'::regclass
        AND conname = 'athletes_full_name_not_placeholder'`)).rowCount);
    await client.query('BEGIN');
    await client.query(source);

    const constraint = (await client.query(`
      SELECT convalidated, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'public.athletes'::regclass
        AND conname = 'athletes_full_name_not_placeholder'`)).rows[0];
    assert.equal(constraint?.convalidated, true);
    assert.match(constraint.definition, /namewithheld/);

    await client.query('SAVEPOINT valid_name');
    await client.query(`
      INSERT INTO public.athletes (athlete_id, school_id, full_name, is_active)
      VALUES ($1, 1835, 'Guard Test Athlete', true)`, [validId]);
    await client.query('ROLLBACK TO SAVEPOINT valid_name');
    await client.query('RELEASE SAVEPOINT valid_name');

    await client.query('SAVEPOINT invalid_placeholder');
    let rejected = false;
    try {
      await client.query(`
        INSERT INTO public.athletes (athlete_id, school_id, full_name, is_active)
        VALUES ($1, 1835, '[Name Withheld]', true)`, [invalidId]);
    } catch (error) {
      rejected = error.code === '23514';
      await client.query('ROLLBACK TO SAVEPOINT invalid_placeholder');
    }
    assert.equal(rejected, true, 'database must reject a placeholder athlete name');

    if (commit) {
      const version = '20260908202312';
      const name = 'reject_placeholder_athlete_names';
      const existingLedger = Number((await client.query(`
        SELECT count(*) AS n
        FROM supabase_migrations.schema_migrations
        WHERE version = $1`, [version])).rows[0].n);
      assert.equal(existingLedger, 0, `migration ledger version ${version} already exists`);
      await client.query(`
        INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
        VALUES ($1, $2, $3::text[])`, [version, name, [source]]);
      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
    }

    const retained = Number((await client.query(`
      SELECT count(*) AS n FROM public.athletes
      WHERE athlete_id = ANY($1::bigint[])`, [[validId, invalidId]])).rows[0].n);
    assert.equal(retained, 0);
    const deployed = (await client.query(`
      SELECT constraint_row.convalidated,
        (SELECT count(*)::int
           FROM supabase_migrations.schema_migrations
          WHERE version = '20260908202312') AS ledger_rows
      FROM pg_constraint constraint_row
      WHERE constraint_row.conrelid = 'public.athletes'::regclass
        AND constraint_row.conname = 'athletes_full_name_not_placeholder'`)).rows[0] || null;
    if (commit) {
      assert.deepEqual(deployed, { convalidated: true, ledger_rows: 1 });
      console.log('placeholder athlete guard migration: committed, validated, ledger recorded once; zero test rows retained');
    } else {
      if (wasDeployed) {
        assert.deepEqual(deployed, { convalidated: true, ledger_rows: 1 });
      } else {
        assert.equal(deployed, null);
      }
      console.log('placeholder athlete guard migration: live rollback checks passed; zero test rows retained');
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
