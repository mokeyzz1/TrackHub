#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const env = require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true }).parsed || {};
const migrationPath = path.join(__dirname, '../../supabase/migrations/20260907195650_normalize_collegiate_competition_hierarchy.sql');
const source = fs.readFileSync(migrationPath, 'utf8');
assert(!/(insert|update|delete|truncate)\s+(into\s+)?public\.(athletes|results|relay_results|relay_athletes|meets)\b/i.test(source));
const sql = source.replace(/^\s*BEGIN;\s*/i, '').replace(/\s*COMMIT;\s*$/i, '');
const commit = process.argv.includes('--commit');

async function main() {
  const client = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432, user: 'postgres.hunbahsnaeeztmzqpnrl', password: env.DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("select pg_advisory_xact_lock(hashtext('20260907_competition_hierarchy'))");
    const factTables = ['athletes','results','relay_results','relay_athletes','meets'];
    const factIdentitySql = `
      select c.relname, c.oid::text, c.relfilenode::text
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=any($1::text[])
      order by c.relname`;
    const facts = (await client.query(factIdentitySql, [factTables])).rows;
    assert.equal(facts.length, factTables.length);
    await client.query(sql);
    assert.equal(Number((await client.query('select count(*) n from public.athletic_governing_organizations')).rows[0].n), 12);
    assert.equal(Number((await client.query('select count(*) n from public.competition_levels')).rows[0].n), 6);
    const classified = Number((await client.query("select count(*) n from public.schools where institution_type='collegiate' and division_id is not null")).rows[0].n);
    assert.equal(Number((await client.query('select count(*) n from public.school_competition_memberships where is_primary and valid_to is null')).rows[0].n), classified);
    const bahamas = (await client.query("select division from public.schools where school_id=2134")).rows[0];
    assert.equal(bahamas.division, 'INDEPENDENT');
    const profile = (await client.query('select organization_code, membership_status from public.school_competition_profiles where school_id=2134')).rows[0];
    assert.equal(profile.organization_code, null); assert.equal(profile.membership_status, 'independent');
    assert.deepEqual((await client.query(factIdentitySql, [factTables])).rows, facts, 'fact-table identity changed');
    await client.query(commit ? 'COMMIT' : 'ROLLBACK');
    console.log(JSON.stringify({ committed: commit, organizations: 12, levels: 6, primary_memberships: classified, bahamas: 'INDEPENDENT', fact_tables_unchanged: true }, null, 2));
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { await client.end(); }
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
