#!/usr/bin/env node
/**
 * Delete meets confirmed as COPIES, with a hard survival gate.
 *
 * Input is a list of meet_ids that `resolve-copied-meets-by-location.js` marked COPY — its host
 * state is absent from its own schools' states. This script does NOT re-derive that judgement;
 * it only enforces the safety property before deleting:
 *
 *   **every row must survive at a meet that is not itself on the condemned list.**
 *
 * That gate is the whole point. DUP-1's copies frequently come in MUTUAL pairs (A is a full copy
 * of B and B of A). Deleting both erases the results entirely, and four earlier rules all walked
 * into some version of that. A copy whose only container is another condemned meet is SKIPPED.
 *
 * Deleted rows go whole into `results_d1_backup`, with an audit JSON of the meet ids, per
 * CLAUDE.md §7 — an id list alone cannot undo a DELETE.
 *   Rollback: INSERT INTO results SELECT * FROM results_d1_backup;
 *
 *   node apply-verified-copies.js --ids=123,456           # dry run
 *   node apply-verified-copies.js --ids=123,456 --apply
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const IDS = (process.argv.find(a => a.startsWith('--ids=')) || '').split('=')[1];
if (!IDS) { console.error('usage: --ids=<meet_id,...> [--apply]'); process.exit(1); }
const COPIES = IDS.split(',').map(Number).filter(Boolean);
const condemned = new Set(COPIES);
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';

(async () => {
  const c = new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false }, statement_timeout: 600000 });
  await c.connect();

  const ok = [];
  for (const id of COPIES) {
    const { rows: [t] } = await c.query('SELECT count(*)::int AS n FROM results WHERE meet_id = $1', [id]);
    if (!t.n) { console.log(`  --   #${id} already empty`); continue; }
    const { rows: holders } = await c.query(`
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
      GROUP BY 1,2 ORDER BY count(*) DESC LIMIT 6`, [id]);
    const survivor = holders.find(h => h.shared >= t.n && !condemned.has(h.meet_id));
    if (survivor) {
      ok.push({ id, rows: t.n, at: survivor.name, atId: survivor.meet_id });
      console.log(`  OK   #${id} (${t.n} rows) -> survives at "${survivor.name}" (#${survivor.meet_id})`);
    } else {
      console.log(`  SKIP #${id} (${t.n} rows) — no UNCONDEMNED meet holds all its rows`);
    }
  }

  console.log(`\n${ok.length}/${COPIES.length} safe to delete, ${ok.reduce((a, r) => a + r.rows, 0).toLocaleString()} rows`);
  if (!APPLY) { console.log('(dry run — pass --apply to write)'); await c.end(); return; }
  if (!ok.length) { await c.end(); return; }

  const ids = ok.map(o => o.id);
  const auditPath = require('path').join(__dirname,
    `apply-verified-copies-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  require('fs').writeFileSync(auditPath, JSON.stringify(ok, null, 2));
  console.log(`audit log: ${auditPath}`);

  const b = await c.query('INSERT INTO results_d1_backup SELECT * FROM results WHERE meet_id = ANY($1::int[])', [ids]);
  const d = await c.query('DELETE FROM results WHERE meet_id = ANY($1::int[])', [ids]);
  console.log(`backed up ${b.rowCount.toLocaleString()}, deleted ${d.rowCount.toLocaleString()}`);
  console.log('rollback: INSERT INTO results SELECT * FROM results_d1_backup;');
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
