#!/usr/bin/env node
/**
 * Resolve the last results rows that have no event_type_id.
 *
 * 463 rows (0.01% of 3.3M) carried an event name with a section/flight/division suffix the alias
 * table didn't know — "Hammer Throw Unseeded", "100 Meter Dash D1 Elite", "Pole Vault A".
 * Migration 20260810_map_remaining_event_aliases added the 19 aliases.
 *
 * WHY THIS ISN'T A PLAIN UPDATE. Setting event_type_id on these rows makes some of them collide
 * with an existing row under the `results_no_exact_duplicate` index — same athlete, meet, mark,
 * place and round, and now the same event type too. Those rows were ALWAYS duplicates; the NULL
 * event_type_id is the only thing that hid them (it also hid them from the D2 dedup, whose group
 * key treats a NULL event type as its own group). A straight UPDATE fails with a unique
 * violation, which is the guard doing exactly what it was added for.
 *
 * So each row is handled individually:
 *   - a twin already exists with the resolved event_type_id  -> DELETE this row (back it up)
 *   - otherwise                                              -> UPDATE it
 *
 * Deleted rows go to results_d2_backup, same as the rest of the D2 work.
 *   Rollback: INSERT INTO results SELECT * FROM results_d2_backup;
 *
 *   node backfill-null-event-types.js            # dry run
 *   node backfill-null-event-types.js --apply
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';

const mk = () => new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
  database: 'postgres', ssl: { rejectUnauthorized: false }, statement_timeout: 300000 });

(async () => {
  const c = mk(); await c.connect();

  // A correlated EXISTS over 3.3M rows times out on this instance. Pull the (few hundred) NULL
  // rows plus every row belonging to those same athletes, and match in memory instead.
  const { rows } = await c.query(`
    SELECT r.result_id, r.athlete_id, r.meet_id, r.event_name, r.mark_raw, r.place, r.round,
           ea.event_type_id AS resolved
    FROM results r
    JOIN event_aliases ea ON ea.raw_name = r.event_name
    WHERE r.event_type_id IS NULL`);

  const athleteIds = [...new Set(rows.map(r => r.athlete_id).filter(x => x != null))];
  const { rows: peers } = await c.query(
    `SELECT result_id, athlete_id, meet_id, event_type_id, mark_raw, place, round
     FROM results WHERE athlete_id = ANY($1::int[]) AND event_type_id IS NOT NULL`, [athleteIds]);

  const key = r => [r.athlete_id, r.meet_id, r.event_type_id ?? r.resolved,
                    r.mark_raw, r.place, r.round].join('');
  const taken = new Set(peers.map(key));

  // only a row that is meet-linked can collide (the index is partial on meet_id IS NOT NULL)
  const dupes = rows.filter(r => r.meet_id != null && taken.has(key({ ...r, event_type_id: r.resolved })));
  const fixable = rows.filter(r => !dupes.includes(r));
  console.log(`rows with no event_type_id that an alias now resolves: ${rows.length}`);
  console.log(`  -> already duplicated by a resolved twin (delete): ${dupes.length}`);
  console.log(`  -> unique, just needs the id set (update):         ${fixable.length}`);

  if (!APPLY) { console.log('\n(dry run — pass --apply to write)'); await c.end(); return; }

  if (dupes.length) {
    const ids = dupes.map(r => r.result_id);
    require('fs').writeFileSync(require('path').join(__dirname,
      `backfill-null-event-types-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify(ids));
    await c.query('INSERT INTO results_d2_backup SELECT * FROM results WHERE result_id = ANY($1::int[])', [ids]);
    const d = await c.query('DELETE FROM results WHERE result_id = ANY($1::int[])', [ids]);
    console.log(`deleted ${d.rowCount} hidden duplicates (backed up first)`);
  }
  if (fixable.length) {
    const u = await c.query(`UPDATE results r SET event_type_id = ea.event_type_id
      FROM event_aliases ea WHERE ea.raw_name = r.event_name AND r.event_type_id IS NULL`);
    console.log(`resolved ${u.rowCount} rows`);
  }

  const { rows: [v] } = await c.query(
    'SELECT count(*)::int AS still_null FROM results WHERE event_type_id IS NULL');
  console.log(`\nremaining results with no event_type_id: ${v.still_null}`);
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
