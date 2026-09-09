#!/usr/bin/env node
const assert = require('node:assert/strict');
const path = require('node:path');
const { Client } = require('pg');
const env = require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true }).parsed || {};
const {
  buildRosterObservation,
  buildRosterPlan,
  loadRosterContext,
  persistRosterPlan,
} = require('../../scrapers/shared/collegiate_roster_evidence');

async function main() {
  assert(env.DB_PASSWORD, 'DB_PASSWORD is required');
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.hunbahsnaeeztmzqpnrl',
    password: env.DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    statement_timeout: 120000,
    application_name: 'collegiate-roster-evidence-rollback-test',
  });
  await client.connect();
  let sourceRecordKey;
  let athleteId;
  let teamId;
  try {
    const candidate = (await client.query(`
      select athlete.athlete_id, athlete.tfrrs_athlete_id, athlete.full_name,
             athlete.gender, team.team_id, team.school_id
      from public.athletes athlete
      join public.teams team
        on team.school_id = athlete.school_id and team.gender = athlete.gender
      join public.schools school on school.school_id = team.school_id
      join public.school_competition_memberships membership
        on membership.school_id = school.school_id and membership.is_primary
       and membership.valid_to is null and membership.verification_status <> 'unresolved'
       and membership.membership_status in ('active','affiliate','provisional','independent')
      where school.institution_type = 'collegiate'
        and athlete.tfrrs_athlete_id ~ '^[0-9]+$'
        and (select count(*) from public.athletes duplicate
             where duplicate.tfrrs_athlete_id = athlete.tfrrs_athlete_id) = 1
        and (select count(*) from public.teams duplicate_team
             where duplicate_team.school_id = team.school_id
               and duplicate_team.gender = team.gender) = 1
      order by athlete.athlete_id
      limit 1
    `)).rows[0];
    assert(candidate, 'No unique collegiate test candidate found');
    athleteId = Number(candidate.athlete_id);
    teamId = Number(candidate.team_id);

    const makeObservation = season => buildRosterObservation({
      tfrrs_athlete_id: candidate.tfrrs_athlete_id,
      full_name: candidate.full_name,
      school_id: Number(candidate.school_id),
      gender: candidate.gender,
      tfrrs_team_url: `https://www.tfrrs.org/teams/tf/rollback_test_${teamId}.html`,
      season,
    });

    const success = makeObservation('2098-2099');
    sourceRecordKey = success.source_record_key;
    await client.query('begin');
    const successPlan = buildRosterPlan([success], await loadRosterContext(client, [success]));
    assert.equal(successPlan.ready.length, 1);
    assert.deepEqual(await persistRosterPlan(client, successPlan.ready), { season_rows: 1, evidence_rows: 1 });
    assert.equal((await client.query(`select count(*)::int n from public.athlete_team_seasons
      where athlete_id=$1 and team_id=$2 and season_code='2098-2099'`, [athleteId, teamId])).rows[0].n, 1);
    assert.equal((await client.query(`select count(*)::int n from public.athlete_status_evidence
      where source='tfrrs' and source_record_key=$1`, [sourceRecordKey])).rows[0].n, 1);
    await client.query('rollback');

    const failure = makeObservation('2099-2100');
    await client.query('begin');
    const failurePlan = buildRosterPlan([failure], await loadRosterContext(client, [failure]));
    assert.equal(failurePlan.ready.length, 1);
    failurePlan.ready[0].observation.source_record_key = null;
    await assert.rejects(persistRosterPlan(client, failurePlan.ready), { code: '23502' });
    await client.query('rollback');

    const remaining = (await client.query(`select
      (select count(*)::int from public.athlete_team_seasons
       where athlete_id=$1 and team_id=$2 and season_code in ('2098-2099','2099-2100')) season_rows,
      (select count(*)::int from public.athlete_status_evidence
       where source='tfrrs' and source_url like '%rollback_test_%') evidence_rows`, [athleteId, teamId])).rows[0];
    assert.deepEqual(remaining, { season_rows: 0, evidence_rows: 0 });
    console.log(JSON.stringify({
      live_writes_committed: false,
      success_path_verified: true,
      forced_failure_rolled_back: true,
      remaining_test_season_rows: 0,
      remaining_test_evidence_rows: 0,
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
