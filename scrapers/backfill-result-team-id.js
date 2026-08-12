#!/usr/bin/env node
/**
 * Backfill results.team_id from roster history (athlete_team_seasons).
 *
 * WHY: 499k results (13.5%) have no team_id, so we can't tell which school an athlete repped at
 * a given meet. That gap feeds two visible problems: transferred athletes showing the wrong
 * school, and unattached-vs-college records for the same person looking like two athletes.
 *
 * METHOD: an athlete's team for a season is known from `athlete_team_seasons`. Map each result's
 * date -> season code (a track season starts in August: Aug 2025..Jul 2026 = '2025-2026') and
 * assign that season's team. Only uses UNAMBIGUOUS athlete-season pairs (exactly one team);
 * mid-year transfers (409 pairs) are skipped rather than guessed.
 *
 * Follows the safe-backfill method (this Supabase instance is weak/write-slow): the map is built
 * in Node, updates are PK-ranged small batches with a hard statement_timeout and throttling.
 * A single set-based UPDATE times out — don't try it.
 *
 *   node backfill-result-team-id.js            # dry run (counts only)
 *   node backfill-result-team-id.js --apply    # write
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';
const BATCH = 20000;          // result_id span per batch
const sleep = ms => new Promise(r => setTimeout(r, ms));

const seasonOf = d => {
  const dt = new Date(d);
  const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1;
  return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
};

function mk() {
  return new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 25000, statement_timeout: 50000 });
}

(async () => {
  let c = mk(); await c.connect();

  // 1. roster map: athlete|season -> team (unambiguous pairs only)
  const roster = new Map();
  const rs = await c.query(`
    SELECT athlete_id, season_code, min(team_id) AS team_id
    FROM athlete_team_seasons
    GROUP BY athlete_id, season_code
    HAVING count(DISTINCT team_id) = 1`);
  rs.rows.forEach(r => roster.set(`${r.athlete_id}|${r.season_code}`, r.team_id));
  console.log(`roster map: ${roster.size.toLocaleString()} unambiguous athlete-season pairs`);

  // Range comes from the PK (index-only scan). Do NOT add `WHERE team_id IS NULL` here —
  // team_id is unindexed, so that turns this into a full scan and times out.
  const { rows: [{ lo, hi }] } = await c.query(
    `SELECT min(result_id) lo, max(result_id) hi FROM results`);
  if (lo == null) { console.log('nothing to do'); await c.end(); return; }
  console.log(`scanning result_id ${lo}..${hi}${APPLY ? '' : '  (DRY RUN)'}\n`);

  let scanned = 0, matched = 0, updated = 0;
  for (let start = Number(lo); start <= Number(hi); start += BATCH) {
    const end = start + BATCH - 1;
    let rows;
    try {
      ({ rows } = await c.query(
        `SELECT result_id, athlete_id, date FROM results
         WHERE result_id BETWEEN $1 AND $2 AND team_id IS NULL AND date IS NOT NULL`, [start, end]));
    } catch (e) {
      console.log(`  reconnect @${start}: ${e.message}`);
      try { await c.end(); } catch (_) {}
      await sleep(2000); c = mk(); await c.connect();
      start -= BATCH; continue;              // retry this window
    }
    scanned += rows.length;

    const pairs = [];
    for (const r of rows) {
      const t = roster.get(`${r.athlete_id}|${seasonOf(r.date)}`);
      if (t) pairs.push([r.result_id, t]);
    }
    matched += pairs.length;

    if (APPLY && pairs.length) {
      for (let i = 0; i < pairs.length; i += 1000) {
        const chunk = pairs.slice(i, i + 1000);
        const values = chunk.map(([rid, tid]) => `(${rid},${tid})`).join(',');
        try {
          const res = await c.query(
            `UPDATE results r SET team_id = v.tid
             FROM (VALUES ${values}) AS v(rid, tid)
             WHERE r.result_id = v.rid AND r.team_id IS NULL`);
          updated += res.rowCount;
        } catch (e) {
          console.log(`  update error @${start}: ${e.message}`);
          try { await c.end(); } catch (_) {}
          await sleep(2000); c = mk(); await c.connect();
        }
      }
      await sleep(120);                       // throttle the weak instance
    }

    if ((start - Number(lo)) % (BATCH * 20) === 0) {
      console.log(`  ..${start}  scanned ${scanned.toLocaleString()} matched ${matched.toLocaleString()} updated ${updated.toLocaleString()}`);
    }
  }

  console.log(`\nDONE — scanned ${scanned.toLocaleString()} | matched ${matched.toLocaleString()} | updated ${updated.toLocaleString()}`);
  if (!APPLY) console.log('(dry run — pass --apply to write)');
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
