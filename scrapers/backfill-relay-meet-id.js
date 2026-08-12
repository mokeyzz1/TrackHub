#!/usr/bin/env node
/**
 * Backfill relay_results.meet_id by matching meet_name + date.
 *
 * WHY (owner-reported): meet pages showed 4x400s but almost no 4x100s. The 4x100s aren't
 * missing — 39,079 exist, but only 6% carry a meet_id, so they never appear on a meet page.
 * (4x400 is 22% linked, which is why it looked fine by comparison.) An older relay import
 * never set meet_id, exactly like the 1.64M unlinked rows previously fixed in `results`.
 *
 *   4x100m  39,079 rows -> 2,426 linked  (36,653 orphaned)
 *   4x400m 149,135 rows -> 33,189 linked (115,946 orphaned)
 *
 * METHOD: exact (meet_name, date) -> meets(name, date). A 2,000-row sample matched 97.7%.
 * Only UNAMBIGUOUS pairs are used — if two meets share a name and date we skip rather than guess.
 *
 * Safe-backfill method (weak instance): map built in Node, PK-ranged batches, throttled.
 * A single set-based UPDATE times out — don't try it. Range comes from the PK; never add
 * `WHERE meet_id IS NULL` to the min/max (unindexed -> full scan -> timeout).
 *
 *   node backfill-relay-meet-id.js            # dry run
 *   node backfill-relay-meet-id.js --apply    # write
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';
const BATCH = 20000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const key = (name, date) => `${name}|${date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10)}`;

const mk = () => new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
  database: 'postgres', ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 25000, statement_timeout: 50000 });

(async () => {
  let c = mk(); await c.connect();

  // meet lookup: (name|date) -> meet_id, unambiguous pairs only
  const meetMap = new Map();
  const dupes = new Set();
  const { rows: meets } = await c.query('SELECT meet_id, name, date FROM meets WHERE name IS NOT NULL AND date IS NOT NULL');
  for (const m of meets) {
    const k = key(m.name, m.date);
    if (meetMap.has(k)) dupes.add(k); else meetMap.set(k, m.meet_id);
  }
  dupes.forEach(k => meetMap.delete(k));           // ambiguous name+date -> never guess
  console.log(`meet map: ${meetMap.size.toLocaleString()} unambiguous name+date pairs (${dupes.size} ambiguous skipped)`);

  const { rows: [{ lo, hi }] } = await c.query('SELECT min(relay_result_id) lo, max(relay_result_id) hi FROM relay_results');
  console.log(`scanning relay_result_id ${lo}..${hi}${APPLY ? '' : '  (DRY RUN)'}\n`);

  let scanned = 0, matched = 0, updated = 0, noMatch = 0;
  for (let start = Number(lo); start <= Number(hi); start += BATCH) {
    let rows;
    try {
      ({ rows } = await c.query(
        `SELECT relay_result_id, meet_name, date FROM relay_results
         WHERE relay_result_id BETWEEN $1 AND $2 AND meet_id IS NULL
           AND meet_name IS NOT NULL AND date IS NOT NULL`, [start, start + BATCH - 1]));
    } catch (e) {
      console.log(`  reconnect @${start}: ${e.message}`);
      try { await c.end(); } catch (_) {}
      await sleep(2000); c = mk(); await c.connect(); start -= BATCH; continue;
    }
    scanned += rows.length;

    const pairs = [];
    for (const r of rows) {
      const id = meetMap.get(key(r.meet_name, r.date));
      if (id) pairs.push([r.relay_result_id, id]); else noMatch++;
    }
    matched += pairs.length;

    if (APPLY && pairs.length) {
      for (let i = 0; i < pairs.length; i += 1000) {
        const chunk = pairs.slice(i, i + 1000);
        const values = chunk.map(([rid, mid]) => `(${rid},${mid})`).join(',');
        try {
          const res = await c.query(
            `UPDATE relay_results rr SET meet_id = v.mid
             FROM (VALUES ${values}) AS v(rid, mid)
             WHERE rr.relay_result_id = v.rid AND rr.meet_id IS NULL`);
          updated += res.rowCount;
        } catch (e) {
          console.log(`  update error @${start}: ${e.message}`);
          try { await c.end(); } catch (_) {}
          await sleep(2000); c = mk(); await c.connect();
        }
      }
      await sleep(120);
    }
    if ((start - Number(lo)) % (BATCH * 10) === 0) {
      console.log(`  ..${start}  scanned ${scanned.toLocaleString()} matched ${matched.toLocaleString()} updated ${updated.toLocaleString()}`);
    }
  }

  console.log(`\nDONE — scanned ${scanned.toLocaleString()} | matched ${matched.toLocaleString()} | updated ${updated.toLocaleString()} | no meet match ${noMatch.toLocaleString()}`);
  if (!APPLY) console.log('(dry run — pass --apply to write)');
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
