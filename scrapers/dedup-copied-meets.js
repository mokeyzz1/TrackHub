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

// Only same-date pairs are considered — that is the mechanism, and it keeps the comparison cheap.
const COPIES_SQL = `
WITH counts AS (
  SELECT r.meet_id, m.date, m.name, count(*)::int AS n
  FROM results r JOIN meets m ON m.meet_id = r.meet_id
  WHERE m.date IS NOT NULL
  GROUP BY 1,2,3),
pairs AS (
  SELECT c.meet_id AS copy_id, c.name AS copy_name, c.n AS copy_rows,
         o.meet_id AS orig_id, o.name AS orig_name, o.n AS orig_rows, c.date
  FROM counts c
  JOIN counts o ON o.date = c.date AND o.meet_id <> c.meet_id AND o.n > c.n
  JOIN meets cm ON cm.meet_id = c.meet_id
  WHERE cm.tfrrs_url IS NULL)
SELECT p.*,
  (SELECT count(*) FROM results rc WHERE rc.meet_id = p.copy_id
     AND NOT EXISTS (SELECT 1 FROM results ro WHERE ro.meet_id = p.orig_id
        AND ro.athlete_id = rc.athlete_id AND ro.event_type_id IS NOT DISTINCT FROM rc.event_type_id
        AND ro.mark_raw = rc.mark_raw AND ro.place IS NOT DISTINCT FROM rc.place))::int AS unique_rows
FROM pairs p`;

(async () => {
  let c = mk(); await c.connect();

  console.log('scanning same-date meet pairs for full containment...');
  const { rows: all } = await c.query(COPIES_SQL);
  const copies = all.filter(r => r.unique_rows === 0);

  // a meet could match several originals; keep one entry per copy
  const seen = new Map();
  for (const r of copies) if (!seen.has(r.copy_id)) seen.set(r.copy_id, r);
  const list = [...seen.values()].sort((a, b) => b.copy_rows - a.copy_rows);

  const totalRows = list.reduce((s, r) => s + r.copy_rows, 0);
  console.log(`\ncopied meets found: ${list.length}  (rows to delete: ${totalRows.toLocaleString()})\n`);
  list.slice(0, 25).forEach(r => console.log(
    `  ${r.date.toISOString().slice(0,10)}  "${r.copy_name}" (#${r.copy_id}, ${r.copy_rows} rows, 0 unique)` +
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
