const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');

const migrationFile = '20260909172553_add_meet_lifecycle_contract.sql';
const migration = fs.readFileSync(path.join(__dirname, '../../supabase/migrations', migrationFile), 'utf8');

async function expectSqlState(pool, statement, code) {
  await pool.query('SAVEPOINT expected_failure');
  try {
    await pool.query(statement);
    assert.fail(`Expected SQLSTATE ${code}`);
  } catch (error) {
    assert.equal(error.code, code, error.message);
  } finally {
    await pool.query('ROLLBACK TO SAVEPOINT expected_failure');
    await pool.query('RELEASE SAVEPOINT expected_failure');
  }
}

test('meet lifecycle migration is deterministic, secure and backward compatible', {
  skip: !process.env.TRACK_SCHEMA_TEST_SOCKET,
}, async t => {
  const socket = fs.realpathSync(process.env.TRACK_SCHEMA_TEST_SOCKET);
  assert.match(socket, /^\/(?:private\/)?tmp\/track-schema-validation\.[A-Za-z0-9]+$/);
  const config = { host: socket, port: 55434, user: 'postgres', ssl: false, max: 1 };
  const admin = new Pool({ ...config, database: 'template1' });
  const db = `track_meet_lifecycle_${randomUUID().replaceAll('-', '')}`;
  let pool;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE ${db} TEMPLATE current_owner_schema`);
    created = true;
    pool = new Pool({ ...config, database: db });
    await pool.query(`
      INSERT INTO public.meets (meet_id, name, date, end_date, meet_url, status) VALUES
        (910001, 'Legacy Null End', '2026-04-20', NULL, NULL, 'completed'),
        (910002, 'Future Meet', '2026-04-26', '2026-04-26', NULL, 'completed'),
        (910003, 'Current Multi Day', '2026-04-23', '2026-04-25', 'https://timing.test/live', 'upcoming');
    `);
    await pool.query(migration);

    await t.test('normal states derive from dates and timing URL at an explicit instant', async () => {
      const rows = (await pool.query(`
        SELECT meet_id, public.meet_effective_status(
          date, end_date, meet_url, status_override, meet_timezone, '2026-04-25 19:00:00+00'
        ) AS effective_status
        FROM public.meets WHERE meet_id BETWEEN 910001 AND 910003 ORDER BY meet_id
      `)).rows;
      assert.deepEqual(rows, [
        { meet_id: 910001, effective_status: 'completed' },
        { meet_id: 910002, effective_status: 'upcoming' },
        { meet_id: 910003, effective_status: 'live' },
      ]);
      assert.equal((await pool.query(`SELECT public.meet_effective_status(
        '2026-04-25','2026-04-25','https://timing.test',NULL,'America/Chicago','2026-04-26 03:59:00+00'
      ) status`)).rows[0].status, 'live');
      assert.equal((await pool.query(`SELECT public.meet_effective_status(
        '2026-04-25','2026-04-25','https://timing.test',NULL,'America/Chicago','2026-04-26 04:00:00+00'
      ) status`)).rows[0].status, 'completed');
    });

    await t.test('explicit exceptions override calculated time without rewriting dates', async () => {
      await pool.query("UPDATE public.meets SET status_override='cancelled' WHERE meet_id=910002");
      const row = (await pool.query(`SELECT date,end_date,effective_status
        FROM public.v_meets_lifecycle WHERE meet_id=910002`)).rows[0];
      assert.equal(row.effective_status, 'cancelled');
      assert.equal(row.date.toISOString().slice(0, 10), '2026-04-26');
      assert.equal(row.end_date.toISOString().slice(0, 10), '2026-04-26');
    });

    await t.test('legacy null ranges are repaired and invalid future input is rejected', async () => {
      assert.equal((await pool.query('SELECT end_date=date AS repaired FROM public.meets WHERE meet_id=910001')).rows[0].repaired, true);
      await pool.query('BEGIN');
      await expectSqlState(pool, "UPDATE public.meets SET end_date=date-1 WHERE meet_id=910001", '23514');
      await expectSqlState(pool, "UPDATE public.meets SET meet_timezone='Not/AZone' WHERE meet_id=910001", '23514');
      await expectSqlState(pool, "UPDATE public.meets SET status_override='live' WHERE meet_id=910001", '23514');
      await pool.query('ROLLBACK');
    });

    await t.test('the API view obeys base RLS and exposes no write path', async () => {
      const metadata = (await pool.query(`
        SELECT c.reloptions,
          has_table_privilege('anon','public.v_meets_lifecycle','SELECT') anon_select,
          has_table_privilege('anon','public.v_meets_lifecycle','UPDATE') anon_update
        FROM pg_class c WHERE c.oid='public.v_meets_lifecycle'::regclass
      `)).rows[0];
      assert.ok(metadata.reloptions.includes('security_invoker=true'));
      assert.equal(metadata.anon_select, true);
      assert.equal(metadata.anon_update, false);
      await pool.query('BEGIN');
      await pool.query('SET LOCAL ROLE anon');
      assert.equal((await pool.query('SELECT count(*) count FROM public.v_meets_lifecycle')).rows[0].count, '3');
      await pool.query('ROLLBACK');
    });
  } finally {
    if (pool) await pool.end();
    if (created) await admin.query(`DROP DATABASE ${db}`);
    await admin.end();
  }
});
