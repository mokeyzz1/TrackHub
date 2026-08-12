#!/usr/bin/env node
/**
 * M8 — repair doubled mark codes: "NM  NM" -> "NM", "NH  NH" -> "NH".
 *
 * 21,692 rows (11,452 + 10,240) store a field-event status code concatenated with itself and two
 * spaces. Only HJ / LJ / PV / SP / TJ are affected, so a scraper joined a cell with itself. The
 * app renders mark_raw verbatim, so users literally see "NM  NM" on an athlete's page.
 *
 * These are RESULTS, not junk (docs/MARK_CODES.md): NM = No Mark, NH = No Height. The row stays;
 * only the malformed text is repaired.
 *
 * ⚠️ NOT A PLAIN UPDATE. `mark_raw` is part of `results_no_exact_duplicate`, so collapsing the
 * value can make a row collide with a twin it was previously distinct from. Those rows were
 * always duplicates — the doubling is the only thing that hid them — so the collider is DELETED
 * (backed up) rather than updated, exactly as backfill-null-event-types.js does.
 *
 *   node fix-doubled-mark-codes.js            # dry run
 *   node fix-doubled-mark-codes.js --apply
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');
const APPLY = process.argv.includes('--apply');
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';

(async () => {
  const c = new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false }, statement_timeout: 900000 });
  await c.connect();

  const { rows } = await c.query(`
    SELECT result_id, athlete_id, meet_id, event_type_id, place, round,
           CASE WHEN mark_raw = 'NM  NM' THEN 'NM' ELSE 'NH' END AS fixed
    FROM results WHERE mark_raw IN ('NM  NM','NH  NH')`);
  console.log(`doubled rows: ${rows.length.toLocaleString()}`);

  // collision test only matters for meet-linked rows (the index is partial)
  const linked = rows.filter(r => r.meet_id !== null);
  const key = r => [r.athlete_id, r.meet_id, r.event_type_id, r.fixed ?? r.mark_raw, r.place, r.round].join('|');
  const meetIds = [...new Set(linked.map(r => r.meet_id))];
  const existing = new Set();
  for (let i = 0; i < meetIds.length; i += 500) {
    const { rows: peers } = await c.query(
      `SELECT athlete_id, meet_id, event_type_id, mark_raw, place, round FROM results
       WHERE meet_id = ANY($1::int[]) AND mark_raw IN ('NM','NH')`, [meetIds.slice(i, i + 500)]);
    peers.forEach(p => existing.add([p.athlete_id, p.meet_id, p.event_type_id, p.mark_raw, p.place, p.round].join('|')));
  }
  const collide = linked.filter(r => existing.has(key(r)));
  const safe = rows.filter(r => !collide.includes(r));
  console.log(`  -> would collide with an existing NM/NH row (delete): ${collide.length.toLocaleString()}`);
  console.log(`  -> safe to repair in place (update):                  ${safe.length.toLocaleString()}`);

  if (!APPLY) { console.log('\n(dry run — pass --apply to write)'); await c.end(); return; }

  require('fs').writeFileSync(require('path').join(__dirname,
    `fix-doubled-mark-codes-${new Date().toISOString().replace(/[:.]/g,'-')}.json`),
    JSON.stringify({ deleted: collide.map(r => r.result_id), updated: safe.map(r => r.result_id) }, null, 2));

  if (collide.length) {
    const ids = collide.map(r => r.result_id);
    await c.query('INSERT INTO results_d2_backup SELECT * FROM results WHERE result_id = ANY($1::int[])', [ids]);
    const d = await c.query('DELETE FROM results WHERE result_id = ANY($1::int[])', [ids]);
    console.log(`deleted ${d.rowCount} hidden duplicates (backed up)`);
  }
  let upd = 0;
  for (let i = 0; i < safe.length; i += 2000) {
    const ids = safe.slice(i, i + 2000).map(r => r.result_id);
    upd += (await c.query(
      `UPDATE results SET mark_raw = CASE WHEN mark_raw = 'NM  NM' THEN 'NM' ELSE 'NH' END
       WHERE result_id = ANY($1::int[])`, [ids])).rowCount;
  }
  console.log(`repaired ${upd.toLocaleString()} rows`);
  const { rows: [v] } = await c.query(`SELECT count(*)::int AS left FROM results WHERE mark_raw IN ('NM  NM','NH  NH')`);
  console.log(`remaining doubled: ${v.left}`);
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
