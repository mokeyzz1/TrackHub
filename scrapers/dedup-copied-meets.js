#!/usr/bin/env node
/**
 * DUP-1 — remove results that were imported onto the WRONG meet.
 *
 * SYMPTOM (owner-reported twice): an athlete's profile shows a meet they never attended.
 * Jaurdin Mallory appeared at the "Utah Spring Classic" in Salt Lake City; she runs for
 * Northwest Missouri and actually competed at the Arkansas Spring Invitational in Fayetteville.
 *
 * PROVEN CASE (2026-08-10), meet 12436 "Utah Spring Classic" 2026-04-11:
 *     851 results, and ALL 851 also exist at 12337 "Arkansas Spring Invitational" (same date).
 *     594 athletes, ZERO of them unique to Utah. Arkansas holds 869 rows — a strict superset.
 *     Mallory's rows are byte-identical across both, created 25 seconds apart
 *     (08:03:10 into Utah, 08:03:35 into Arkansas).
 *
 * ROOT CAUSE: neither meet has a `tfrrs_url` (12337 is literally flagged 'missing_tfrrs_url'),
 * so these results did not come from a stored link — they came from name/date matching. Two
 * meets share 2026-04-11, so one TFRRS page was imported into both. This is exactly the failure
 * mode CLAUDE.md §1b says fuzzy matching causes, which is why the pipeline moved to stored links.
 *
 * DETECTION: meet C is a copy of meet O when
 *     - same date
 *     - every one of C's results (athlete, event_type, mark, place) also exists in O
 *     - O has strictly more rows than C   (so O is the superset / original)
 *     - C has no `tfrrs_url` of its own
 * Equal-sized mutual copies are SKIPPED — with no superset there is nothing to say which is the
 * original, and guessing is how this mess started.
 *
 * EFFECT: C's copied rows are deleted; the meet row itself stays and returns to "no results",
 * which is the truthful state — we simply do not have that meet's real results.
 *
 * Every deleted row is copied whole into `results_d1_backup` first, plus an audit JSON of the
 * ids (CLAUDE.md §7). Nothing FKs to results.result_id, so no orphans.
 *   Rollback: INSERT INTO results SELECT * FROM results_d1_backup;
 *
 *   node dedup-copied-meets.js            # dry run — lists the copied meets, writes nothing
 *   node dedup-copied-meets.js --apply    # back up and delete
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';
const BATCH = 5000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const mk = () => new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
  database: 'postgres', ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 25000, statement_timeout: 600000 });

// DETECTION, single pass. The pairwise self-join (every same-date meet pair, with a correlated
// containment count) times out on this instance -- weekends stack dozens of meets on one date.
// Instead: key every result by (date, athlete, event, mark, place) and find keys that occur at
// more than one meet. Those are cross-meet duplicates. A meet where EVERY row is shared, and
// which is strictly smaller than the meet it shares with, is a copy.
const COPIES_SQL = `
WITH keyed AS (
  SELECT r.meet_id, m.date, r.athlete_id, r.event_type_id, r.mark_raw, r.place
  FROM results r
  JOIN meets m ON m.meet_id = r.meet_id
  WHERE m.date IS NOT NULL AND m.date >= $1
    AND r.athlete_id IS NOT NULL AND r.mark_raw IS NOT NULL),
shared AS (
  SELECT date, athlete_id, event_type_id, mark_raw, place
  FROM keyed
  GROUP BY 1,2,3,4,5
  HAVING count(DISTINCT meet_id) > 1),
per_meet AS (
  SELECT k.meet_id,
         count(*)::int AS total_rows,
         count(s.date)::int AS shared_rows
  FROM keyed k
  LEFT JOIN shared s
    ON s.date = k.date AND s.athlete_id = k.athlete_id
   AND s.event_type_id IS NOT DISTINCT FROM k.event_type_id
   AND s.mark_raw = k.mark_raw AND s.place IS NOT DISTINCT FROM k.place
  GROUP BY 1)
SELECT pm.meet_id AS copy_id, mm.name AS copy_name, mm.date, pm.total_rows AS copy_rows,
       o.meet_id AS orig_id, o.name AS orig_name, o.rows AS orig_rows
FROM per_meet pm
JOIN meets mm ON mm.meet_id = pm.meet_id
JOIN LATERAL (
  -- The ORIGINAL is the meet holding a STORED results link, not the biggest one and not
  -- necessarily one on the same date. Proven 2026-08-10: "Big 12", "BIG EAST" and "Big Sky"
  -- Outdoor Championships each held 1,471 identical rows of BIG TEN school results, while the
  -- genuine "Big Ten Outdoor Championships" (13056) sat on the NEXT day with a tfrrs_url and a
  -- 2,446-row superset containing all 1,471. Picking "largest same-date meet" named Southland --
  -- a completely real, unrelated championship -- as the original. Size and date are not evidence.
  SELECT m2.meet_id, m2.name, count(*)::int AS rows
  FROM results r2 JOIN meets m2 ON m2.meet_id = r2.meet_id
  WHERE m2.meet_id <> pm.meet_id
    AND m2.tfrrs_url IS NOT NULL
    AND m2.date BETWEEN mm.date - 3 AND mm.date + 3
  GROUP BY 1,2
  HAVING count(*) >= pm.total_rows
  ORDER BY count(*) DESC
  LIMIT 1) o ON true
WHERE pm.shared_rows = pm.total_rows          -- zero unique rows
  AND mm.tfrrs_url IS NULL
  AND pm.total_rows > 0`;

const SINCE = (process.argv.find(a => a.startsWith('--since=')) || '--since=2025-01-01').split('=')[1];

(async () => {
  let c = mk(); await c.connect();

  console.log(`scanning meets since ${SINCE} for fully-copied results...`);
  const { rows: all } = await c.query(COPIES_SQL, [SINCE]);
  const copies = all;

  // a meet could match several originals; keep one entry per copy
  const seen = new Map();
  for (const r of copies) if (!seen.has(r.copy_id)) seen.set(r.copy_id, r);
  const list = [...seen.values()].sort((a, b) => b.copy_rows - a.copy_rows);

  const totalRows = list.reduce((s, r) => s + r.copy_rows, 0);
  console.log(`\ncopied meets found: ${list.length}  (rows to delete: ${totalRows.toLocaleString()})\n`);
  list.slice(0, 25).forEach(r => console.log(
    `  ${new Date(r.date).toISOString().slice(0,10)}  "${r.copy_name}" (#${r.copy_id}, ${r.copy_rows} rows, 0 unique)` +
    `  ->  copy of "${r.orig_name}" (#${r.orig_id}, ${r.orig_rows} rows)`));
  if (list.length > 25) console.log(`  ... and ${list.length - 25} more`);

  if (!APPLY) { console.log('\n(dry run — pass --apply to back up and delete)'); await c.end(); return; }
  if (!list.length) { await c.end(); return; }

  await c.query(`CREATE TABLE IF NOT EXISTS results_d1_backup (LIKE results INCLUDING DEFAULTS)`);
  const copyIds = list.map(r => r.copy_id);
  const { rows: doomed } = await c.query(
    'SELECT result_id FROM results WHERE meet_id = ANY($1::int[])', [copyIds]);
  const ids = doomed.map(r => r.result_id);

  const auditPath = require('path').join(__dirname,
    `dedup-copied-meets-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  require('fs').writeFileSync(auditPath, JSON.stringify({ meets: list, result_ids: ids }));
  console.log(`\naudit log: ${auditPath}`);

  let backed = 0, deleted = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    try {
      backed += (await c.query(
        `INSERT INTO results_d1_backup SELECT * FROM results WHERE result_id = ANY($1::int[])`, [chunk])).rowCount;
      deleted += (await c.query(`DELETE FROM results WHERE result_id = ANY($1::int[])`, [chunk])).rowCount;
    } catch (e) {
      console.log(`  error @${i}: ${e.message}`);
      try { await c.end(); } catch (_) {}
      await sleep(3000); c = mk(); await c.connect(); continue;
    }
    await sleep(150);
    console.log(`  ${Math.min(i + BATCH, ids.length).toLocaleString()}/${ids.length.toLocaleString()}  deleted ${deleted.toLocaleString()}`);
  }

  // the copied meets should now be empty, and honestly marked as such
  await c.query(`UPDATE meets SET results_status = 'pending'
                 WHERE meet_id = ANY($1::int[]) AND results_status <> 'pending'`, [copyIds]);
  console.log(`\nDONE — backed up ${backed.toLocaleString()} | deleted ${deleted.toLocaleString()} across ${list.length} meets`);
  console.log(`rollback: INSERT INTO results SELECT * FROM results_d1_backup;`);
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
