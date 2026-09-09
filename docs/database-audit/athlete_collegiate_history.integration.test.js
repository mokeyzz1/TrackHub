const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');

const migrationFile = '20260906072721_add_school_type_and_collegiate_history.sql';
const migration = fs.readFileSync(path.join(__dirname, '../../supabase/migrations', migrationFile), 'utf8');

test('collegiate-history migration uses affiliation evidence, not provider IDs', { skip: !process.env.TRACK_SCHEMA_TEST_SOCKET }, async t => {
  const socket = fs.realpathSync(process.env.TRACK_SCHEMA_TEST_SOCKET);
  assert.match(socket, /^\/(?:private\/)?tmp\/track-schema-validation\.[A-Za-z0-9]+$/);
  const config = { host: socket, port: 55434, user: 'postgres', ssl: false, max: 1 };
  const admin = new Pool({ ...config, database: 'template1' });
  const db = `track_collegiate_${randomUUID().replaceAll('-', '')}`;
  let pool;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE ${db} TEMPLATE current_owner_schema`);
    created = true;
    pool = new Pool({ ...config, database: db });

    await pool.query(`
      INSERT INTO public.divisions (division_id, code, display_name, governing_body, sort_order) VALUES
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
        (11, 'LAI', 'LAI', 'LAI', 11);
      INSERT INTO public.schools (school_id, official_name, division, division_id) VALUES
        (100, 'Reviewed College', 'DI', 1),
        (101, 'Reviewed U SPORTS University', 'USPORTS', 7),
        (421, 'Cheyney', NULL, NULL),
        (1829, 'Dawgs Track Club', 'Other', NULL),
        (1835, 'Unattached', 'Unattached', NULL);
      INSERT INTO public.teams (team_id, school_id, gender) VALUES
        (200, 100, 'M'),
        (201, 1829, 'M');
      INSERT INTO public.athletes (athlete_id, school_id, full_name, gender, tfrrs_athlete_id) VALUES
        (1, 100, 'Current College Runner', 'M', 'tfrrs-only-id'),
        (2, 1835, 'Individual Result Runner', 'M', NULL),
        (3, 1835, 'Relay Result Runner', 'M', NULL),
        (4, 1835, 'Unresolved Unattached Runner', 'M', 'has-an-id-but-no-affiliation'),
        (5, 1829, 'Club Runner', 'M', NULL),
        (6, 421, 'Cheyney Runner', 'M', NULL),
        (7, 1835, 'Historical Team Runner', 'M', NULL);
      INSERT INTO public.results (result_id, athlete_id, team_id, event_name, mark_raw) VALUES
        (1, 2, 200, '100m', '10.50');
      INSERT INTO public.relay_results (relay_result_id, team_id, event_name, mark_raw) VALUES
        (1, 200, '4x100m Relay', '40.00');
      INSERT INTO public.relay_athletes (relay_athlete_id, relay_result_id, athlete_id, athlete_name) VALUES
        (1, 1, 3, 'Relay Result Runner');
      INSERT INTO public.athlete_team_seasons (ats_id, athlete_id, team_id, season_code) VALUES
        (1, 7, 200, '2026-outdoor');
    `);

    const factsBefore = (await pool.query(`
      SELECT jsonb_build_object(
        'results', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.result_id) FROM public.results r),
        'relay_results', (SELECT jsonb_agg(to_jsonb(rr) ORDER BY rr.relay_result_id) FROM public.relay_results rr),
        'relay_athletes', (SELECT jsonb_agg(to_jsonb(ra) ORDER BY ra.relay_athlete_id) FROM public.relay_athletes ra),
        'athlete_team_seasons', (SELECT jsonb_agg(to_jsonb(ats) ORDER BY ats.ats_id) FROM public.athlete_team_seasons ats)
      ) AS snapshot
    `)).rows[0].snapshot;

    await pool.query('BEGIN');
    await pool.query(migration);
    await pool.query('COMMIT');

    await t.test('school and governing classifications are semantically explicit', async () => {
      const schoolTypes = (await pool.query(`
        SELECT school_id, institution_type
        FROM public.schools
        WHERE school_id IN (100, 421, 1829, 1835)
        ORDER BY school_id
      `)).rows;
      assert.deepEqual(schoolTypes, [
        { school_id: '100', institution_type: 'collegiate' },
        { school_id: '421', institution_type: 'collegiate' },
        { school_id: '1829', institution_type: 'club' },
        { school_id: '1835', institution_type: 'unattached' },
      ]);
      const kinds = (await pool.query(`
        SELECT code, classification_kind
        FROM public.divisions
        WHERE code IN ('DI', 'USPORTS', 'LAI')
        ORDER BY code
      `)).rows;
      assert.deepEqual(kinds, [
        { code: 'DI', classification_kind: 'division' },
        { code: 'LAI', classification_kind: 'league' },
        { code: 'USPORTS', classification_kind: 'association' },
      ]);
    });

    await t.test('each supported evidence path establishes collegiate history', async () => {
      const rows = (await pool.query(`
        SELECT athlete_id, has_collegiate_school, has_collegiate_team_season,
          has_collegiate_individual_result, has_collegiate_relay_result,
          has_collegiate_history, classification
        FROM public.v_athlete_collegiate_history
        ORDER BY athlete_id
      `)).rows;
      assert.deepEqual(rows, [
        { athlete_id: '1', has_collegiate_school: true, has_collegiate_team_season: false, has_collegiate_individual_result: false, has_collegiate_relay_result: false, has_collegiate_history: true, classification: 'collegiate_history' },
        { athlete_id: '2', has_collegiate_school: false, has_collegiate_team_season: false, has_collegiate_individual_result: true, has_collegiate_relay_result: false, has_collegiate_history: true, classification: 'collegiate_history' },
        { athlete_id: '3', has_collegiate_school: false, has_collegiate_team_season: false, has_collegiate_individual_result: false, has_collegiate_relay_result: true, has_collegiate_history: true, classification: 'collegiate_history' },
        { athlete_id: '4', has_collegiate_school: false, has_collegiate_team_season: false, has_collegiate_individual_result: false, has_collegiate_relay_result: false, has_collegiate_history: false, classification: 'unresolved_unattached' },
        { athlete_id: '5', has_collegiate_school: false, has_collegiate_team_season: false, has_collegiate_individual_result: false, has_collegiate_relay_result: false, has_collegiate_history: false, classification: 'club' },
        { athlete_id: '6', has_collegiate_school: true, has_collegiate_team_season: false, has_collegiate_individual_result: false, has_collegiate_relay_result: false, has_collegiate_history: true, classification: 'collegiate_history' },
        { athlete_id: '7', has_collegiate_school: false, has_collegiate_team_season: true, has_collegiate_individual_result: false, has_collegiate_relay_result: false, has_collegiate_history: true, classification: 'collegiate_history' },
      ]);
    });

    await t.test('provider IDs do not become affiliation evidence, facts are unchanged, and the view is internal', async () => {
      const factsAfter = (await pool.query(`
        SELECT jsonb_build_object(
          'results', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.result_id) FROM public.results r),
          'relay_results', (SELECT jsonb_agg(to_jsonb(rr) ORDER BY rr.relay_result_id) FROM public.relay_results rr),
          'relay_athletes', (SELECT jsonb_agg(to_jsonb(ra) ORDER BY ra.relay_athlete_id) FROM public.relay_athletes ra),
          'athlete_team_seasons', (SELECT jsonb_agg(to_jsonb(ats) ORDER BY ats.ats_id) FROM public.athlete_team_seasons ats)
        ) AS snapshot
      `)).rows[0].snapshot;
      assert.deepEqual(factsAfter, factsBefore);
      const view = (await pool.query(`
        SELECT c.reloptions, has_table_privilege('anon', 'public.v_athlete_collegiate_history', 'SELECT') AS anon_can_select
        FROM pg_class c
        WHERE c.oid = 'public.v_athlete_collegiate_history'::regclass
      `)).rows[0];
      assert.ok(view.reloptions.includes('security_invoker=true'));
      assert.equal(view.anon_can_select, false);
    });
  } finally {
    if (pool) await pool.end();
    if (created) await admin.query(`DROP DATABASE ${db}`);
    await admin.end();
  }
});
