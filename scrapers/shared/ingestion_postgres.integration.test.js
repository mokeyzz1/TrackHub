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
    // Candidate migration is installed only in this disposable database, never the template.
    const evidenceMigration = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260905183823_preserve_ingestion_source_versions.sql'), 'utf8');
    await pool.query('BEGIN');
    await pool.query(evidenceMigration);
    await pool.query('ROLLBACK');
    assert.equal((await pool.query("SELECT to_regclass('ingest.source_record_versions') AS relation")).rows[0].relation, null);
    await pool.query('BEGIN');
    await pool.query(evidenceMigration);
    await pool.query('COMMIT');
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
    await t.test('payload-only restaging conflicts and later runs retain independent evidence', async () => {
      const firstRun = await store.startRun({ source: 'tfrrs', mode: 'commit', parserVersion: 'test' });
      const first = record('versioned', { payload: { wind: '+1.1' }, mark_raw: '10.81' });
      const changed = record('versioned', { payload: { wind: '+2.2' }, mark_raw: '10.81' });
      await store.persistObservations(firstRun, [first]);
      await assert.rejects(store.persistObservations(firstRun, [changed]), /conflicting observation/);
      const secondRun = await store.startRun({ source: 'tfrrs', mode: 'commit', parserVersion: 'test' });
      await store.persistObservations(secondRun, [changed]);
      const thirdRun = await store.startRun({ source: 'tfrrs', mode: 'commit', parserVersion: 'test' });
      await store.persistObservations(thirdRun, [changed]);
      const evidence = await pool.query("SELECT o.run_id,sv.payload->>'wind' AS wind FROM ingest.observations o JOIN ingest.source_record_versions sv ON sv.source_record_id=o.source_record_id AND sv.snapshot_hash=o.source_snapshot_hash WHERE o.run_id=ANY($1::uuid[])", [[firstRun, secondRun, thirdRun]]);
      assert.equal(evidence.rows.find(row => row.run_id === firstRun).wind, '+1.1');
      assert.equal(evidence.rows.find(row => row.run_id === secondRun).wind, '+2.2');
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM ingest.source_record_versions sv JOIN ingest.source_records sr USING(source_record_id) WHERE sr.source_record_key='versioned'")).rows[0].n, 2);
      const { CanonicalFactWriter } = require('./canonical_fact_writer');
      await new CanonicalFactWriter({ pool }).commitRun(firstRun);
      assert.equal((await pool.query("SELECT wind FROM public.results WHERE mark_raw='10.81'")).rows[0].wind, '+1.1');
    });
    await t.test('unknown historical snapshots are held without using the latest payload', async () => {
      const run = await store.startRun({ source: 'tfrrs', mode: 'commit', parserVersion: 'test' });
      await store.persistObservations(run, [record('legacy-no-snapshot', { mark_raw: '10.82' })]);
      await pool.query('UPDATE ingest.observations SET source_snapshot_hash=NULL WHERE run_id=$1', [run]);
      const { CanonicalFactWriter } = require('./canonical_fact_writer');
      const result = await new CanonicalFactWriter({ pool }).commitRun(run);
      assert.equal(result.quarantined, 1);
      assert.equal((await pool.query('SELECT reason_code FROM ingest.quarantine q JOIN ingest.observations o USING(observation_id) WHERE run_id=$1', [run])).rows[0].reason_code, 'missing_source_snapshot');
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.results WHERE mark_raw='10.82'")).rows[0].n, 0);
    });
    await t.test('evidence privileges are append-only and snapshot references are enforced', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE service_role');
        await client.query('SELECT * FROM ingest.source_record_versions LIMIT 1');
        await assert.rejects(client.query('UPDATE ingest.source_record_versions SET payload=payload'), { code: '42501' });
        await client.query('ROLLBACK');
        await client.query('BEGIN');
        await assert.rejects(client.query("UPDATE ingest.observations SET source_snapshot_hash=repeat('a',64) WHERE source_snapshot_hash IS NOT NULL"), { code: '23503' });
      } finally { await client.query('ROLLBACK'); client.release(); }
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
    await t.test('PR view preserves public reads but follows caller row policies', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const before = await client.query('SELECT * FROM public.v_athlete_prs ORDER BY athlete_id,event_type_id,environment');
        assert.ok(before.rows.length > 0);
        await client.query(fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260905184307_restore_pr_view_invoker_security.sql'), 'utf8'));
        for (const role of ['anon', 'authenticated']) {
          await client.query(`SET LOCAL ROLE ${role}`);
          const visible = await client.query('SELECT * FROM public.v_athlete_prs ORDER BY athlete_id,event_type_id,environment');
          assert.deepEqual(visible.rows, before.rows);
          await client.query('RESET ROLE');
        }
        // A synthetic policy restriction proves invoker behavior, not just a catalog flag.
        await client.query('ALTER POLICY results_public_read ON public.results USING (false)');
        for (const role of ['anon', 'authenticated']) {
          await client.query(`SET LOCAL ROLE ${role}`);
          assert.equal((await client.query('SELECT count(*)::int AS n FROM public.v_athlete_prs')).rows[0].n, 0);
          await client.query('RESET ROLE');
        }
      } finally { await client.query('ROLLBACK'); client.release(); }
    });
  } finally {
    if (pool) await pool.end();
    if (created) await admin.query(`DROP DATABASE ${database}`);
    await admin.end();
  }
});
