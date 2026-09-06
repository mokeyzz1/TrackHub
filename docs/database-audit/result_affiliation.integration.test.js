const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const migrationFile = '20260905230012_use_result_affiliation_in_performance_reads.sql';
const migration = fs.readFileSync(path.join(__dirname, '../../supabase/migrations', migrationFile), 'utf8');
const rollback = fs.readFileSync(path.join(__dirname, 'rollback_result_affiliation_reads.sql'), 'utf8');

test('performance affiliation changes only the represented-school join', () => {
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION');
  const old = rollback.slice(rollback.indexOf('CREATE OR REPLACE FUNCTION'));
  const reverted = migration.slice(start).replaceAll(/LEFT JOIN teams represented_team ON r.team_id = represented_team.team_id\n  LEFT JOIN schools s ON represented_team.school_id = s.school_id/g,
    'INNER JOIN schools s ON a.school_id = s.school_id');
  assert.equal(reverted, old);
  assert.equal((migration.match(/LEFT JOIN teams represented_team/g) || []).length, 2);
});

test('historical affiliation, unknowns, filters, roles and exact rollback', { skip: !process.env.TRACK_SCHEMA_TEST_SOCKET }, async t => {
  const socket = fs.realpathSync(process.env.TRACK_SCHEMA_TEST_SOCKET);
  assert.match(socket, /^\/(?:private\/)?tmp\/track-schema-validation\.[A-Za-z0-9]+$/);
  const config = { host: socket, port: 55434, user: 'postgres', ssl: false, max: 1 };
  const admin = new Pool({ ...config, database: 'template1' });
  const db = `track_affiliation_${randomUUID().replaceAll('-', '')}`;
  let pool;
  let created = false;
  try {
    const check = (await admin.query("SELECT current_setting('data_directory') AS dir,current_setting('listen_addresses') AS listen")).rows[0];
    assert.equal(fs.realpathSync(check.dir), fs.realpathSync(path.join(socket, 'pgdata')));
    assert.equal(check.listen, '');
    await admin.query(`CREATE DATABASE ${db} TEMPLATE current_owner_schema`);
    created = true;
    pool = new Pool({ ...config, database: db });
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM public.results')).rows[0].n, 0);
    await pool.query(rollback);
    await pool.query("INSERT INTO public.schools(school_id,official_name,division) VALUES(11,'Represented School','DI'),(12,'Current School','DII'); INSERT INTO public.teams(team_id,school_id,gender) VALUES(11,11,'M'),(12,12,'M'); INSERT INTO public.athletes(athlete_id,school_id,full_name,gender) VALUES(11,12,'Transfer Runner','M'),(12,12,'Unknown Affiliation','M'),(13,11,'Unchanged Runner','M'); INSERT INTO public.event_types(event_type_id,code,measure) VALUES(11,'200m','time'); INSERT INTO public.results(result_id,athlete_id,team_id,event_name,event_type_id,mark_raw,mark_seconds,date,place) VALUES(11,11,11,'200m',11,'20.50',20.50,'2090-01-01',1),(12,12,NULL,'200m',11,'20.60',20.60,'2090-01-01',2),(13,13,11,'200m',11,'20.70',20.70,'2090-01-01',3),(14,11,12,'200m',11,'20.40',20.40,'2090-02-01',1)");
    const state = async () => (await pool.query("SELECT p.proname,pg_get_functiondef(p.oid) AS definition,p.proacl::text,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('get_top_performances','get_weekly_performances') ORDER BY 1")).rows;
    const before = await state();
    const facts = (await pool.query('SELECT * FROM public.results ORDER BY result_id')).rows;
    const read = async (name, division = null, day = '2090-01-01') => (await pool.query(name === 'get_top_performances'
      ? 'SELECT * FROM public.get_top_performances($1,$1,$2,NULL,100)'
      : 'SELECT * FROM public.get_weekly_performances($1,$1,$2,100)', [day, division])).rows;
    for (const name of ['get_top_performances', 'get_weekly_performances']) {
      assert.equal((await read(name)).find(r => r.athlete_id === 11).school_name, 'Current School');
    }
    await pool.query('BEGIN');
    await pool.query(migration);
    await pool.query('COMMIT');
    for (const role of ['postgres', 'anon', 'authenticated']) {
      await t.test(`${role}: transfer attribution, unknown preservation and division filtering`, async () => {
        await pool.query(`SET ROLE ${role}`);
        try {
          for (const name of ['get_top_performances', 'get_weekly_performances']) {
            const rows = await read(name);
            assert.equal(rows.length, 3);
            assert.equal(rows.find(r => r.athlete_id === 11).school_name, 'Represented School');
            assert.equal(rows.find(r => r.athlete_id === 11).division, 'DI');
            assert.equal(rows.find(r => r.athlete_id === 12).school_name, null);
            assert.equal(rows.find(r => r.athlete_id === 12).division, null);
            assert.deepEqual((await read(name, 'D1')).map(r => r.athlete_id).sort(), [11, 13]);
            assert.equal((await read(name, 'D2')).length, 0);
            assert.equal((await read(name, 'all')).length, 3);
            assert.equal((await read(name, 'D2', '2090-02-01'))[0].school_name, 'Current School');
            assert.equal(rows.find(r => r.athlete_id === 11).mark_raw, '20.50');
          }
        } finally { await pool.query('RESET ROLE'); }
      });
    }
    assert.deepEqual((await pool.query('SELECT * FROM public.results ORDER BY result_id')).rows, facts);
    assert.equal((await pool.query('SELECT school_id FROM public.athletes WHERE athlete_id=11')).rows[0].school_id, '12');
    const after = await state();
    assert.deepEqual(after.map(({ definition, ...r }) => r), before.map(({ definition, ...r }) => r));
    await pool.query('BEGIN');
    await pool.query(rollback);
    await pool.query('COMMIT');
    assert.deepEqual(await state(), before);
    assert.equal((await read('get_top_performances')).find(r => r.athlete_id === 11).school_name, 'Current School');
  } finally {
    if (pool) await pool.end();
    if (created) await admin.query(`DROP DATABASE ${db}`);
    await admin.end();
  }
});
