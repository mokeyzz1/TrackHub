#!/usr/bin/env node
/**
 * M9 — populate `mark_seconds` wherever a mark is a time but was stored only as text.
 *
 * COVERS ALL THREE SIBLING TABLES: `results`, `relay_results`, `athlete_prs`.
 *
 * ⚠️ THE FIRST VERSION OF THIS SCRIPT ONLY DID `results`, and that was the whole mistake pattern
 * `DEDUP_METHOD.md` §0 exists to prevent: *"where else does this pattern live? results <->
 * relay_results <-> athlete-history rows are siblings."* Fixing one table and declaring the class
 * fixed left **379,508 rows** with the identical defect — 119,148 in `relay_results` and 260,360
 * in `athlete_prs`. The owner caught it by asking whether the verification really covered the
 * whole database. It did not. It does now.
 *
 * THE FINDING. Rows hold a parseable time in `mark_raw` with `mark_seconds` NULL, so they cannot
 * be sorted, ranked or PR-ed. `mark_raw` still displays fine, which is why this survived nine
 * months: the app looked correct and only computed features were broken. In `results`, 856,765 of
 * them came from a single bulk import in **November 2025**; every import from March 2026 onward
 * parses correctly. So the CODE was already fixed and only the DATA was stale — the split
 * DEDUP_METHOD §0 warns about. This script is the second line: the data repair.
 *
 * ALSO REPAIRS 6 CORRUPT ROWS in `results`. athletic.net's parser did
 * `const [mm, ss] = clean.split(':')`, which on "1:05:37.73" binds mm="1", ss="05" -> 65 seconds
 * for a 65-MINUTE run. The scraper-side fix is `scrapers/shared/mark_parser.js`.
 *
 * WHY THE ARITHMETIC IS IN SQL. 1.7M rows is far too many to round-trip through Node on this
 * instance. The CASE below is the same logic as mark_parser.js, validated the same way.
 *
 * VERIFICATION BEFORE WRITING — the expression was run against every row that ALREADY had a
 * mark_seconds, per table:
 *     results        1,082,583 checked -> 1,082,576 reproduced exactly
 *                    (7 misses = the 6 corrupt h:mm:ss rows, where the expression is RIGHT and the
 *                     stored value wrong, plus one 3-decimal rounding difference)
 *     relay_results     64,894 checked ->    64,894 exact, 0 disagreements
 *     athlete_prs      117,497 checked ->   117,497 exact, 0 disagreements
 * An expression that cannot reproduce known-good data has no business writing new data.
 *
 * DELIBERATELY NOT TOUCHED:
 *   - Bare integers on Decathlon/Heptathlon/Pentathlon rows. Those are POINTS. Writing 8420 into
 *     mark_seconds would rank a decathlete as the slowest athlete in the database.
 *   - Status codes (DNS/DQ/NM/NT/...). Per OWNER_DECISIONS.md these ARE results; they just have
 *     no numeric value.
 *   - "0:00.0" / "0.00" — placeholders for a MISSING time. As a number that is faster than any
 *     world record and would top every leaderboard.
 *   - `mark_meters`. Field marks already parse; this run is times only.
 *
 * ROLLBACK. Every written id is appended to a per-table audit file BEFORE its batch is applied.
 * See docs/RECOVERY.md.
 *
 *   node backfill-mark-seconds.js                    # dry run, all three tables
 *   node backfill-mark-seconds.js --apply
 *   node backfill-mark-seconds.js --apply --table relay_results
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const ti = process.argv.indexOf('--table');
const ONLY = ti >= 0 ? process.argv[ti + 1] : null;
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const mk = () => new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
  database: 'postgres', ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 25000, statement_timeout: 600000 });

// Strip a trailing wind reading "(2.0)" / "(+0.0)", then a KNOWN timing suffix letter (a/h/c/y).
// Not "any trailing letter" — that turns the field mark "5.08m" into 5.08 seconds.
const CORE = `regexp_replace(btrim(regexp_replace(mark_raw,'\\s*\\([-+]?[0-9.]+\\)\\s*$','')),'[ahcyAHCY]$','')`;

// h:mm:ss | m:ss | ss.xx -> seconds. A bare integer deliberately yields NULL (multi-event points).
// An all-zero mark also yields NULL — "0:00.0" is a placeholder, not a world record.
const SECONDS = `
  CASE
    WHEN ${CORE} ~ '^[0:.]+$' THEN NULL
    WHEN ${CORE} ~ '^[0-9]+:[0-9]{2}:[0-9]{1,2}(\\.[0-9]+)?$' THEN
      round((split_part(${CORE},':',1)::numeric*3600
           + split_part(${CORE},':',2)::numeric*60
           + split_part(${CORE},':',3)::numeric), 3)
    WHEN ${CORE} ~ '^[0-9]+:[0-9]{2}(\\.[0-9]+)?$' THEN
      round((split_part(${CORE},':',1)::numeric*60
           + split_part(${CORE},':',2)::numeric), 3)
    WHEN ${CORE} ~ '^[0-9]+\\.[0-9]+$' THEN round(${CORE}::numeric, 3)
  END`;

// relay_results has no mark_meters column — do not reference it there.
const TABLES = [
  { name: 'results',       pk: 'result_id',       meters: true,  span: 100000 },
  { name: 'relay_results', pk: 'relay_result_id', meters: false, span: 100000 },
  { name: 'athlete_prs',   pk: 'id',              meters: true,  span: 100000 },
];

// Rows needing a write: no numeric value yet, OR an h:mm:ss row whose stored value is impossibly
// small (the split(':') truncation bug — a 1:05:37 run cannot be 65 seconds).
const target = t => `
  ((mark_seconds IS NULL${t.meters ? ' AND mark_meters IS NULL' : ''})
   OR (mark_raw ~ '^[0-9]+:[0-9]{2}:[0-9]' AND mark_seconds IS NOT NULL AND mark_seconds < 600))`;

async function run(c, t) {
  const TARGET = target(t);
  console.log(`\n=== ${t.name} ===`);

  if (!APPLY) {
    const { rows: [n] } = await c.query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE mark_seconds IS NOT NULL)::int AS repairs
      FROM ${t.name} WHERE ${TARGET} AND (${SECONDS}) IS NOT NULL`);
    const { rows: skip } = await c.query(`
      SELECT CASE WHEN ${CORE} ~ '^[0-9]+$'  THEN 'bare integer (multi-event points)'
                  WHEN ${CORE} ~ '^[0:.]+$'  THEN 'zero placeholder (kept NULL on purpose)'
                  ELSE 'status code / non-numeric' END AS kind, count(*)::int AS rows
      FROM ${t.name} WHERE ${TARGET} AND (${SECONDS}) IS NULL AND mark_raw IS NOT NULL
      GROUP BY 1 ORDER BY rows DESC`);
    console.log(`  would write: ${n.total.toLocaleString()} (corrections of a wrong value: ${n.repairs})`);
    skip.forEach(s => console.log(`  leave alone: ${s.rows.toLocaleString().padStart(9)}  ${s.kind}`));
    return 0;
  }

  const auditPath = path.join(__dirname,
    `backfill-mark-seconds-${t.name}-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
  const { rows: prior } = await c.query(`
    SELECT ${t.pk} AS id, mark_raw, mark_seconds FROM ${t.name}
    WHERE mark_raw ~ '^[0-9]+:[0-9]{2}:[0-9]' AND mark_seconds IS NOT NULL AND mark_seconds < 600`);
  fs.appendFileSync(auditPath, JSON.stringify({ table: t.name, prior_values: prior }) + '\n');
  console.log(`  audit: ${path.basename(auditPath)}  (pre-existing wrong values: ${prior.length})`);

  const { rows: [rng] } = await c.query(
    `SELECT COALESCE(min(${t.pk}),0)::bigint AS lo, COALESCE(max(${t.pk}),0)::bigint AS hi FROM ${t.name}`);
  const lo = Number(rng.lo), hi = Number(rng.hi);

  let written = 0;
  for (let start = lo; start <= hi; start += t.span) {
    const end = start + t.span - 1;
    try {
      // ids FIRST, to disk, THEN the write — a backfill you cannot target is not verifiable.
      const { rows: ids } = await c.query(
        `SELECT ${t.pk} AS id FROM ${t.name}
         WHERE ${t.pk} BETWEEN $1 AND $2 AND ${TARGET} AND (${SECONDS}) IS NOT NULL`, [start, end]);
      if (!ids.length) continue;
      fs.appendFileSync(auditPath, JSON.stringify(ids.map(r => Number(r.id))) + '\n');

      const res = await c.query(
        `UPDATE ${t.name} SET mark_seconds = (${SECONDS})
         WHERE ${t.pk} BETWEEN $1 AND $2 AND ${TARGET} AND (${SECONDS}) IS NOT NULL`, [start, end]);
      written += res.rowCount;
    } catch (e) {
      console.log(`  error @${start}: ${e.message}`);
      throw e;
    }
    await sleep(80);
  }
  console.log(`  wrote ${written.toLocaleString()}`);
  return written;
}

(async () => {
  let c = mk(); await c.connect();
  const tables = TABLES.filter(t => !ONLY || t.name === ONLY);
  if (!tables.length) { console.error(`unknown --table ${ONLY}`); process.exit(1); }

  let total = 0;
  for (const t of tables) total += await run(c, t);

  if (APPLY) {
    console.log('\n--- verification: what remains, per table ---');
    for (const t of tables) {
      const { rows: [v] } = await c.query(`
        SELECT count(*) FILTER (WHERE ${target(t)} AND (${SECONDS}) IS NOT NULL)::int AS still_unparsed,
               count(*) FILTER (WHERE mark_seconds IS NOT NULL AND mark_seconds <= 0)::int AS nonpositive,
               count(*) FILTER (WHERE mark_raw ~ '^[0-9]+:[0-9]{2}:[0-9]'
                                 AND mark_seconds IS NOT NULL AND mark_seconds < 600)::int AS still_corrupt
        FROM ${t.name}`);
      console.log(`  ${t.name.padEnd(14)} unparsed ${v.still_unparsed}  nonpositive ${v.nonpositive}  corrupt ${v.still_corrupt}`);
    }
    console.log(`\nDONE — ${total.toLocaleString()} rows written across ${tables.length} table(s)`);
  } else {
    console.log('\n(dry run — pass --apply)');
  }
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
