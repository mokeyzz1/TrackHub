const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const {
  buildRosterObservation,
  buildRosterPlan,
  loadRosterContext,
  persistRosterPlan,
} = require('../../scrapers/shared/collegiate_roster_evidence');

const socket = process.env.TRACK_SCHEMA_TEST_SOCKET;

test('collegiate roster evidence is replay-safe and transaction-atomic', { skip: !socket }, async t => {
  const realSocket = fs.realpathSync(socket);
  assert.match(realSocket, /^\/(?:private\/)?tmp\/track-schema-validation\.[A-Za-z0-9]+$/);
  const config = { host: realSocket, port: 55434, user: 'postgres', ssl: false, max: 1 };
  const admin = new Pool({ ...config, database: 'template1' });
  const database = `track_roster_${randomUUID().replaceAll('-', '')}`;
  let pool;
  let created = false;
  try {
    await admin.query(`create database ${database} template current_owner_schema`);
    created = true;
    pool = new Pool({ ...config, database });
    await pool.query(`
      insert into public.divisions (division_id, code, display_name, governing_body, sort_order) values
        (1, 'DI', 'NCAA Division I', 'NCAA', 1),
        (2, 'DII', 'NCAA Division II', 'NCAA', 2),
        (3, 'DIII', 'NCAA Division III', 'NCAA', 3),
        (4, 'NAIA', 'NAIA', 'NAIA', 4),
        (5, 'NJCAA', 'NJCAA', 'NJCAA', 5),
        (6, 'CCCAA', 'CCCAA', 'CCCAA', 6),
        (7, 'USPORTS', 'U SPORTS', 'U SPORTS', 7),
        (8, 'USCAA', 'USCAA', 'USCAA', 8),
        (9, 'NCCAA-I', 'NCCAA Division I', 'NCCAA', 9),
        (10, 'NCCAA-II', 'NCCAA Division II', 'NCCAA', 10),
        (11, 'LAI', 'LAI', 'LAI', 11),
        (12, 'INDEPENDENT', 'Independent', 'Independent', 12);
      insert into public.schools (school_id, official_name, division, division_id) values
        (12, 'Roster Test University', 'DI', 1),
        (421, 'Cheyney', null, null),
        (1829, 'Dawgs Track Club', 'Other', null),
        (1835, 'Unattached', 'Unattached', null),
        (2134, 'University of The Bahamas', 'NAIA', 4);
      insert into public.teams (team_id, school_id, gender) values (22, 12, 'F');
      insert into public.athletes (athlete_id, school_id, full_name, gender, tfrrs_athlete_id)
      values (41, 12, 'Example Runner', 'F', '9020036');
    `);
    for (const migration of [
      '20260906072721_add_school_type_and_collegiate_history.sql',
      '20260907195650_normalize_collegiate_competition_hierarchy.sql',
      '20260908045520_add_athlete_status_evidence_model.sql',
    ]) {
      await pool.query(fs.readFileSync(path.join(__dirname, '../../supabase/migrations', migration), 'utf8'));
    }

    const observation = buildRosterObservation({
      tfrrs_athlete_id: '9020036',
      full_name: 'Example Runner',
      school_id: 12,
      gender: 'F',
      class_year: 'SO',
      tfrrs_team_url: 'https://www.tfrrs.org/teams/tf/TX_college_f_Roster_Test_University.html',
      season: '2026 Indoor',
    });

    await t.test('one commit writes the season relationship and private evidence together', async () => {
      const client = await pool.connect();
      try {
        const plan = buildRosterPlan([observation], await loadRosterContext(client, [observation]));
        assert.equal(plan.ready.length, 1);
        await client.query('begin');
        const result = await persistRosterPlan(client, plan.ready);
        await client.query('commit');
        assert.deepEqual(result, { season_rows: 1, evidence_rows: 1 });
      } finally {
        client.release();
      }
      const counts = (await pool.query(`select
        (select count(*)::int from public.athlete_team_seasons) season_rows,
        (select count(*)::int from public.athlete_status_evidence) evidence_rows,
        (select count(*)::int from public.athlete_status_periods) period_rows`)).rows[0];
      assert.deepEqual(counts, { season_rows: 1, evidence_rows: 1, period_rows: 0 });
    });

    await t.test('exact replay is classified without adding rows', async () => {
      const plan = buildRosterPlan([observation], await loadRosterContext(pool, [observation]));
      assert.equal(plan.ready.length, 0);
      assert.equal(plan.replayed.length, 1);
      assert.equal((await pool.query('select count(*)::int n from public.athlete_status_evidence')).rows[0].n, 1);
    });

    await t.test('an evidence failure rolls back the matching season row', async () => {
      const later = buildRosterObservation({ ...observation.evidence, season: '2027 Indoor' });
      const client = await pool.connect();
      try {
        const plan = buildRosterPlan([later], await loadRosterContext(client, [later]));
        assert.equal(plan.ready.length, 1);
        await client.query(`create function public.reject_roster_test() returns trigger language plpgsql as $$
          begin raise exception 'synthetic evidence failure'; end $$`);
        await client.query(`create trigger reject_roster_test before insert on public.athlete_status_evidence
          for each row execute function public.reject_roster_test()`);
        await client.query('begin');
        await assert.rejects(persistRosterPlan(client, plan.ready), /synthetic evidence failure/);
        await client.query('rollback');
      } finally {
        client.release();
      }
      assert.equal((await pool.query("select count(*)::int n from public.athlete_team_seasons where season_code='2026-2027'")).rows[0].n, 0);
      assert.equal((await pool.query("select count(*)::int n from public.athlete_status_evidence where effective_from='2026-07-01'")).rows[0].n, 0);
    });
  } finally {
    if (pool) await pool.end();
    if (created) await admin.query(`drop database ${database}`);
    await admin.end();
  }
});
