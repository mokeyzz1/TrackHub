#!/usr/bin/env node
/**
 * M9 — populate `results.mark_seconds` for rows whose mark is a time but was stored only as text.
 *
 * THE FINDING. 1,301,365 rows hold a parseable time in `mark_raw` with `mark_seconds` NULL, so
 * they cannot be sorted, ranked or PR-ed. 856,765 of them were written by a single bulk import in
 * **November 2025**; every import from March 2026 onward parses correctly (0 unparsed). So the
 * CODE was already fixed and only the DATA was stale — exactly the split DEDUP_METHOD §0 warns
 * about. This script is the second line: the data repair.
 *
 * ALSO REPAIRS 6 CORRUPT ROWS. athletic.net's parser did `const [mm, ss] = clean.split(':')`,
 * which on "1:05:37.73" binds mm="1", ss="05" -> 65 seconds for a 65-MINUTE run. Those 6 rows are
 * the only ones in the DB where mark_seconds is present but wrong, and this run overwrites them.
 * The scraper-side fix is scrapers/shared/mark_parser.js.
 *
 * WHY THE ARITHMETIC IS IN SQL. 1.3M rows is far too many to round-trip through Node on this
 * instance. The CASE below is character-for-character the same logic as mark_parser.js, and both
 * were validated the same way (see VERIFICATION).
 *
 * VERIFICATION BEFORE WRITING — the expression was run against the 1,082,583 rows that ALREADY
 * had a mark_seconds. It reproduced 1,082,576 of them exactly. The 7 misses are the 6 corrupt
 * h:mm:ss rows (expression right, stored value wrong) and one 3-decimal rounding difference.
 * An expression that cannot reproduce known-good data has no business writing new data.
 *
 * DELIBERATELY NOT TOUCHED:
 *   - 15,767 bare integers on Decathlon/Heptathlon/Pentathlon rows. Those are POINTS. Writing
 *     8420 into mark_seconds would rank a decathlete as the slowest athlete in the database.
 *   - 175,611 status codes (DNS/DQ/NM/NT/...). Per OWNER_DECISIONS.md these ARE results; they
 *     just have no numeric value.
 *   - `mark_meters`. Field marks already parse; this run is times only.
 *
 * ROLLBACK. Every written id is appended to the audit file BEFORE its batch is applied
 * (docs bulk-write audit rule — a backfill that cannot be targeted afterwards cannot be verified
 * or undone). To revert:
 *     UPDATE results SET mark_seconds = NULL WHERE result_id = ANY('{...ids from audit...}');
 *   The 6 corrupt h:mm:ss rows are listed separately in the audit as `prior_values` with their
 *   old numbers, since for those NULL is not the correct restore value.
 *
 *   node backfill-mark-seconds.js            # dry run — counts and samples only
 *   node backfill-mark-seconds.js --apply
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';
const SPAN = 100000;   // result_id window per batch — PK-driven, never an unbounded scan
const sleep = ms => new Promise(r => setTimeout(r, ms));

const mk = () => new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
  database: 'postgres', ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 25000, statement_timeout: 600000 });

// Strip a trailing wind reading "(2.0)" / "(+0.0)", then a KNOWN timing suffix letter (a/h/c/y).
// Not "any trailing letter" — that turns the field mark "5.08m" into 5.08 seconds.
const CORE = `regexp_replace(btrim(regexp_replace(mark_raw,'\\s*\\([-+]?[0-9.]+\\)\\s*$','')),'[ahcyAHCY]$','')`;

// h:mm:ss | m:ss | ss.xx  -> seconds. A bare integer deliberately yields NULL (multi-event points).
const SECONDS = `
  CASE
    WHEN ${CORE} ~ '^[0-9]+:[0-9]{2}:[0-9]{1,2}(\\.[0-9]+)?$' THEN
      round((split_part(${CORE},':',1)::numeric*3600
           + split_part(${CORE},':',2)::numeric*60
           + split_part(${CORE},':',3)::numeric), 3)
    WHEN ${CORE} ~ '^[0-9]+:[0-9]{2}(\\.[0-9]+)?$' THEN
      round((split_part(${CORE},':',1)::numeric*60
           + split_part(${CORE},':',2)::numeric), 3)
    WHEN ${CORE} ~ '^[0-9]+\\.[0-9]+$' THEN round(${CORE}::numeric, 3)
  END`;

// Rows needing a write: no seconds yet, OR an h:mm:ss row whose stored value is impossibly small
// (the split(':') truncation bug — a 1:05:37 run cannot be 65 seconds).
const TARGET = `
  (mark_seconds IS NULL AND mark_meters IS NULL)
  OR (mark_raw ~ '^[0-9]+:[0-9]{2}:[0-9]' AND mark_seconds IS NOT NULL AND mark_seconds < 600)`;

(async () => {
  let c = mk(); await c.connect();
  const { rows: [rng] } = await c.query(
    'SELECT COALESCE(min(result_id),0)::bigint AS lo, COALESCE(max(result_id),0)::bigint AS hi FROM results');
  const lo = Number(rng.lo), hi = Number(rng.hi);

  if (!APPLY) {
    const { rows: [n] } = await c.query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE mark_seconds IS NOT NULL)::int AS repairs
      FROM results WHERE (${TARGET}) AND (${SECONDS}) IS NOT NULL`);
    const { rows: skip } = await c.query(`
      SELECT CASE WHEN ${CORE} ~ '^[0-9]+$' THEN 'bare integer (multi-event points)'
                  ELSE 'status code / non-numeric' END AS kind, count(*)::int AS rows
      FROM results WHERE (${TARGET}) AND (${SECONDS}) IS NULL AND mark_raw IS NOT NULL
      GROUP BY 1 ORDER BY rows DESC`);
    const { rows: sample } = await c.query(`
      SELECT mark_raw, ${SECONDS} AS secs FROM results
      WHERE (${TARGET}) AND (${SECONDS}) IS NOT NULL
      ORDER BY random() LIMIT 10`);

    console.log(`rows that would be written: ${n.total.toLocaleString()}`);
    console.log(`  of which CORRECTIONS of a wrong existing value: ${n.repairs}`);
    console.log('\nleft alone on purpose:');
    skip.forEach(s => console.log(`  ${s.rows.toLocaleString().padStart(9)}  ${s.kind}`));
    console.log('\nsample conversions:');
    sample.forEach(s => console.log(`  ${String(s.mark_raw).padEnd(18)} -> ${s.secs}`));
    console.log('\n(dry run — pass --apply)');
    await c.end(); return;
  }

  const auditPath = path.join(__dirname,
    `backfill-mark-seconds-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);

  // The 6 corrupt rows restore to a VALUE, not to NULL — capture their old numbers first.
  const { rows: prior } = await c.query(`
    SELECT result_id, mark_raw, mark_seconds FROM results
    WHERE mark_raw ~ '^[0-9]+:[0-9]{2}:[0-9]' AND mark_seconds IS NOT NULL AND mark_seconds < 600`);
  fs.appendFileSync(auditPath, JSON.stringify({ prior_values: prior }) + '\n');
  console.log(`audit: ${auditPath}`);
  console.log(`pre-existing wrong values captured: ${prior.length}`);

  let written = 0;
  for (let start = lo; start <= hi; start += SPAN) {
    const end = start + SPAN - 1;
    try {
      // ids FIRST, to disk, THEN the write — a backfill you cannot target is not verifiable.
      const { rows: ids } = await c.query(`
        SELECT result_id FROM results
        WHERE result_id BETWEEN $1 AND $2 AND (${TARGET}) AND (${SECONDS}) IS NOT NULL`,
        [start, end]);
      if (!ids.length) continue;
      fs.appendFileSync(auditPath, JSON.stringify(ids.map(r => Number(r.result_id))) + '\n');

      const res = await c.query(`
        UPDATE results SET mark_seconds = (${SECONDS})
        WHERE result_id BETWEEN $1 AND $2 AND (${TARGET}) AND (${SECONDS}) IS NOT NULL`,
        [start, end]);
      written += res.rowCount;
    } catch (e) {
      console.log(`  error @${start}: ${e.message}`);
      try { await c.end(); } catch (_) {}
      await sleep(3000); c = mk(); await c.connect();
      start -= SPAN;   // retry this window
      continue;
    }
    await sleep(80);
    const pct = (((start - lo + SPAN) / (hi - lo + 1)) * 100).toFixed(1);
    console.log(`  ${pct.padStart(5)}%  id<=${end}  written ${written.toLocaleString()}`);
  }

  const { rows: [v] } = await c.query(`
    SELECT count(*) FILTER (WHERE (${TARGET}) AND (${SECONDS}) IS NOT NULL)::int AS still_unparsed,
           count(*) FILTER (WHERE mark_raw ~ '^[0-9]+:[0-9]{2}:[0-9]'
                             AND mark_seconds IS NOT NULL AND mark_seconds < 600)::int AS still_corrupt,
           count(*) FILTER (WHERE mark_seconds IS NOT NULL AND mark_seconds <= 0)::int AS nonpositive
    FROM results`);
  console.log(`\nDONE — wrote ${written.toLocaleString()} rows`);
  console.log(`  still unparsed (should be 0):   ${v.still_unparsed}`);
  console.log(`  still corrupt  (should be 0):   ${v.still_corrupt}`);
  console.log(`  non-positive seconds (sanity):  ${v.nonpositive}`);
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
