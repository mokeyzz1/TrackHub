#!/usr/bin/env node
/**
 * M1 REPAIR — recover 4x100 (and other short relay) results that the pre-fix parser threw away.
 *
 * THE BUG: the old relay time regex required MM:SS, so a 4x100 of "39.30" failed and fell to the
 * status fallback. 4x400 ("3:17.58") parsed fine. F7 fixed the parser 2026-08 -- but that only
 * affects FUTURE scrapes. 463 meets still hold the broken data, and 412 of them have a perfectly
 * good 4x400 at the same meet, which proves the page scraped fine and only the short relay broke.
 *
 * "Fixed the scraper" and "fixed the data" are two different things. This is the second one.
 *
 * SOURCE PREFERENCE: **TFRRS first.** athletic.net has the times but returns relays with NO round
 * label, and the app groups relays by round -- a round-less row looks fixed in the database and
 * is still wrong on screen. TFRRS returns Finals / Preliminaries / Heat N, matching the 4x400
 * already in these meets. (Verified on meet 13142: athletic.net 44 rows round=null, TFRRS 44 rows
 * correctly labelled.)
 *
 * Runs each meet through the engine's --relays-only mode, which refuses to touch existing
 * individual results.
 *
 *   node repair-timeless-4x100.js               # list what would be repaired
 *   node repair-timeless-4x100.js --apply [--limit N]
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');
const { execFileSync } = require('child_process');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const li = process.argv.indexOf('--limit');
const LIMIT = li >= 0 ? parseInt(process.argv[li + 1], 10) : 0;
const NODE = process.execPath;
const TFRRS = path.join(__dirname, 'tfrrs/meet-scraper/sync-weekend-results.js');
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';

(async () => {
  const c = new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false }, statement_timeout: 600000 });
  await c.connect();
  const { rows } = await c.query(`
    WITH broken AS (
      SELECT rr.meet_id
      FROM relay_results rr JOIN event_types et ON et.event_type_id = rr.event_type_id
      WHERE rr.meet_id IS NOT NULL AND et.code = '4x100m'
      GROUP BY rr.meet_id
      HAVING count(*) FILTER (WHERE rr.mark_raw ~ '\\d') = 0)
    SELECT m.meet_id, m.name, m.date::text
    FROM broken b JOIN meets m ON m.meet_id = b.meet_id
    WHERE m.tfrrs_url IS NOT NULL
    ORDER BY m.date DESC`);
  await c.end();

  const list = LIMIT ? rows.slice(0, LIMIT) : rows;
  console.log(`meets with a fully-timeless 4x100 AND a TFRRS link: ${rows.length}`);
  console.log(`processing: ${list.length}${APPLY ? '' : '  (dry run)'}\n`);
  if (!APPLY) { list.slice(0, 20).forEach(r => console.log(`  ${r.date}  #${r.meet_id}  ${r.name}`)); return; }

  let ok = 0, failed = 0, relays = 0;
  for (const [i, m] of list.entries()) {
    process.stdout.write(`[${i + 1}/${list.length}] #${m.meet_id} ${m.name.slice(0, 44).padEnd(44)} `);
    try {
      const out = execFileSync(NODE, [TFRRS, '--meet', String(m.meet_id), '--relays-only', '--commit'],
        { encoding: 'utf8', timeout: 300000 });
      const n = (out.match(/Relay results imported:\s*([\d,]+)/) || [])[1] || '0';
      relays += parseInt(n.replace(/,/g, ''), 10) || 0;
      console.log(`+${n} relays`); ok++;
    } catch (e) { console.log(`FAILED (${String(e.message).slice(0, 60)})`); failed++; }
  }
  console.log(`\nDONE — ${ok} ok, ${failed} failed, ${relays.toLocaleString()} relay rows added`);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
