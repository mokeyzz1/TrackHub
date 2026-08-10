#!/usr/bin/env node
/**
 * D2 — remove within-meet round duplicates from `results`.
 *
 * MECHANISM (verified against TFRRS): TFRRS publishes a race twice — once in the combined
 * result list and once broken out by heat — so one run is scraped twice under different round
 * labels. Measured whole-DB 2026-08-10 on key (athlete, meet, event_type, mark_raw, place):
 *
 *     441,314 groups · 453,113 extra rows · 71,117 athletes
 *     Finals + Heat N        ~370,000 extra rows   <- the double-publication
 *     Heat N + Preliminaries  ~58,000
 *     same label repeated      10,888              <- pure duplicates
 *
 * WHY THIS KEY IS SAFE. A genuine prelim->final pair has a DIFFERENT time (verified:
 * Carson-Newman 39.50 prelim -> 39.30 final), so requiring an identical mark AND identical place
 * cannot merge two real races. The one residual ambiguity is a group containing BOTH
 * 'Preliminaries' and 'Finals' with the same mark and place — an athlete really can run the same
 * time twice and place the same. There are only 185 such groups (365 rows), so they are
 * EXCLUDED rather than guessed at.
 *
 * The copies are content-identical: of 441,314 groups, mark_seconds differs in 0, team_id in 7,
 * wind in 7. So which row survives barely matters — but the keep-rule still prefers the most
 * complete row so no field is lost.
 *
 * KEEP ORDER: has team_id > has wind > round priority (Finals > Preliminaries > Heat > null)
 *             > lowest result_id.
 *
 * ROLLBACK. Nothing references results.result_id (no FKs), so deletion creates no orphans.
 * Every deleted row is copied WHOLE into `results_d2_backup` first — an id list is not enough to
 * undo a DELETE. Restore with:
 *     INSERT INTO results SELECT <cols> FROM results_d2_backup;
 * (See CLAUDE.md §7 — a previous backfill was run without capturing what it touched and became
 * unverifiable. Not repeating that.)
 *
 *   node dedup-results-rounds.js              # dry run: counts + samples, writes nothing
 *   node dedup-results-rounds.js --apply      # backup then delete, in throttled batches
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
// --pilot: restrict to a small set of meets so the effect can be eyeballed in the app before
// the full run. Deliberately includes the meets behind the two athletes the owner reported.
const PILOT = process.argv.includes('--pilot');
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';
const BATCH = 5000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PILOT_MEETS = `
  SELECT DISTINCT r.meet_id FROM results r JOIN athletes a ON a.athlete_id = r.athlete_id
  WHERE a.full_name IN ('Durrell Collins','Jaurdin Mallory') AND r.meet_id IS NOT NULL`;
const meetFilter = PILOT ? `AND meet_id IN (${PILOT_MEETS})` : '';
const meetFilterR = PILOT ? `AND r.meet_id IN (${PILOT_MEETS})` : '';

const mk = () => new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
  database: 'postgres', ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 25000, statement_timeout: 300000 });

// Rows to delete: every member of a duplicate group except the best one.
// Groups containing both Preliminaries and Finals are excluded entirely.
const DOOMED_SQL = `
WITH g AS (
  SELECT athlete_id, meet_id, event_type_id, mark_raw, place
  FROM results
  WHERE meet_id IS NOT NULL AND athlete_id IS NOT NULL AND mark_raw IS NOT NULL
    ${meetFilter}
  GROUP BY 1,2,3,4,5
  HAVING count(*) > 1
     AND NOT (bool_or(round = 'Preliminaries') AND bool_or(round = 'Finals'))
),
ranked AS (
  SELECT r.result_id,
         row_number() OVER (
           PARTITION BY r.athlete_id, r.meet_id, r.event_type_id, r.mark_raw, r.place
           ORDER BY (r.date = m.date) DESC NULLS LAST,   -- whole-meet re-imports disagree on date
                    (r.team_id IS NOT NULL) DESC,
                    (r.wind IS NOT NULL) DESC,
                    CASE r.round WHEN 'Finals' THEN 3 WHEN 'Preliminaries' THEN 2
                                 WHEN NULL THEN 0 ELSE 1 END DESC,
                    r.result_id ASC) AS rn
  FROM results r
  JOIN meets m ON m.meet_id = r.meet_id
  JOIN g ON g.athlete_id = r.athlete_id AND g.meet_id = r.meet_id
        AND g.event_type_id = r.event_type_id AND g.mark_raw = r.mark_raw
        AND g.place IS NOT DISTINCT FROM r.place
  WHERE r.meet_id IS NOT NULL AND r.athlete_id IS NOT NULL AND r.mark_raw IS NOT NULL
    ${meetFilterR}
)
SELECT result_id FROM ranked WHERE rn > 1`;

(async () => {
  let c = mk(); await c.connect();

  if (!APPLY) {
    console.log('resolving duplicate groups (dry run — nothing will be written)...');
    const { rows: [n] } = await c.query(`SELECT count(*)::int AS doomed FROM (${DOOMED_SQL}) d`);
    console.log(`rows that would be deleted: ${n.doomed.toLocaleString()}`);

    const { rows: sample } = await c.query(`
      WITH d AS (${DOOMED_SQL})
      SELECT r.athlete_id, a.full_name, r.meet_name, r.event_name, r.mark_raw, r.place, r.round
      FROM results r JOIN d ON d.result_id = r.result_id
      JOIN athletes a ON a.athlete_id = r.athlete_id
      LIMIT 8`);
    console.log('\nsample of rows that would go:');
    sample.forEach(s => console.log(
      `  ${s.full_name} — ${s.event_name} ${s.mark_raw} place ${s.place} [${s.round}] @ ${s.meet_name}`));

    // prove the survivor is still there for those same groups
    const { rows: [k] } = await c.query(`
      WITH d AS (${DOOMED_SQL})
      SELECT count(DISTINCT (r.athlete_id, r.meet_id, r.event_type_id, r.mark_raw, r.place))::int AS groups
      FROM results r JOIN d ON d.result_id = r.result_id`);
    console.log(`\ngroups affected: ${k.groups.toLocaleString()} — exactly one row survives in each`);
    console.log('(dry run — pass --apply to back up and delete)');
    await c.end(); return;
  }

  // 1. backup table holding the WHOLE row (an id list cannot undo a DELETE)
  await c.query(`CREATE TABLE IF NOT EXISTS results_d2_backup (LIKE results INCLUDING DEFAULTS)`);
  // Appending is fine and expected (pilot run, then the full run). Each run writes its own audit
  // JSON, so any single run is still individually identifiable and reversible.
  const { rows: [pre] } = await c.query('SELECT count(*)::int AS n FROM results_d2_backup');
  if (pre.n > 0) console.log(`results_d2_backup already holds ${pre.n.toLocaleString()} rows (earlier run) — appending`);

  console.log('resolving doomed ids...');
  const { rows: doomed } = await c.query(DOOMED_SQL);
  const ids = doomed.map(r => r.result_id);
  console.log(`doomed rows: ${ids.length.toLocaleString()}`);

  const auditPath = require('path').join(__dirname,
    `dedup-results-rounds-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  require('fs').writeFileSync(auditPath, JSON.stringify(ids));
  console.log(`audit log: ${auditPath}`);

  let backed = 0, deleted = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    try {
      const b = await c.query(
        `INSERT INTO results_d2_backup SELECT * FROM results WHERE result_id = ANY($1::int[])`, [chunk]);
      backed += b.rowCount;
      const d = await c.query(`DELETE FROM results WHERE result_id = ANY($1::int[])`, [chunk]);
      deleted += d.rowCount;
    } catch (e) {
      console.log(`  error @${i}: ${e.message}`);
      try { await c.end(); } catch (_) {}
      await sleep(3000); c = mk(); await c.connect();
      continue;
    }
    await sleep(150);
    if (i % (BATCH * 10) === 0 || i + BATCH >= ids.length)
      console.log(`  ${Math.min(i + BATCH, ids.length).toLocaleString()}/${ids.length.toLocaleString()}  backed ${backed.toLocaleString()} deleted ${deleted.toLocaleString()}`);
  }

  // 2. verify
  const { rows: [v] } = await c.query(`
    WITH g AS (
      SELECT athlete_id, meet_id, event_type_id, mark_raw, place, count(*)::int AS n
      FROM results WHERE meet_id IS NOT NULL AND athlete_id IS NOT NULL AND mark_raw IS NOT NULL
      GROUP BY 1,2,3,4,5 HAVING count(*) > 1)
    SELECT count(*)::int AS remaining_groups, COALESCE(sum(n-1),0)::int AS remaining_extra FROM g`);
  console.log(`\nDONE — backed up ${backed.toLocaleString()} | deleted ${deleted.toLocaleString()}`);
  console.log(`remaining duplicate groups: ${v.remaining_groups.toLocaleString()} (expect ~185 prelim+final, deliberately kept)`);
  console.log(`rollback: INSERT INTO results SELECT * FROM results_d2_backup;`);
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
