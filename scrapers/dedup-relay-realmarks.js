#!/usr/bin/env node
/**
 * DUP-3, final pass — duplicates on REAL MARKS where the columns alone are sufficient identity.
 *
 * The lineup-keyed pass (dedup-relay-results.js) required `squad IS NOT NULL` and so skipped every
 * relay row with no recorded legs. 26,413 groups remained, blocking the unique index.
 *
 * WHY THE COLUMNS ARE ENOUGH HERE. The A/B/C/D-squad hazard -- four teams from one school sharing
 * mark='DNS' and place=NULL -- applies ONLY to status codes. Two squads cannot post an IDENTICAL
 * TIME and an IDENTICAL PLACE in the same round; that is one race recorded twice. So for
 * `mark_raw ~ '[0-9]'` the key (meet, event_type, team, place, mark, round) is safe, and status
 * codes stay excluded exactly as the unique index excludes them.
 *
 * Keeps the row with the most legs (relay_athletes CASCADES, so the fuller lineup must survive),
 * then the lowest id. Both tables backed up, legs first.
 *
 *   node dedup-relay-realmarks.js            # dry run
 *   node dedup-relay-realmarks.js --apply
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');
const APPLY = process.argv.includes('--apply');
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';
const BATCH = 2000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const DOOMED = `
WITH legs AS (
  SELECT rr.relay_result_id, rr.meet_id, rr.event_type_id, rr.team_id, rr.place, rr.mark_raw, rr.round,
         (SELECT count(*) FROM relay_athletes ra WHERE ra.relay_result_id = rr.relay_result_id) AS n_legs
  FROM relay_results rr
  WHERE rr.meet_id IS NOT NULL AND rr.team_id IS NOT NULL AND rr.mark_raw ~ '[0-9]'),
ranked AS (
  SELECT relay_result_id,
         row_number() OVER (PARTITION BY meet_id, event_type_id, team_id, place, mark_raw, round
                            ORDER BY n_legs DESC, relay_result_id ASC) AS rn,
         count(*)   OVER (PARTITION BY meet_id, event_type_id, team_id, place, mark_raw, round) AS copies
  FROM legs)
SELECT relay_result_id FROM ranked WHERE copies > 1 AND rn > 1`;

(async () => {
  let c = new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false }, statement_timeout: 900000 });
  await c.connect();
  const { rows } = await c.query(DOOMED);
  const ids = rows.map(r => r.relay_result_id);
  console.log(`duplicate relay rows on real marks: ${ids.length.toLocaleString()}`);
  if (!APPLY) { console.log('(dry run)'); await c.end(); return; }

  await c.query('CREATE TABLE IF NOT EXISTS relay_results_d3_backup  (LIKE relay_results  INCLUDING DEFAULTS)');
  await c.query('CREATE TABLE IF NOT EXISTS relay_athletes_d3_backup (LIKE relay_athletes INCLUDING DEFAULTS)');
  require('fs').writeFileSync(require('path').join(__dirname,
    `dedup-relay-realmarks-${new Date().toISOString().replace(/[:.]/g,'-')}.json`), JSON.stringify(ids));

  let legs = 0, saved = 0, del = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const ch = ids.slice(i, i + BATCH);
    legs  += (await c.query('INSERT INTO relay_athletes_d3_backup SELECT * FROM relay_athletes WHERE relay_result_id = ANY($1::int[])', [ch])).rowCount;
    saved += (await c.query('INSERT INTO relay_results_d3_backup SELECT * FROM relay_results WHERE relay_result_id = ANY($1::int[])', [ch])).rowCount;
    del   += (await c.query('DELETE FROM relay_results WHERE relay_result_id = ANY($1::int[])', [ch])).rowCount;
    await sleep(100);
    if (i % (BATCH*5) === 0 || i + BATCH >= ids.length) console.log(`  ${Math.min(i+BATCH, ids.length).toLocaleString()}/${ids.length.toLocaleString()} deleted ${del.toLocaleString()}`);
  }
  const { rows: [v] } = await c.query(`
    WITH g AS (SELECT count(*)::int n FROM relay_results
      WHERE meet_id IS NOT NULL AND team_id IS NOT NULL AND mark_raw ~ '[0-9]'
      GROUP BY meet_id, event_type_id, team_id, place, mark_raw, round HAVING count(*) > 1)
    SELECT count(*)::int groups FROM g`);
  console.log(`\nDONE — deleted ${del.toLocaleString()} (legs saved ${legs.toLocaleString()}) | violations left: ${v.groups}`);
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
