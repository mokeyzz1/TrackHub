#!/usr/bin/env node
/**
 * Repair the exact source-backed Sacramento City College individual-result affiliations.
 * Default mode is a rollback rehearsal; --commit applies only the manifest rows.
 * No public result values, athlete rows, relay rows or source observations are rewritten.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const env = require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true }).parsed || {};
const evidence = require('./sacramento_city_college_result_repair_20260909.json');
const rosterEvidence = require('./collegiate_source_team_review_20260906.json');
const commit = process.argv.includes('--commit');

function expectedRosterGroup() {
  const groups = rosterEvidence.association_confirmed.filter(group =>
    group.source_team === evidence.source_team_name && group.source_url === evidence.source_team_url
  );
  assert.equal(groups.length, 1, 'Expected one reviewed Sacramento source-team group');
  assert.equal(groups[0].source_url, evidence.source_team_url);
  return groups[0];
}

function validateManifest() {
  assert.equal(evidence.result_ids.length, 18);
  assert.equal(evidence.source_record_ids.length, 18);
  assert.equal(evidence.athletes.length, 12);
  assert.equal(new Set(evidence.result_ids).size, 18);
  assert.equal(new Set(evidence.source_record_ids).size, 18);
  assert.equal(evidence.old_team_id, 494);
  assert.equal(evidence.new_team_id, 4066);
  assert.equal(evidence.new_school_id, 2107);
  assert.deepEqual(evidence.meet_ids, [11778]);
  const group = expectedRosterGroup();
  const manifestAthletes = new Map(evidence.athletes.map(row => [String(row.athlete_id), row]));
  const rosterAthletes = new Map(group.athletes.map(row => [String(row.athlete_id), row]));
  assert(manifestAthletes.size <= rosterAthletes.size, 'Result manifest cannot exceed reviewed roster evidence');
  for (const row of evidence.athletes) {
    const roster = rosterAthletes.get(String(row.athlete_id));
    assert(roster, `Manifest athlete ${row.athlete_id} is absent from reviewed roster evidence`);
    assert.equal(String(roster.tfrrs_athlete_id), String(row.tfrrs_athlete_id));
  }
}

async function main() {
  validateManifest();
  assert(env.DB_PASSWORD, 'DB_PASSWORD is required');
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.hunbahsnaeeztmzqpnrl',
    password: env.DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    statement_timeout: 120000,
    application_name: 'sacramento-city-college-result-repair',
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [evidence.operation]);
    assert.equal((await client.query(
      'SELECT count(*)::int AS n FROM ingest.fact_cleanup_archive WHERE operation_key = $1',
      [evidence.operation]
    )).rows[0].n, 0, 'Operation already applied');

    const teams = (await client.query(
      `SELECT t.team_id, t.school_id, t.gender, t.tfrrs_team_url,
              s.official_name, s.institution_type, s.division
         FROM public.teams t
         JOIN public.schools s ON s.school_id = t.school_id
        WHERE t.team_id = ANY($1::bigint[])
           OR t.tfrrs_team_url = ANY($2::text[])
        FOR UPDATE`,
      [[evidence.old_team_id, evidence.new_team_id], [evidence.old_team_url, evidence.new_team_url]]
    )).rows;
    assert.equal(teams.length, 2, 'Expected exactly the old and corrected team rows');
    const oldTeam = teams.find(row => String(row.team_id) === String(evidence.old_team_id));
    const newTeam = teams.find(row => String(row.team_id) === String(evidence.new_team_id));
    assert(oldTeam && newTeam);
    assert.equal(oldTeam.tfrrs_team_url, evidence.old_team_url);
    assert.equal(newTeam.tfrrs_team_url, evidence.new_team_url);
    assert.equal(String(newTeam.school_id), String(evidence.new_school_id));
    assert.equal(newTeam.official_name, evidence.new_school);
    assert.equal(newTeam.gender, 'M');

    const results = (await client.query(
      `SELECT r.*, a.full_name, a.school_id AS athlete_school_id
         FROM public.results r
         JOIN public.athletes a ON a.athlete_id = r.athlete_id
        WHERE r.result_id = ANY($1::bigint[])
        ORDER BY r.result_id
        FOR UPDATE`,
      [evidence.result_ids]
    )).rows;
    assert.equal(results.length, 18);
    const expectedAthletes = new Map(evidence.athletes.map(row => [String(row.athlete_id), row]));
    for (const row of results) {
      assert.equal(row.team_id, null, `Result ${row.result_id} is no longer teamless`);
      assert.equal(row.meet_id, evidence.canonical_meet_id);
      assert(evidence.event_type_ids.includes(row.event_type_id));
      assert.equal(String(row.athlete_school_id), String(evidence.new_school_id));
      assert(expectedAthletes.has(String(row.athlete_id)), `Unexpected athlete ${row.athlete_id}`);
    }
    assert.equal(new Set(results.map(row => String(row.athlete_id))).size, 12);

    const sourceRows = (await client.query(
      `SELECT o.observation_id, o.canonical_result_id, o.target_team_id, o.target_meet_id,
              o.source_record_id, o.entity_type, o.decision, o.source_snapshot_hash,
              sl.result_id AS linked_result_id, sl.link_status,
              sr.source, sr.source_url, sr.payload
         FROM ingest.observations o
         JOIN ingest.source_records sr USING (source_record_id)
         JOIN ingest.source_links sl USING (source_record_id)
        WHERE o.source_record_id = ANY($1::bigint[])
        ORDER BY o.source_record_id`,
      [evidence.source_record_ids]
    )).rows;
    assert.equal(sourceRows.length, 18);
    const expectedResultIds = new Set(evidence.result_ids.map(String));
    const expectedSourceIds = new Set(evidence.source_record_ids.map(String));
    for (const row of sourceRows) {
      assert(expectedSourceIds.has(String(row.source_record_id)));
      assert(expectedResultIds.has(String(row.canonical_result_id)));
      assert.equal(String(row.linked_result_id), String(row.canonical_result_id));
      assert.equal(row.link_status, 'linked');
      assert.equal(row.entity_type, 'individual_result');
      assert.equal(row.decision, 'skip_duplicate');
      assert.equal(row.target_meet_id, evidence.canonical_meet_id);
      assert.equal(String(row.target_team_id), String(evidence.old_team_id));
      assert.equal(row.source, evidence.source);
      assert.match(row.source_url, /https:\/\/www\.tfrrs\.org\/results\/93081\//);
      assert.equal(row.payload.source_team_key, 'Sacramento');
      assert.equal(row.payload.team_id, evidence.old_team_id);
      const athlete = expectedAthletes.get(String(row.payload.athlete_id));
      assert(athlete, `Source payload athlete ${row.payload.athlete_id} is outside manifest`);
      assert.equal(String(row.payload.tfrrs_athlete_id), String(athlete.tfrrs_athlete_id));
    }

    for (const row of results) {
      await client.query(
        `INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
         VALUES ($1, 'public.results', $2, $3)`,
        [evidence.operation, String(row.result_id), JSON.stringify(row)]
      );
    }
    assert.equal((await client.query(
      'SELECT count(*)::int AS n FROM ingest.fact_cleanup_archive WHERE operation_key = $1',
      [evidence.operation]
    )).rows[0].n, 18);

    const updated = await client.query(
      `UPDATE public.results
          SET team_id = $1
        WHERE result_id = ANY($2::bigint[])
          AND team_id IS NULL`,
      [evidence.new_team_id, evidence.result_ids]
    );
    assert.equal(updated.rowCount, 18);
    const after = (await client.query(
      'SELECT * FROM public.results WHERE result_id = ANY($1::bigint[]) ORDER BY result_id',
      [evidence.result_ids]
    )).rows;
    assert(after.every(row => String(row.team_id) === String(evidence.new_team_id)));
    for (let index = 0; index < after.length; index++) {
      const { full_name: _fullName, athlete_school_id: _athleteSchoolId, ...beforeFact } = results[index];
      const before = { ...beforeFact, team_id: String(evidence.new_team_id) };
      assert.deepEqual(after[index], before, `Result ${after[index].result_id} changed beyond team_id`);
    }
    assert.equal((await client.query(
      'SELECT count(*)::int AS n FROM public.relay_results WHERE meet_id = ANY($1::int[]) AND team_id = $2',
      [evidence.meet_ids, evidence.new_team_id]
    )).rows[0].n, 0, 'No relay rows are in this individual-only repair');

    await client.query(commit ? 'COMMIT' : 'ROLLBACK');
    console.log(JSON.stringify({
      operation: evidence.operation,
      committed: commit,
      source_verified_results: 18,
      athletes: 12,
      old_team_id: evidence.old_team_id,
      new_team_id: evidence.new_team_id,
      archived_before_images: 18,
      relay_rows_changed: 0,
      observations_rewritten: 0,
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
