#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const env = require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true }).parsed || {};
const migrationPath = path.join(__dirname, '../../supabase/migrations/20260908173000_backfill_legacy_collegiate_status_evidence.sql');
const source = fs.readFileSync(migrationPath, 'utf8');
const sql = source.replace(/^\s*BEGIN;\s*/i, '').replace(/\s*COMMIT;\s*$/i, '');
const commit = process.argv.includes('--commit');

async function main() {
  assert(env.DB_PASSWORD, 'DB_PASSWORD is required');
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.hunbahsnaeeztmzqpnrl', password: env.DB_PASSWORD, database: 'postgres',
    ssl: { rejectUnauthorized: false }, statement_timeout: 180000,
    application_name: 'legacy-collegiate-status-backfill-rollback-test',
  });
  await client.connect();
  try {
    const expected = (await client.query(`
      WITH eligible AS (
        SELECT ats.ats_id, ats.athlete_id, ats.season_code
        FROM public.athlete_team_seasons ats
        JOIN public.teams team USING (team_id)
        JOIN public.schools school ON school.school_id = team.school_id
        JOIN public.athletes athlete USING (athlete_id)
        JOIN public.school_competition_memberships membership
          ON membership.school_id = school.school_id AND membership.is_primary
         AND membership.verification_status <> 'unresolved'
         AND membership.membership_status IN ('active','affiliate','provisional','independent')
         AND membership.valid_to IS NULL
        WHERE school.institution_type = 'collegiate'
          AND ats.season_code ~ '^\\d{4}-\\d{4}$'
          AND split_part(ats.season_code, '-', 2)::int = split_part(ats.season_code, '-', 1)::int + 1
          AND (athlete.gender IS NULL OR team.gender IS NULL OR athlete.gender = team.gender)
      )
      SELECT count(*)::int evidence_rows,
        count(DISTINCT (athlete_id, season_code))::int period_rows
      FROM eligible`)).rows[0];
    const before = (await client.query(`SELECT
      (SELECT count(*)::int FROM public.athlete_status_evidence) evidence_rows,
      (SELECT count(*)::int FROM public.athlete_status_periods) period_rows,
      (SELECT count(*)::int FROM public.athlete_status_period_evidence) bridge_rows,
      (SELECT count(*)::int FROM public.v_athlete_current_status
        WHERE career_stage IS NOT NULL OR professional_status IS NOT NULL) public_current_rows`)).rows[0];

    await client.query('begin');
    await client.query("select pg_advisory_xact_lock(hashtext('20260908_legacy_collegiate_status_backfill'))");
    await client.query(sql);
    const during = (await client.query(`SELECT
      (SELECT count(*)::int FROM public.athlete_status_evidence
        WHERE source='legacy_database' AND evidence_type='legacy_relationship') evidence_rows,
      (SELECT count(*)::int FROM public.athlete_status_periods
        WHERE resolution_method='legacy_team_season_unresolved') period_rows,
      (SELECT count(*)::int FROM public.athlete_status_period_evidence bridge
        JOIN public.athlete_status_evidence evidence USING (athlete_status_evidence_id)
        WHERE evidence.source='legacy_database') bridge_rows,
      (SELECT count(*)::int FROM public.v_athlete_current_status
        WHERE career_stage IS NOT NULL OR professional_status IS NOT NULL) public_current_rows`)).rows[0];
    assert.deepEqual(during, {
      evidence_rows: expected.evidence_rows,
      period_rows: expected.period_rows,
      bridge_rows: expected.evidence_rows,
      public_current_rows: before.public_current_rows,
    });
    await client.query('savepoint privacy_check');
    await client.query('set local role anon');
    assert.equal((await client.query(`select count(*)::int n from public.athlete_status_periods
      where resolution_method='legacy_team_season_unresolved'`)).rows[0].n, 0);
    await assert.rejects(client.query(`select * from public.athlete_status_evidence limit 1`), { code: '42501' });
    await client.query('rollback to savepoint privacy_check');
    await client.query('release savepoint privacy_check');
    if (commit) {
      const ledgerVersion = '20260908173000';
      const ledgerName = 'backfill_legacy_collegiate_status_evidence';
      assert.equal((await client.query(`select count(*)::int n
        from supabase_migrations.schema_migrations where version=$1`, [ledgerVersion])).rows[0].n, 0);
      await client.query(`insert into supabase_migrations.schema_migrations(version,name,statements)
        values ($1,$2,$3::text[])`, [ledgerVersion, ledgerName, [source]]);
      await client.query('commit');
      const verified = (await client.query(`select
        (select count(*)::int from public.athlete_status_evidence
          where source='legacy_database' and evidence_type='legacy_relationship') evidence_rows,
        (select count(*)::int from public.athlete_status_periods
          where resolution_method='legacy_team_season_unresolved') period_rows,
        (select count(*)::int from public.athlete_status_period_evidence bridge
          join public.athlete_status_evidence evidence using (athlete_status_evidence_id)
          where evidence.source='legacy_database') bridge_rows,
        (select count(*)::int from supabase_migrations.schema_migrations
          where version=$1 and name=$2) ledger_rows`, [ledgerVersion, ledgerName])).rows[0];
      assert.deepEqual(verified, {
        evidence_rows: expected.evidence_rows,
        period_rows: expected.period_rows,
        bridge_rows: expected.evidence_rows,
        ledger_rows: 1,
      });
      console.log(JSON.stringify({
        committed: true,
        expected,
        verified,
        provisional_periods_private: true,
        public_current_status_unchanged: true,
      }, null, 2));
      return;
    }
    await client.query('rollback');

    const after = (await client.query(`SELECT
      (SELECT count(*)::int FROM public.athlete_status_evidence) evidence_rows,
      (SELECT count(*)::int FROM public.athlete_status_periods) period_rows,
      (SELECT count(*)::int FROM public.athlete_status_period_evidence) bridge_rows,
      (SELECT count(*)::int FROM public.v_athlete_current_status
        WHERE career_stage IS NOT NULL OR professional_status IS NOT NULL) public_current_rows`)).rows[0];
    assert.deepEqual(after, before);
    console.log(JSON.stringify({
      committed: false,
      expected,
      provisional_periods_private: true,
      public_current_status_unchanged: true,
      rollback_restored_exact_counts: true,
    }, null, 2));
  } finally {
    await client.query('rollback').catch(() => {});
    await client.end();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
