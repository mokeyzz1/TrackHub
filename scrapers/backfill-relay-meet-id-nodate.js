#!/usr/bin/env node
/**
 * Link dateless relays to their meet — BY NAME, BUT ONLY WITH CORROBORATION.
 *
 * WHY: 26,136 relay_results still have no meet_id, so they never appear on a meet page.
 * 11,712 of those have a date and were handled by `backfill-relay-meet-id.js` (name+date).
 * The remaining 14,365 have a meet_name but NO DATE, so name+date can't reach them.
 *
 * WHY NOT JUST MATCH ON NAME. Meet names repeat every year. Of the 14,365:
 *     5,907  name matches exactly one meet row   <- looks safe, ISN'T (see below)
 *     5,735  name matches 2-12 meets             <- ambiguous, never guess
 *     2,723  name matches no meet at all
 *
 * Even the "exactly one meet" set is a trap: if a meet ran six editions and only one is in
 * `meets`, a dateless relay from another year matches that single row and gets linked to the
 * WRONG EDITION. Measured, that is not hypothetical — of those 5,907:
 *
 *     3,271  a leg athlete has a result AT that meet          -> corroborated, link it
 *        11  the meet has no results at all                   -> can't tell, skip
 *         4  the relay's legs aren't known athletes           -> can't tell, skip
 *     2,621  meet HAS results, legs ARE known, none competed  -> CONTRADICTED, skip
 *
 * That 2,621 is what naive name-matching would have silently mislinked. So the rule here is:
 * link only when at least one of the relay's own leg athletes is independently recorded as
 * having competed at the target meet.
 *
 * The date is filled from the meet as well — if we trust the link, the date follows, and it
 * stops the row from looking dateless forever.
 *
 * Safe-backfill method (weak instance): candidate set resolved server-side once, then small
 * throttled VALUES-driven updates keyed on the PK. Re-runnable — it only ever touches rows
 * that still have meet_id IS NULL.
 *
 *   node backfill-relay-meet-id-nodate.js            # dry run
 *   node backfill-relay-meet-id-nodate.js --apply    # write
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';
const CHUNK = 500;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const mk = () => new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
  database: 'postgres', ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 25000, statement_timeout: 240000 });

// Candidates: dateless, unlinked, name resolves to exactly one meet, AND a leg athlete is
// independently recorded at that meet.
const CANDIDATE_SQL = `
WITH cand AS (
  SELECT rr.relay_result_id, rr.meet_name
  FROM relay_results rr
  WHERE rr.meet_id IS NULL AND rr.date IS NULL AND rr.meet_name IS NOT NULL),
uniq AS (
  SELECT c.meet_name, min(m.meet_id) AS meet_id
  FROM (SELECT DISTINCT meet_name FROM cand) c
  JOIN meets m ON m.name = c.meet_name
  GROUP BY c.meet_name
  HAVING count(m.meet_id) = 1)
SELECT c.relay_result_id, u.meet_id
FROM cand c
JOIN uniq u ON u.meet_name = c.meet_name
WHERE EXISTS (
  SELECT 1 FROM relay_athletes ra
  JOIN results r ON r.athlete_id = ra.athlete_id
  WHERE ra.relay_result_id = c.relay_result_id AND r.meet_id = u.meet_id)`;

(async () => {
  let c = mk(); await c.connect();

  const { rows: pairs } = await c.query(CANDIDATE_SQL);
  console.log(`corroborated dateless relays to link: ${pairs.length.toLocaleString()}${APPLY ? '' : '  (DRY RUN)'}`);
  if (!pairs.length) { await c.end(); return; }

  if (!APPLY) {
    console.log('\nsample:');
    const { rows: sample } = await c.query(
      `SELECT rr.relay_result_id, rr.meet_name, rr.event_name, rr.mark_raw, m.date::text AS meet_date
       FROM relay_results rr JOIN meets m ON m.meet_id = $1
       WHERE rr.relay_result_id = ANY($2::int[]) LIMIT 5`,
      [pairs[0].meet_id, pairs.slice(0, 5).map(p => p.relay_result_id)]);
    sample.forEach(s => console.log(`  #${s.relay_result_id}  ${s.event_name}  ${s.mark_raw}  "${s.meet_name}"`));
    console.log('\n(dry run — pass --apply to write)');
    await c.end(); return;
  }

  // AUDIT LOG — write the exact ids BEFORE touching them.
  // Learned the hard way on the first run (2026-08-09): without this there is no way afterwards
  // to tell which rows this backfill linked, because the rows it writes are indistinguishable
  // from normally-linked ones. That makes "did this create duplicates?" unanswerable, and
  // makes a targeted rollback impossible. Never write a bulk change without this file.
  const auditPath = require('path').join(__dirname,
    `backfill-relay-nodate-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  require('fs').writeFileSync(auditPath, JSON.stringify(pairs));
  console.log(`audit log: ${auditPath}`);

  let updated = 0;
  for (let i = 0; i < pairs.length; i += CHUNK) {
    const chunk = pairs.slice(i, i + CHUNK);
    const values = chunk.map(p => `(${p.relay_result_id},${p.meet_id})`).join(',');
    try {
      const res = await c.query(
        `UPDATE relay_results rr
         SET meet_id = v.mid, date = m.date
         FROM (VALUES ${values}) AS v(rid, mid)
         JOIN meets m ON m.meet_id = v.mid
         WHERE rr.relay_result_id = v.rid AND rr.meet_id IS NULL`);
      updated += res.rowCount;
    } catch (e) {
      console.log(`  update error @${i}: ${e.message}`);
      try { await c.end(); } catch (_) {}
      await sleep(2000); c = mk(); await c.connect();
    }
    await sleep(120);
    console.log(`  ..${Math.min(i + CHUNK, pairs.length)}/${pairs.length}  updated ${updated}`);
  }

  // verify (house rule: every bulk op gets a post-write check)
  const { rows: [v] } = await c.query(`
    SELECT count(*) FILTER (WHERE meet_id IS NULL AND date IS NULL AND meet_name IS NOT NULL)::int AS still_dateless,
           count(*) FILTER (WHERE meet_id IS NULL)::int AS still_unlinked
    FROM relay_results`);
  // did any linked row land on top of an identical relay already on that meet? (DUP-3 collision)
  const ids = pairs.map(p => p.relay_result_id);
  const { rows: [d] } = await c.query(`
    WITH mine AS (SELECT * FROM relay_results WHERE relay_result_id = ANY($1::int[]))
    SELECT count(*)::int AS colliding
    FROM mine m
    WHERE EXISTS (
      SELECT 1 FROM relay_results o
      WHERE o.relay_result_id <> m.relay_result_id
        AND o.meet_id = m.meet_id AND o.event_type_id = m.event_type_id
        AND o.team_id IS NOT DISTINCT FROM m.team_id
        AND o.place IS NOT DISTINCT FROM m.place
        AND o.mark_raw = m.mark_raw)`, [ids]);

  console.log(`\nDONE — updated ${updated.toLocaleString()}`);
  console.log(`remaining dateless+unlinked: ${v.still_dateless.toLocaleString()} | total unlinked: ${v.still_unlinked.toLocaleString()}`);
  console.log(`linked rows that duplicate an existing relay on the same meet: ${d.colliding.toLocaleString()} (feeds DUP-3 dedup)`);
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
