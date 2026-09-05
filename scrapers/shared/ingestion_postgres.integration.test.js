const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { IngestionStore } = require('./ingestion_store');
const { ControlledIngestion } = require('./controlled_ingestion');
const { normalizeObservation } = require('./ingestion_contract');

// No generic database URL, .env loading, remote host, or existing application database allowed.
const socket = process.env.TRACK_SCHEMA_TEST_SOCKET;
test('isolated PostgreSQL ingestion contracts', { skip: !socket }, async t => {
  const realSocket = fs.realpathSync(socket);
  assert.match(realSocket, /^\/(?:private\/)?tmp\/track-schema-validation\.[A-Za-z0-9]+$/);
  const config = { host: realSocket, port: 55434, user: 'postgres', ssl: false, connectionTimeoutMillis: 5000 };
  const admin = new Pool({ ...config, database: 'template1', max: 1 });
  const database = `track_contract_${randomUUID().replaceAll('-', '')}`;
  const template = process.env.TRACK_SCHEMA_TEST_TEMPLATE || 'postgres';
  assert.ok(['postgres', 'current_owner_schema'].includes(template), 'Only isolated fixture templates are allowed');
  let pool;
  let created = false;
  try {
    const check = await admin.query("SELECT current_setting('data_directory') AS dir, current_setting('listen_addresses') AS listen");
    assert.equal(fs.realpathSync(check.rows[0].dir), fs.realpathSync(path.join(realSocket, 'pgdata')));
    assert.equal(check.rows[0].listen, '');
    await admin.query(`CREATE DATABASE ${database} TEMPLATE ${template}`);
    created = true;
    pool = new Pool({ ...config, database, max: 5 });
    const empty = await pool.query('SELECT EXISTS(SELECT 1 FROM public.results) OR EXISTS(SELECT 1 FROM public.athletes) AS populated');
    assert.equal(empty.rows[0].populated, false, 'Template must be a schema-only fixture');
    await pool.query("INSERT INTO public.schools(school_id,official_name) VALUES(1,'Synthetic Test School'); INSERT INTO public.teams(team_id,school_id,gender) VALUES(1,1,'M'); INSERT INTO public.athletes(athlete_id,school_id,full_name,gender) VALUES(1,1,'Synthetic Runner','M'); INSERT INTO public.meets(meet_id,name,date) VALUES(1,'Synthetic Meet','2026-09-01'); INSERT INTO public.event_types(event_type_id,code,measure,environment_scope) VALUES(1,'100m','time','both')");
    const store = new IngestionStore({ pool });
    const record = (key, overrides = {}) => normalizeObservation({
      source: 'tfrrs', source_record_key: key, source_meet_key: 'synthetic-meet',
      entity_type: 'individual_result', target_meet_id: 1, target_athlete_id: 1,
      target_team_id: 1, event_type_id: 1, event_type: { measure: 'time' },
      raw_event_name: '100m', mark_raw: '10.50', place: 1, round: 'Finals',
      date: '2026-09-01', ...overrides,
    });
    const promote = records => new ControlledIngestion({ pool }).run({
      source: 'mixed', parserVersion: 'postgres-contract-test', records, commit: true,
    });

    await t.test('database FK failure rolls back source staging atomically', async () => {
      const run = await store.startRun({ source: 'tfrrs', mode: 'commit', parserVersion: 'test' });
      await assert.rejects(store.persistObservations(run, [record('bad-fk', { target_athlete_id: 99999 })]), { code: '23503' });
      const result = await pool.query("SELECT count(*)::int AS n FROM ingest.source_records WHERE source_record_key='bad-fk'");
      assert.equal(result.rows[0].n, 0);
    });
    await t.test('same-run restaging is idempotent but conflicting normalized content rolls back', async () => {
      const run = await store.startRun({ source: 'tfrrs', mode: 'commit', parserVersion: 'test' });
      const first = record('immutable-observation', { payload: { source_mark: '10.50' } });
      await store.persistObservations(run, [first]);
      await store.persistObservations(run, [first]);
      await assert.rejects(store.persistObservations(run, [record('immutable-observation', {
        mark_raw: '10.70', payload: { source_mark: '10.70' },
      })]), /conflicting observation/);
      const result = await pool.query("SELECT o.mark_raw,sr.payload->>'source_mark' AS source_mark FROM ingest.observations o JOIN ingest.source_records sr USING(source_record_id) WHERE o.run_id=$1", [run]);
      assert.deepEqual(result.rows, [{ mark_raw: '10.50', source_mark: '10.50' }]);
    });
    await t.test('sequential replay and cross-provider duplicate resolve to one fact', async () => {
      const first = await promote([record('replay')]);
      await store.persistObservations(first.runId, [record('replay')]);
      assert.equal((await pool.query('SELECT decision FROM ingest.observations WHERE run_id=$1', [first.runId])).rows[0].decision, 'insert');
      await promote([record('replay')]);
      await promote([record('replay', { source: 'athletic_net' })]);
      const result = await pool.query("SELECT count(DISTINCT r.result_id)::int AS facts,count(DISTINCT sl.source_record_id)::int AS links FROM public.results r JOIN ingest.source_links sl ON sl.result_id=r.result_id WHERE r.mark_raw='10.50'");
      assert.deepEqual(result.rows[0], { facts: 1, links: 2 });
    });
    await t.test('invalid observations stay quarantined without public facts', async () => {
      const result = await promote([record('unknown-athlete', { target_athlete_id: null, mark_raw: '12.30' })]);
      assert.equal(result.quarantined, 1);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.results WHERE mark_raw='12.30'")).rows[0].n, 0);
    });
    await t.test('public roles cannot read private source payloads', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE anon');
        await assert.rejects(client.query('SELECT payload FROM ingest.source_records'), { code: '42501' });
      } finally { await client.query('ROLLBACK'); client.release(); }
    });
    await t.test('two concurrent providers link one fact without quarantining the loser', async () => {
      // A bounded insert delay exposes the stale-candidate race deterministically in this fixture.
      await pool.query("CREATE FUNCTION public.test_delay_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.2); RETURN NEW; END $$; CREATE TRIGGER test_delay_insert BEFORE INSERT ON public.results FOR EACH ROW EXECUTE FUNCTION public.test_delay_insert()");
      const results = await Promise.all([
        promote([record('race-tfrrs', { mark_raw: '11.20' })]),
        promote([record('race-anet', { source: 'athletic_net', mark_raw: '11.20' })]),
      ]);
      assert.equal(results.reduce((sum, r) => sum + r.quarantined, 0), 0);
      const facts = await pool.query("SELECT count(DISTINCT r.result_id)::int AS facts,count(DISTINCT sl.source_record_id)::int AS links FROM public.results r JOIN ingest.source_links sl ON sl.result_id=r.result_id WHERE r.mark_raw='11.20'");
      assert.deepEqual(facts.rows[0], { facts: 1, links: 2 });
    });
    await t.test('concurrent replay of the same source retains one provenance link', async () => {
      await Promise.all([promote([record('same-source', { mark_raw: '11.60' })]),
        promote([record('same-source', { mark_raw: '11.60' })])]);
      const result = await pool.query("SELECT count(*)::int AS n FROM ingest.source_records sr JOIN ingest.source_links sl USING(source_record_id) WHERE sr.source_record_key='same-source' AND sl.result_id IS NOT NULL");
      assert.equal(result.rows[0].n, 1);
    });
    await t.test('writer failure rolls back facts and releases transaction advisory locks', async () => {
      await pool.query("CREATE OR REPLACE FUNCTION public.test_delay_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.mark_raw='13.00' THEN RAISE EXCEPTION 'synthetic insert failure'; END IF; RETURN NEW; END $$");
      await assert.rejects(promote([record('failing-write', { mark_raw: '13.00' })]), /synthetic insert failure/);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.results WHERE mark_raw='13.00'")).rows[0].n, 0);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM ingest.source_records sr JOIN ingest.source_links sl USING(source_record_id) WHERE sr.source_record_key='failing-write'")).rows[0].n, 0);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database())")).rows[0].n, 0);
    });
  } finally {
    if (pool) await pool.end();
    if (created) await admin.query(`DROP DATABASE ${database}`);
    await admin.end();
  }
});
