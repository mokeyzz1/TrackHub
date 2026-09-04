#!/usr/bin/env node
// Read-only reconciliation of live rollback archives against the committed DUP-3 audit files.
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

const repoRoot = path.join(__dirname, '..', '..');
const env = dotenv.config({ path: path.join(repoRoot, '.env'), quiet: true }).parsed || {};
const auditFiles = [
  'scrapers/dedup-relay-results-2026-08-12T15-28-35-677Z.json',
  'scrapers/dedup-relay-results-2026-08-18T04-41-50-697Z.json',
  'scrapers/dedup-relay-realmarks-2026-08-18T04-48-32-678Z.json',
];
const knownIds = new Set(auditFiles.flatMap(file => require(path.join(repoRoot, file))));

async function main() {
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.hunbahsnaeeztmzqpnrl',
    password: env.DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    statement_timeout: 120000,
  });
  await client.connect();
  try {
    const { rows: archived } = await client.query(`
      WITH leg_counts AS (
        SELECT relay_result_id, count(*)::int AS archived_legs
          FROM archive.relay_athletes_d3_backup
         GROUP BY relay_result_id
      )
      SELECT relay_result_id, meet_id, event_type_id, team_id, event_name, mark_raw, place, round,
             created_at, COALESCE(l.archived_legs, 0) AS archived_legs
        FROM archive.relay_results_d3_backup r
        LEFT JOIN leg_counts l USING (relay_result_id)
       ORDER BY relay_result_id`);
    const unexplained = archived.filter(row => !knownIds.has(row.relay_result_id));
    const archivedIds = new Set(archived.map(row => row.relay_result_id));
    const knownMissingFromArchive = [...knownIds].filter(id => !archivedIds.has(id));
    const unexplainedIds = unexplained.map(row => row.relay_result_id);
    const { rows: survivorRows } = await client.query(`
      SELECT b.relay_result_id AS archived_id,
             count(r.relay_result_id)::int AS canonical_candidate_count,
             array_agg(r.relay_result_id ORDER BY r.relay_result_id)
               FILTER (WHERE r.relay_result_id IS NOT NULL) AS canonical_candidate_ids
        FROM archive.relay_results_d3_backup b
        LEFT JOIN public.relay_results r
          ON r.meet_id = b.meet_id
         AND r.event_type_id = b.event_type_id
         AND r.team_id IS NOT DISTINCT FROM b.team_id
         AND r.place IS NOT DISTINCT FROM b.place
         AND lower(regexp_replace(r.mark_raw, '[ah]$', ''))
             = lower(regexp_replace(b.mark_raw, '[ah]$', ''))
       WHERE b.relay_result_id = ANY($1::integer[])
       GROUP BY b.relay_result_id
       ORDER BY b.relay_result_id`, [unexplainedIds]);
    const survivorById = new Map(survivorRows.map(row => [row.archived_id, row]));
    const unexplainedWithSurvivors = unexplained.map(row => ({
      ...row,
      ...survivorById.get(row.relay_result_id),
    }));

    console.log(JSON.stringify({
      committed_audit_ids: knownIds.size,
      live_archive_rows: archived.length,
      committed_ids_missing_from_live_archive: knownMissingFromArchive.length,
      live_rows_not_in_committed_audits: unexplained.length,
      unexplained_leg_rows: unexplained.reduce((sum, row) => sum + row.archived_legs, 0),
      unexplained_with_no_canonical_candidate: unexplainedWithSurvivors
        .filter(row => row.canonical_candidate_count === 0).length,
      unexplained_rows: unexplainedWithSurvivors,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
