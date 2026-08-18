#!/usr/bin/env node
/**
 * M1 REPAIR, athletic.net arm — for meets whose broken 4x100 has NO TFRRS link.
 *
 * The TFRRS arm (repair-timeless-4x100.js) covered 35 of the 463 broken meets. 148 more have only
 * an athletic.net link. athletic.net publishes no round labels for relays, so those rows land as
 * 'Finals' (see the comment in import_meet_results.js for why that is the honest default and why
 * NULL is not acceptable -- the app groups relays by round).
 *
 * PREFER TFRRS wherever it exists. This is the fallback for meets that have no other option.
 *
 *   node repair-4x100-anet.js               # list
 *   node repair-4x100-anet.js --apply [--limit N]
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
const BRIDGE = path.join(__dirname, 'athletic-net/import_meet_results.js');
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';

(async () => {
  const c = new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false }, statement_timeout: 600000 });
  await c.connect();
  const { rows } = await c.query(`
    WITH broken AS (
      SELECT rr.meet_id FROM relay_results rr
      JOIN event_types et ON et.event_type_id = rr.event_type_id
      WHERE rr.meet_id IS NOT NULL AND et.code = '4x100m'
      GROUP BY rr.meet_id HAVING count(*) FILTER (WHERE rr.mark_raw ~ '\\d') = 0)
    SELECT m.meet_id, m.name, m.date::text
    FROM broken b JOIN meets m ON m.meet_id = b.meet_id
    WHERE m.athletic_net_results_url IS NOT NULL AND m.tfrrs_url IS NULL
    ORDER BY m.date DESC`);
  await c.end();

  const list = LIMIT ? rows.slice(0, LIMIT) : rows;
  console.log(`broken 4x100, athletic.net only: ${rows.length} | processing ${list.length}${APPLY ? '' : ' (dry run)'}\n`);
  if (!APPLY) { list.slice(0, 15).forEach(r => console.log(`  ${r.date}  #${r.meet_id}  ${r.name}`)); return; }

  // Throttle + retry. A first run failed 2 of 3, and every failure succeeded when re-run by hand
  // -- athletic.net is Cloudflare-protected and does not like back-to-back headless requests.
  // Without this the batch would have reported ~90 false failures across 137 meets.
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const runOne = (id) => execFileSync(NODE, [BRIDGE, String(id), '--relays-only', '--commit'],
    { encoding: 'utf8', timeout: 600000 });

  let ok = 0, failed = 0, relays = 0, retried = 0;
  for (const [i, m] of list.entries()) {
    process.stdout.write(`[${i + 1}/${list.length}] #${m.meet_id} ${m.name.slice(0, 42).padEnd(42)} `);
    let out = null;
    for (let attempt = 1; attempt <= 2 && out === null; attempt++) {
      try { out = runOne(m.meet_id); }
      catch (e) {
        if (attempt === 1) { retried++; await sleep(8000); }
        else { console.log(`FAILED after retry (${String(e.message).slice(0, 45)})`); failed++; }
      }
    }
    if (out !== null) {
      const n = (out.match(/(\d+) relay rows handled/) || [])[1] || '0';
      relays += parseInt(n, 10) || 0;
      console.log(`+${n} relays`); ok++;
    }
    await sleep(2500);   // be polite to Cloudflare between meets
  }
  console.log(`(${retried} needed a retry)`);
  console.log(`\nDONE — ${ok} ok, ${failed} failed, ${relays} relay rows added`);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
