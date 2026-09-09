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
    await pool.query(fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260905185312_enforce_source_link_target_kind.sql'), 'utf8'));
    await pool.query(fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260909041600_allow_mixed_result_sources.sql'), 'utf8'));
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
    await t.test('opposite source batch orders cannot deadlock staging', async () => {
      await pool.query("CREATE FUNCTION ingest.test_stage_delay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.05); RETURN NEW; END $$; CREATE TRIGGER test_stage_delay BEFORE INSERT ON ingest.source_records FOR EACH ROW EXECUTE FUNCTION ingest.test_stage_delay()");
      try {
        const run1 = await store.startRun({ source: 'tfrrs', mode: 'commit', parserVersion: 'test' });
        const run2 = await store.startRun({ source: 'tfrrs', mode: 'commit', parserVersion: 'test' });
        const left = record('ordered-a');
        const right = record('ordered-b');
        const outcomes = await Promise.allSettled([
          store.persistObservations(run1, [left, right]), store.persistObservations(run2, [right, left]),
        ]);
        assert.deepEqual(outcomes.map(x => x.status), ['fulfilled', 'fulfilled'], outcomes.map(x => x.reason?.code).join(','));
      } finally {
        await pool.query('DROP TRIGGER test_stage_delay ON ingest.source_records; DROP FUNCTION ingest.test_stage_delay()');
      }
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
      assert.equal((await pool.query('SELECT results_source FROM public.meets WHERE meet_id=1')).rows[0].results_source, 'mixed');
    });
    await t.test('cross-provider team conflicts stay private and do not relabel the fact', async () => {
      await pool.query("INSERT INTO public.schools(school_id,official_name) VALUES(9002,'Other School'); INSERT INTO public.teams(team_id,school_id,gender) VALUES(9002,9002,'M')");
      await promote([record('team-conflict', { mark_raw: '10.60' })]);
      const conflict = await promote([record('team-conflict', {
        source: 'athletic_net', mark_raw: '10.60', target_team_id: 9002,
      })]);
      assert.equal(Number(conflict.quarantined), 1);
      assert.equal(Number((await pool.query("SELECT team_id FROM public.results WHERE mark_raw='10.60'")).rows[0].team_id), 1);
      assert.equal((await pool.query("SELECT q.reason_code FROM ingest.quarantine q JOIN ingest.observations o USING(observation_id) WHERE o.run_id=$1", [conflict.runId])).rows[0].reason_code, 'represented_team_conflict');
    });
    await t.test('relay parent promotion and replay retain one team performance', async () => {
      await pool.query("INSERT INTO public.event_types(event_type_id,code,measure,environment_scope) VALUES(3,'4x100m','time','both')");
      const parent = record('synthetic-relay', { entity_type: 'relay_result', target_athlete_id: null,
        event_type_id: 3, raw_event_name: '4x100m', mark_raw: '41.00', payload: { relay_athletes: [] } });
      await promote([parent]);
      await promote([parent]);
      const result = await pool.query("SELECT count(DISTINCT rr.relay_result_id)::int AS parents,count(DISTINCT sl.source_record_id)::int AS links FROM public.relay_results rr JOIN ingest.source_links sl USING(relay_result_id) JOIN ingest.source_records sr USING(source_record_id) WHERE sr.source_record_key='synthetic-relay'");
      assert.deepEqual(result.rows[0], { parents: 1, links: 1 });
    });
    await t.test('changed linked source performance is held without rewriting the existing fact', async () => {
      await promote([record('corrected-source', { mark_raw: '11.70' })]);
      const changed = await promote([record('corrected-source', { mark_raw: '11.80' })]);
      assert.equal(changed.quarantined, 1);
      const linked = await pool.query("SELECT r.mark_raw FROM ingest.source_records sr JOIN ingest.source_links sl USING(source_record_id) JOIN public.results r USING(result_id) WHERE sr.source_record_key='corrected-source'");
      assert.equal(linked.rows[0].mark_raw, '11.70');
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.results WHERE mark_raw='11.80'")).rows[0].n, 0);
      const { CanonicalFactWriter } = require('./canonical_fact_writer');
      await new CanonicalFactWriter({ pool }).commitRun(changed.runId);
      assert.equal((await pool.query('SELECT q.reason_code FROM ingest.quarantine q JOIN ingest.observations o USING(observation_id) WHERE o.run_id=$1', [changed.runId])).rows[0].reason_code, 'source_correction_required');
      const relayChange = await promote([record('synthetic-relay', { entity_type: 'relay_result', target_athlete_id: null,
        event_type_id: 3, raw_event_name: '4x100m', mark_raw: '42.00', payload: { relay_athletes: [] } })]);
      assert.equal(relayChange.quarantined, 1);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.relay_results WHERE mark_raw='42.00'")).rows[0].n, 0);
    });
    await t.test('source link target kind rejects crossed parent/individual targets and preserves legacy legs', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const [existing, replacement] of [['individual_result', 'relay_result'], ['relay_result', 'individual_result']]) {
          await client.query('SAVEPOINT target_kind');
          await assert.rejects(client.query('UPDATE ingest.source_links SET entity_type=$1 WHERE source_record_id=(SELECT source_record_id FROM ingest.source_links WHERE entity_type=$2 AND link_status=\'linked\' LIMIT 1)', [replacement, existing]), { code: '23514' });
          await client.query('ROLLBACK TO SAVEPOINT target_kind');
        }
        const compatible = await client.query("UPDATE ingest.source_links SET entity_type='relay_leg' WHERE source_record_id=(SELECT source_record_id FROM ingest.source_links WHERE entity_type='individual_result' AND link_status='linked' LIMIT 1)");
        assert.equal(compatible.rowCount, 1);
        await client.query('ALTER TABLE ingest.source_links DROP CONSTRAINT source_links_target_kind_ck');
        assert.equal((await client.query("UPDATE ingest.source_links SET entity_type='individual_result' WHERE entity_type='relay_result'")).rowCount, 1, 'Metadata-only rollback removes the new rule without deleting links');
      } finally { await client.query('ROLLBACK'); client.release(); }
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
    await t.test('promotion pins read-committed isolation instead of inheriting session defaults', async () => {
      const client = await pool.connect();
      try {
        await client.query("SET default_transaction_isolation='repeatable read'");
        const guardedPool = { async connect() { return {
          async query(sql, parameters) {
            const result = await client.query(sql, parameters);
            if (/^BEGIN/.test(sql)) assert.equal((await client.query('SHOW transaction_isolation')).rows[0].transaction_isolation, 'read committed');
            return result;
          }, release() {},
        }; } };
        const run = await store.startRun({ source: 'tfrrs', mode: 'commit', parserVersion: 'test' });
        await store.persistObservations(run, [record('isolation-default', { mark_raw: '11.99' })]);
        const { CanonicalFactWriter } = require('./canonical_fact_writer');
        await new CanonicalFactWriter({ pool: guardedPool }).commitRun(run);
      } finally {
        await client.query('ROLLBACK');
        await client.query('RESET default_transaction_isolation');
        client.release();
      }
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
    await t.test('team summary counts people once without removing season history', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("INSERT INTO public.teams(team_id,school_id,gender) VALUES(2,1,'F')");
        await client.query("INSERT INTO public.athlete_team_seasons(athlete_id,team_id,season_code) VALUES(1,1,'2025'),(1,1,'2026')");
        assert.equal((await client.query('SELECT athlete_count FROM public.teams_summary WHERE team_id=1')).rows[0].athlete_count, '2');
        await client.query(fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260905190400_count_distinct_team_summary_athletes.sql'), 'utf8'));
        await client.query('SET LOCAL ROLE service_role');
        assert.deepEqual((await client.query('SELECT athlete_count FROM public.teams_summary WHERE team_id IN (1,2) ORDER BY team_id')).rows, [{ athlete_count: '1' }, { athlete_count: '0' }]);
        await client.query('RESET ROLE');
        assert.equal((await client.query('SELECT count(*)::int AS n FROM public.athlete_team_seasons')).rows[0].n, 2);
        assert.equal((await client.query("SELECT has_table_privilege('anon','public.teams_summary','SELECT') AS access")).rows[0].access, false);
        const rollback = fs.readFileSync(path.join(__dirname, '../../docs/database-audit/rollback_team_summary_count_20260905.sql'), 'utf8');
        await client.query(rollback.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, ''));
        assert.equal((await client.query('SELECT athlete_count FROM public.teams_summary WHERE team_id=1')).rows[0].athlete_count, '2');
      } finally { await client.query('ROLLBACK'); client.release(); }
    });
    await t.test('PR view selects supplied overall points and excludes component marks', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("INSERT INTO public.event_types(event_type_id,code,measure,environment_scope) VALUES(2,'Decathlon','points','both')");
        for (const [mark, seconds, meters, date] of [
          ['6445 (+0.0)', null, null, '2026-09-01'], ['7499', null, null, '2026-09-02'],
          ['\t7499 (+1.0)', null, null, '2026-08-01'], ['9999', 11, null, '2026-09-01'],
          ['9998', null, 7, '2026-09-01'], ['99999junk', null, null, '2026-09-01'],
          ['DNF', null, null, '2026-09-01'],
        ]) {
          await client.query("INSERT INTO public.results(athlete_id,meet_id,event_type_id,event_name,meet_name,mark_raw,mark_seconds,mark_meters,date,environment) VALUES(1,1,2,'Decathlon','Synthetic Meet',$1,$2,$3,$4,'outdoor')", [mark, seconds, meters, date]);
        }
        const oldPoints = await client.query('SELECT mark_raw FROM public.v_athlete_prs WHERE athlete_id=1 AND event_type_id=2');
        assert.equal(oldPoints.rows[0].mark_raw, '7499', 'Old extraction fails to recognize the earlier tab-prefixed total');
        await client.query(fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260905184656_fix_pr_view_supplied_points_filter.sql'), 'utf8'));
        const points = await client.query('SELECT mark_points,mark_raw,achieved_on FROM public.v_athlete_prs WHERE athlete_id=1 AND event_type_id=2');
        assert.equal(points.rows.length, 1);
        assert.equal(points.rows[0].mark_points, '7499');
        assert.equal(points.rows[0].mark_raw, '\t7499 (+1.0)');
        assert.ok((await client.query("SELECT reloptions FROM pg_class WHERE oid='public.v_athlete_prs'::regclass")).rows[0].reloptions.includes('security_invoker=true'));
        const rollback = fs.readFileSync(path.join(__dirname, '../../docs/database-audit/rollback_pr_points_filter_20260905.sql'), 'utf8');
        // Keep this fixture's outer transaction in control; test the rollback's actual DDL.
        await client.query(rollback.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, ''));
        assert.deepEqual((await client.query('SELECT mark_raw FROM public.v_athlete_prs WHERE athlete_id=1 AND event_type_id=2')).rows, oldPoints.rows);
      } finally { await client.query('ROLLBACK'); client.release(); }
    });
    await t.test('column profiling handles wide tables and returns counts, not row values', async () => {
      const client = await pool.connect();
      try {
        await client.query(`CREATE TABLE public.test_wide_profile (${Array.from({ length: 70 }, (_, i) => `c${i} text`).join(',')})`);
        await client.query('INSERT INTO public.test_wide_profile DEFAULT VALUES');
        await client.query("INSERT INTO public.test_wide_profile (c0,c69) VALUES ('','private fixture content')");
        await client.query(fs.readFileSync(path.join(__dirname, '../../docs/database-audit/quality_scan.sql'), 'utf8'));
        const rows = (await client.query("SELECT * FROM column_profile WHERE table_name='test_wide_profile' ORDER BY column_name")).rows;
        assert.equal(rows.length, 70);
        assert.deepEqual(rows.find(r => r.column_name === 'c0'), {
          schema_name: 'public', table_name: 'test_wide_profile', column_name: 'c0',
          total: '2', nulls: '1', empty_strings: '1', distinct_values: null,
        });
        assert.equal(rows.find(r => r.column_name === 'c69').empty_strings, '0');
        assert.ok(!JSON.stringify(rows).includes('private fixture content'));
      } finally {
        await client.query('RESET statement_timeout');
        client.release();
      }
    });
    await t.test('column profiling honors explicit schema scope and includes partitioned parents', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DROP TABLE IF EXISTS pg_temp.column_profile');
        await client.query("CREATE SCHEMA audit_fixture; CREATE TABLE audit_fixture.parent(id integer, label text) PARTITION BY RANGE(id); CREATE TABLE audit_fixture.child PARTITION OF audit_fixture.parent FOR VALUES FROM (0) TO (10); INSERT INTO audit_fixture.parent VALUES(1,''); SET LOCAL trackhub.audit_schemas='audit_fixture'");
        await client.query(fs.readFileSync(path.join(__dirname, '../../docs/database-audit/quality_scan.sql'), 'utf8'));
        const rows = (await client.query('SELECT * FROM column_profile')).rows;
        assert.equal(rows.length, 4);
        assert.ok(rows.every(r => r.schema_name === 'audit_fixture' && r.total === '1'));
        assert.deepEqual([...new Set(rows.map(r => r.table_name))].sort(), ['child', 'parent']);
      } finally { await client.query('ROLLBACK'); client.release(); }
    });
    await t.test('public roles retain read-only catalogs and insert-only validated waitlist access', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260905195401_restore_waitlist_sequence_usage.sql'), 'utf8'));
        const publicReads = new Set(['athlete_prs', 'athlete_team_seasons', 'athletes', 'conference_memberships', 'conferences', 'divisions', 'event_aliases', 'event_types', 'external_ids', 'live_results', 'meets', 'regions', 'relay_athletes', 'relay_results', 'results', 'schools', 'teams']);
        for (const role of ['anon', 'authenticated']) {
          const grants = (await client.query(`SELECT n.nspname AS schema, c.relname AS name, c.relrowsecurity AS rls,
            has_table_privilege($1,c.oid,'SELECT') AS read,
            has_table_privilege($1,c.oid,'INSERT') AS insert,
            has_table_privilege($1,c.oid,'UPDATE') AS update,
            has_table_privilege($1,c.oid,'DELETE') AS delete
            FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname IN ('public','ingest') AND c.relkind='r' AND c.relname<>'test_wide_profile'`, [role])).rows;
          assert.equal(grants.length, 31);
          for (const row of grants) {
            assert.equal(row.rls, true, `${role} ${row.schema}.${row.name} RLS`);
            assert.equal(row.read, row.schema === 'public' && publicReads.has(row.name), `${role} ${row.schema}.${row.name} SELECT`);
            assert.equal(row.insert, row.schema === 'public' && row.name === 'waitlist', `${role} ${row.schema}.${row.name} INSERT`);
            assert.equal(row.update, false);
            assert.equal(row.delete, false);
          }
          await client.query(`SET LOCAL ROLE ${role}`);
          for (const table of publicReads) await client.query(`SELECT 1 FROM public.${table} LIMIT 1`);
          await client.query("INSERT INTO public.waitlist(email,feature) VALUES($1,'fixture')", [`${role}@example.invalid`]);
          for (const denied of ["INSERT INTO public.waitlist(email,feature) VALUES('bad','fixture')", 'SELECT * FROM public.waitlist', 'SELECT * FROM public.push_tokens', 'SELECT * FROM ingest.runs', 'DELETE FROM public.results WHERE false']) {
            await client.query('SAVEPOINT denied_operation');
            await assert.rejects(client.query(denied), { code: '42501' });
            await client.query('ROLLBACK TO SAVEPOINT denied_operation');
          }
          await client.query('RESET ROLE');
        }
        await client.query('REVOKE USAGE ON SEQUENCE public.waitlist_id_seq FROM anon, authenticated');
        for (const role of ['anon', 'authenticated']) {
          assert.equal((await client.query("SELECT has_sequence_privilege($1,'public.waitlist_id_seq','USAGE') AS allowed", [role])).rows[0].allowed, false);
        }
      } finally { await client.query('ROLLBACK'); client.release(); }
    });
    await t.test('foreign-key audit distinguishes orphans, MATCH FULL partial nulls and valid null references', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('CREATE TABLE public.audit_parent(a integer,b integer,PRIMARY KEY(a,b)); CREATE TABLE public.audit_child(a integer,b integer); INSERT INTO public.audit_parent VALUES(1,1); INSERT INTO public.audit_child VALUES(1,1),(2,2),(1,NULL),(NULL,NULL); ALTER TABLE public.audit_child ADD CONSTRAINT audit_full_fk FOREIGN KEY(a,b) REFERENCES public.audit_parent(a,b) MATCH FULL NOT VALID');
        await client.query(fs.readFileSync(path.join(__dirname, '../../docs/database-audit/foreign_key_scan.sql'), 'utf8'));
        const row = (await client.query("SELECT * FROM foreign_key_profile WHERE constraint_name='audit_full_fk'")).rows[0];
        assert.equal(row.orphan_rows, '1');
        assert.equal(row.partial_null_rows, '1');
        assert.equal(row.validated, false);
        assert.equal(row.error_code, null);
        assert.equal((await client.query('SELECT count(*)::int AS n FROM public.audit_child')).rows[0].n, 4);
      } finally { await client.query('ROLLBACK'); client.release(); }
    });
    await t.test('event measurement domain preserves known kinds and explicit unknown while rejecting invalid catalog writes', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const before = (await client.query('SELECT * FROM public.event_types ORDER BY event_type_id')).rows;
        await client.query(fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260905201510_enforce_event_measure_domain.sql'), 'utf8'));
        assert.deepEqual((await client.query('SELECT * FROM public.event_types ORDER BY event_type_id')).rows, before);
        for (const measure of ['time', 'distance', 'points', 'unknown']) {
          await client.query('INSERT INTO public.event_types(event_type_id,code,measure) VALUES($1,$2,$3)', [100 + ['time', 'distance', 'points', 'unknown'].indexOf(measure), `fixture ${measure}`, measure]);
        }
        for (const [measure, code] of [[null, '23502'], ['meters', '23514'], ['', '23514']]) {
          await client.query('SAVEPOINT invalid_measure');
          await assert.rejects(client.query('INSERT INTO public.event_types(event_type_id,code,measure) VALUES(200,$1,$2)', ['invalid fixture', measure]), { code });
          await client.query('ROLLBACK TO SAVEPOINT invalid_measure');
        }
        await client.query('ALTER TABLE public.event_types DROP CONSTRAINT event_types_measure_check; ALTER TABLE public.event_types ALTER COLUMN measure DROP NOT NULL');
        await client.query("INSERT INTO public.event_types(event_type_id,code,measure) VALUES(201,'rollback fixture',NULL)");
      } finally { await client.query('ROLLBACK'); client.release(); }
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
