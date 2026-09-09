#!/usr/bin/env node
const path = require('node:path');
const { Client } = require('pg');
const env = require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true }).parsed || {};

async function main() {
  if (!env.DB_PASSWORD) throw new Error('DB_PASSWORD is required');
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.hunbahsnaeeztmzqpnrl', password: env.DB_PASSWORD, database: 'postgres',
    ssl: { rejectUnauthorized: false }, statement_timeout: 120000,
    application_name: 'athlete-team-season-backfill-audit',
  });
  const base = `
    FROM public.athlete_team_seasons ats
    JOIN public.teams team USING (team_id)
    JOIN public.schools school ON school.school_id = team.school_id
    JOIN public.athletes athlete USING (athlete_id)
    LEFT JOIN public.school_competition_memberships membership
      ON membership.school_id = school.school_id
     AND membership.is_primary AND membership.valid_to IS NULL`;
  await client.connect();
  try {
    const output = {};
    output.season_status = (await client.query(`
      SELECT ats.season_code, ats.status, count(*)::int row_count ${base}
      GROUP BY ats.season_code, ats.status ORDER BY 1, 2`)).rows;
    output.institution_types = (await client.query(`
      SELECT school.institution_type, count(*)::int row_count ${base}
      GROUP BY school.institution_type ORDER BY 2 DESC`)).rows;
    output.eligibility = (await client.query(`
      SELECT count(*)::int total_rows,
        count(*) FILTER (WHERE school.institution_type = 'collegiate'
          AND membership.school_competition_membership_id IS NOT NULL
          AND membership.verification_status <> 'unresolved'
          AND membership.membership_status IN ('active','affiliate','provisional','independent'))::int eligible,
        count(*) FILTER (WHERE school.institution_type = 'collegiate'
          AND membership.school_competition_membership_id IS NULL)::int collegiate_without_membership,
        count(*) FILTER (WHERE school.institution_type <> 'collegiate')::int non_collegiate
      ${base}`)).rows[0];
    output.quality = (await client.query(`
      SELECT count(*) FILTER (WHERE athlete.tfrrs_athlete_id IS NOT NULL
          AND btrim(athlete.tfrrs_athlete_id) <> '')::int tfrrs_present,
        count(*) FILTER (WHERE athlete.gender IS NOT NULL AND team.gender IS NOT NULL
          AND athlete.gender <> team.gender)::int gender_mismatch,
        count(*) FILTER (WHERE athlete.school_id <> team.school_id)::int current_school_differs,
        count(*) FILTER (WHERE ats.year_in_school IS NULL)::int year_null,
        count(*) FILTER (WHERE btrim(coalesce(ats.year_in_school, '')) = '')::int year_blank
      ${base}`)).rows[0];
    output.multi_team = (await client.query(`
      WITH grouped AS (
        SELECT ats.athlete_id, ats.season_code, count(*) row_count,
          count(DISTINCT ats.team_id) teams, count(DISTINCT team.school_id) schools
        FROM public.athlete_team_seasons ats JOIN public.teams team USING (team_id)
        GROUP BY ats.athlete_id, ats.season_code
      )
      SELECT count(*)::int athlete_seasons,
        count(*) FILTER (WHERE teams > 1)::int more_than_one_team,
        count(*) FILTER (WHERE schools > 1)::int more_than_one_school,
        max(teams)::int max_teams, max(schools)::int max_schools
      FROM grouped`)).rows[0];
    output.multi_team_by_season = (await client.query(`
      WITH grouped AS (
        SELECT ats.athlete_id, ats.season_code,
          count(DISTINCT team.school_id) schools
        FROM public.athlete_team_seasons ats JOIN public.teams team USING (team_id)
        GROUP BY ats.athlete_id, ats.season_code
      )
      SELECT season_code, count(*) FILTER (WHERE schools > 1)::int multi_school_athletes
      FROM grouped GROUP BY season_code ORDER BY season_code`)).rows;
    output.exceptions = (await client.query(`
      SELECT ats.ats_id, ats.athlete_id, athlete.full_name, ats.season_code,
        team.team_id, team.gender team_gender, athlete.gender athlete_gender,
        school.school_id, school.official_name,
        CASE
          WHEN membership.school_competition_membership_id IS NULL THEN 'membership_missing'
          WHEN membership.verification_status = 'unresolved' THEN 'membership_unresolved'
          WHEN membership.membership_status NOT IN ('active','affiliate','provisional','independent')
            THEN 'membership_status_not_eligible'
          WHEN athlete.gender IS NOT NULL AND team.gender IS NOT NULL
            AND athlete.gender <> team.gender THEN 'gender_mismatch'
        END reason
      ${base}
      WHERE membership.school_competition_membership_id IS NULL
         OR membership.verification_status = 'unresolved'
         OR membership.membership_status NOT IN ('active','affiliate','provisional','independent')
         OR (athlete.gender IS NOT NULL AND team.gender IS NOT NULL AND athlete.gender <> team.gender)
      ORDER BY reason, ats.ats_id`)).rows;
    console.log(JSON.stringify(output, null, 2));
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
