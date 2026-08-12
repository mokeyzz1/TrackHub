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
SELECT pm.meet_id AS copy_id, mm.name AS copy_name, mm.date, pm.total_rows AS copy_rows
FROM per_meet pm
JOIN meets mm ON mm.meet_id = pm.meet_id
WHERE pm.shared_rows = pm.total_rows          -- zero unique rows
  AND mm.tfrrs_url IS NULL
  AND pm.total_rows > 0`;

const SINCE = (process.argv.find(a => a.startsWith('--since=')) || '--since=2025-01-01').split('=')[1];
// --only=<id,id,...> : restrict to specific copy meet_ids. Used to apply ONLY the cases whose
// surviving meet has been verified by the school-identity test -- its schools must match its own
// name. "Unflagged" proves the data survives, NOT that the survivor is correctly named: two
// candidates kept a mislabeled meet ("NJCAA Region 1" holding Kansas juco = Region 6 data,
// "Conference Carolinas" holding Oregon/Washington = Northwest Conference data) and would have
// deleted the correctly-named copy.
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1];
const ONLY_IDS = ONLY ? new Set(ONLY.split(',').map(Number)) : null;

(async () => {
  let c = mk(); await c.connect();

  console.log(`scanning meets since ${SINCE} for fully-copied results...`);
  const { rows: all } = await c.query(COPIES_SQL, [SINCE]);
  const copies = all;

  // a meet could appear more than once; keep one entry per copy
  const seen = new Map();
  for (const r of copies) if (!seen.has(r.copy_id)) seen.set(r.copy_id, r);
  const candidates = [...seen.values()].sort((a, b) => b.copy_rows - a.copy_rows);

  // STAGE 2 -- find the meet that ACTUALLY holds each copy's rows.
  // Do not guess. Every heuristic tried failed on real data: "largest same-date meet" named
  // Southland as the owner of Big Ten results, and "largest link-backed meet within 3 days"
  // named Chicagoland as the owner of the Utah Spring Classic rows -- which contains 0 of its
  // 851. Ask the data which meet contains them instead.
  console.log('resolving the true container for each copy...');
  const list = [];
  for (const r of candidates) {
    const { rows: top } = await c.query(`
      SELECT o.meet_id, m.name, count(*)::int AS shared
      FROM results cp
      JOIN results o
        ON o.athlete_id IS NOT DISTINCT FROM cp.athlete_id
       AND o.event_type_id IS NOT DISTINCT FROM cp.event_type_id
       AND o.mark_raw = cp.mark_raw
       AND o.place IS NOT DISTINCT FROM cp.place
       AND o.meet_id <> cp.meet_id
      JOIN meets m ON m.meet_id = o.meet_id
      WHERE cp.meet_id = $1
      GROUP BY 1,2 ORDER BY count(*) DESC LIMIT 8`, [r.copy_id]);
    if (!top.length) { console.log(`  no container found for #${r.copy_id} "${r.copy_name}" — skipped`); continue; }
    const full = top.filter(t => t.shared >= r.copy_rows);
    if (!full.length) {
      console.log(`  PARTIAL only for "${r.copy_name}" (#${r.copy_id}): best holds ${top[0].shared}/${r.copy_rows} — skipped`);
      continue;
    }
    list.push({ ...r, containers: full, orig_id: full[0].meet_id, orig_name: full[0].name, orig_rows: full[0].shared });
  }
  console.log(`copies with a fully-verified container: ${list.length} of ${candidates.length}`);

  // SPLIT THE PROBLEM.
  // If a copy's rows also live at a meet that was never flagged as a copy, that meet is real
  // (it has unique rows of its own), the data provably survives, and deleting the copy needs NO
  // decision about who owns what. Arkansas holds all 851 of the Utah Spring Classic's rows and
  // has 18 of its own -- clear-cut. Only clusters where copies contain ONLY each other require
  // evidence, and those are the ones every heuristic got wrong.
  const flaggedCopyIds = new Set(list.map(r => r.copy_id));
  const safe = list.filter(r => r.containers.some(t => !flaggedCopyIds.has(t.meet_id)));
  const needsJudgement = list.filter(r => !r.containers.some(t => !flaggedCopyIds.has(t.meet_id)));
  console.log(`\nSAFE  (an unflagged real meet holds the rows): ${safe.length} meets, ${safe.reduce((a,r)=>a+r.copy_rows,0).toLocaleString()} rows`);
  safe.slice(0, 30).forEach(r => {
    const ext = r.containers.find(t => !flaggedCopyIds.has(t.meet_id));
    console.log(`   "${r.copy_name}" (#${r.copy_id}, ${r.copy_rows}) -> lives at "${ext.name}" (#${ext.meet_id})`);
  });
  console.log(`\nNEEDS EVIDENCE (copies only contain each other): ${needsJudgement.length} meets, ${needsJudgement.reduce((a,r)=>a+r.copy_rows,0).toLocaleString()} rows`);
  needsJudgement.slice(0, 20).forEach(r => console.log(`   "${r.copy_name}" (#${r.copy_id}, ${r.copy_rows})`));

  // only the safe half is ever eligible here
  let eligible = safe;
  if (ONLY_IDS) {
    eligible = safe.filter(r => ONLY_IDS.has(r.copy_id));
    console.log(`\n--only supplied: restricted to ${eligible.length} verified meets`);
  }
  list.length = 0; list.push(...eligible);

  // MUTUAL COPIES -- the danger this whole exercise keeps circling back to.
  // Two meets can each be a full copy of the other ("Patriot League" <-> "Summit League",
  // "Jim Duncan" <-> "Jim Linthicum", "Cougar Classic" <-> "Bill Bippes Cougar Classic").
  // Both get flagged, and deleting both would erase the results entirely. So: union the
  // copy<->container pairs into clusters and keep exactly ONE meet per cluster.
  const parent = new Map();
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { [a, b].forEach(v => { if (!parent.has(v)) parent.set(v, v); });
                            const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  list.forEach(r => union(r.copy_id, r.orig_id));

  const meetIds = [...new Set(list.flatMap(r => [r.copy_id, r.orig_id]))];
  const { rows: meta } = await c.query(
    `SELECT m.meet_id, m.name, m.tfrrs_url IS NOT NULL AS has_link,
            (SELECT count(*) FROM results r WHERE r.meet_id = m.meet_id)::int AS rows
     FROM meets m WHERE m.meet_id = ANY($1::int[])`, [meetIds]);
  const info = new Map(meta.map(m => [m.meet_id, m]));

  const clusters = new Map();
  meetIds.forEach(id => { const root = find(id); if (!clusters.has(root)) clusters.set(root, []); clusters.get(root).push(id); });

  // survivor per cluster: a stored results link wins, then the most rows, then lowest id
  const doomedMeets = new Set();
  console.log('\nclusters (one survivor each):');
  for (const [, ids] of clusters) {
    const ranked = ids.map(id => info.get(id)).filter(Boolean)
      .sort((a, b) => (b.has_link - a.has_link) || (b.rows - a.rows) || (a.meet_id - b.meet_id));
    const keep = ranked[0];
    ranked.slice(1).forEach(m => doomedMeets.add(m.meet_id));
    if (ranked.length > 1) console.log(
      `  KEEP "${keep.name}" (#${keep.meet_id}, ${keep.rows} rows${keep.has_link ? ', has link' : ''})` +
      `  |  drop ${ranked.slice(1).map(m => `"${m.name}" (#${m.meet_id})`).join(', ')}`);
  }
  // only delete meets that are both a confirmed copy AND not their cluster's survivor
  const before = list.length;
  const filtered = list.filter(r => doomedMeets.has(r.copy_id));
  list.length = 0; list.push(...filtered);
  console.log(`\nafter keeping one survivor per cluster: ${list.length} meets to clear (was ${before})`);

  const totalRows = list.reduce((s, r) => s + r.copy_rows, 0);
  console.log(`\ncopied meets confirmed: ${list.length}  (rows to delete: ${totalRows.toLocaleString()})\n`);
  list.slice(0, 25).forEach(r => console.log(
    `  ${new Date(r.date).toISOString().slice(0,10)}  "${r.copy_name}" (#${r.copy_id}, ${r.copy_rows} rows, 0 unique)` +
    `  ->  copy of "${r.orig_name}" (#${r.orig_id}, ${r.orig_rows} rows)`));
  if (list.length > 25) console.log(`  ... and ${list.length - 25} more`);

  if (!APPLY) { console.log('\n(dry run — pass --apply to back up and delete)'); await c.end(); return; }
  if (!list.length) { await c.end(); return; }

  // HARD PRECONDITION: prove each copy's rows really are in the meet named as its original.
  // The detection only proves every row exists at SOME other meet, and the "original" is picked
  // by size -- which is exactly how the first version named Southland as the owner of Big Ten
  // results. Verify containment pair by pair, and drop any candidate that fails.
  console.log('\nverifying containment against the named original...');
  const verified = [];
  for (const r of list) {
    const { rows: [v] } = await c.query(`
      SELECT count(*)::int AS not_in_original
      FROM results c
      WHERE c.meet_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM results o
          WHERE o.meet_id = $2
            AND o.athlete_id IS NOT DISTINCT FROM c.athlete_id
            AND o.event_type_id IS NOT DISTINCT FROM c.event_type_id
            AND o.mark_raw = c.mark_raw
            AND o.place IS NOT DISTINCT FROM c.place)`, [r.copy_id, r.orig_id]);
    if (v.not_in_original === 0) verified.push(r);
    else console.log(`  SKIP "${r.copy_name}" (#${r.copy_id}) — ${v.not_in_original} rows are NOT in "${r.orig_name}"`);
  }
  console.log(`verified safe to delete: ${verified.length} of ${list.length} meets`);
  if (!verified.length) { await c.end(); return; }
  list.length = 0; list.push(...verified);

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
