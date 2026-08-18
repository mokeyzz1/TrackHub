#!/usr/bin/env node
/**
 * DUP-3 — remove duplicate relay rows.
 *
 * 29,060 groups / 29,184 extra rows share (meet, event_type, team, place, mark, round). Same
 * squad, same meet, same event, same time, same placing, same round — one performance stored
 * more than once. Pre-existing; not from the athletic.net import, which was dup-guarded.
 *
 * ⚠️ THE CASCADE IS THE DANGER HERE, and it is why this is not a copy of the DUP-2 script.
 * `relay_athletes.relay_result_id` is ON DELETE CASCADE, so deleting a relay row silently takes
 * its leg athletes with it. Two consequences:
 *
 *   1. **The keep-rule must prefer the row with the MOST legs.** Measured: 15,694 of the 29,060
 *      groups have copies with DIFFERENT leg counts, so picking arbitrarily would throw away
 *      lineups. (Only 5 groups have a copy with zero legs, but the general case is real.)
 *   2. **The backup must capture relay_athletes BEFORE the parent goes.** Backing up only
 *      relay_results would make the deletion irreversible in practice — the legs would be gone
 *      with no record. Both tables are backed up, legs first.
 *
 * Relays legitimately re-run (prelim then final), but those have different marks or places, so
 * requiring an identical mark AND place AND round cannot merge two real races — the same
 * reasoning that made DUP-2 safe.
 *
 *   Rollback (order matters — parents before children):
 *     INSERT INTO relay_results  SELECT * FROM relay_results_d3_backup;
 *     INSERT INTO relay_athletes SELECT * FROM relay_athletes_d3_backup;
 *
 *   node dedup-relay-results.js            # dry run
 *   node dedup-relay-results.js --apply
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';
const BATCH = 2000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const mk = () => new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
  database: 'postgres', ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 25000, statement_timeout: 600000 });

// ⚠️ THE KEY — every clause here was learned by getting it wrong first.
//
// LINEUP, so A/B/C/D squads survive. A school enters multiple relay teams; when they all DNS they
// share mark='DNS' and place=NULL and are identical on every column. Deduping without the lineup
// would have deleted 29,184 rows, and 93% of the 37,561 cascading legs named an athlete absent
// from the surviving row -- erasing real races, not duplicates.
//
// LAST NAMES ONLY in the lineup signature. TFRRS writes the heat view as
// "Grant, Cleveland, Jefferson, Wilson" and the prelim view as "Cody Grant, Cameron Cleveland,
// Phillip Jefferson, Rylan Wilson" -- same four people, two strings. A full-name signature made
// the first DUP-3 pass find only 674 of ~13,700 real duplicates.
//
// NORMALISED MARK, because athletic.net writes 10.35a where TFRRS writes 10.35.
//
// ACROSS ROUND LABELS, because "Heat N" and "Preliminaries" are the SAME round (owner) and in a
// timed final the heat IS the final. Verified safe: 0 groups hold both a Finals and a
// Preliminaries row at the same mark, so no genuine prelim->final pair can be merged.
//
// Keeps the most authoritative label: Finals > Preliminaries > Heat N, then the row with the most
// legs, then the lowest id.
const LAST = `lower(split_part(btrim(ra.athlete_name),' ', array_length(string_to_array(btrim(ra.athlete_name),' '),1)))`;
const DOOMED_SQL = `
WITH sig AS (
  SELECT rr.relay_result_id, rr.meet_id, rr.event_type_id, rr.team_id, rr.place, rr.round,
         lower(regexp_replace(rr.mark_raw,'[ah]$','')) AS nmark,
         (SELECT string_agg(x, ',' ORDER BY x) FROM (
            SELECT DISTINCT ${LAST} AS x FROM relay_athletes ra
            WHERE ra.relay_result_id = rr.relay_result_id) t) AS squad,
         (SELECT count(*) FROM relay_athletes ra2 WHERE ra2.relay_result_id = rr.relay_result_id) AS n_legs
  FROM relay_results rr
  WHERE rr.meet_id IS NOT NULL AND rr.team_id IS NOT NULL AND rr.mark_raw IS NOT NULL),
ranked AS (
  SELECT relay_result_id,
         row_number() OVER (
           PARTITION BY meet_id, event_type_id, team_id, place, nmark, squad
           ORDER BY CASE round WHEN 'Finals' THEN 3 WHEN 'Preliminaries' THEN 2
                               WHEN NULL THEN 0 ELSE 1 END DESC,
                    n_legs DESC, relay_result_id ASC) AS rn,
         count(*) OVER (PARTITION BY meet_id, event_type_id, team_id, place, nmark, squad) AS copies
  FROM sig
  WHERE squad IS NOT NULL)   -- no lineup, no proof it is the same squad: leave it alone
SELECT relay_result_id FROM ranked WHERE copies > 1 AND rn > 1`;

(async () => {
  let c = mk(); await c.connect();

  if (!APPLY) {
    const { rows: [n] } = await c.query(`SELECT count(*)::int AS doomed FROM (${DOOMED_SQL}) d`);
    const { rows: [l] } = await c.query(
      `SELECT count(*)::int AS legs FROM relay_athletes WHERE relay_result_id IN (${DOOMED_SQL})`);
    console.log(`relay rows that would be deleted: ${n.doomed.toLocaleString()}`);
    console.log(`leg rows cascading with them:     ${l.legs.toLocaleString()}`);

    const { rows: sample } = await c.query(`
      WITH d AS (${DOOMED_SQL})
      SELECT rr.relay_result_id, rr.meet_name, rr.event_name, rr.mark_raw, rr.place, rr.round,
             (SELECT count(*) FROM relay_athletes ra WHERE ra.relay_result_id = rr.relay_result_id)::int AS legs
      FROM relay_results rr JOIN d ON d.relay_result_id = rr.relay_result_id LIMIT 6`);
    console.log('\nsample of rows that would go:');
    sample.forEach(s => console.log(`  #${s.relay_result_id} ${s.event_name} ${s.mark_raw} pl:${s.place} [${s.round}] ${s.legs} legs @ ${s.meet_name}`));
    console.log('\n(dry run — pass --apply to back up and delete)');
    await c.end(); return;
  }

  await c.query('CREATE TABLE IF NOT EXISTS relay_results_d3_backup  (LIKE relay_results  INCLUDING DEFAULTS)');
  await c.query('CREATE TABLE IF NOT EXISTS relay_athletes_d3_backup (LIKE relay_athletes INCLUDING DEFAULTS)');

  const { rows: doomed } = await c.query(DOOMED_SQL);
  const ids = doomed.map(r => r.relay_result_id);
  console.log(`doomed relay rows: ${ids.length.toLocaleString()}`);

  const auditPath = require('path').join(__dirname,
    `dedup-relay-results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  require('fs').writeFileSync(auditPath, JSON.stringify(ids));
  console.log(`audit log: ${auditPath}`);

  let legsSaved = 0, saved = 0, deleted = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    try {
      // legs FIRST — the cascade destroys them the moment the parent goes
      legsSaved += (await c.query(
        'INSERT INTO relay_athletes_d3_backup SELECT * FROM relay_athletes WHERE relay_result_id = ANY($1::int[])', [chunk])).rowCount;
      saved += (await c.query(
        'INSERT INTO relay_results_d3_backup SELECT * FROM relay_results WHERE relay_result_id = ANY($1::int[])', [chunk])).rowCount;
      deleted += (await c.query(
        'DELETE FROM relay_results WHERE relay_result_id = ANY($1::int[])', [chunk])).rowCount;
    } catch (e) {
      console.log(`  error @${i}: ${e.message}`);
      try { await c.end(); } catch (_) {}
      await sleep(3000); c = mk(); await c.connect(); continue;
    }
    await sleep(120);
    if (i % (BATCH * 5) === 0 || i + BATCH >= ids.length)
      console.log(`  ${Math.min(i + BATCH, ids.length).toLocaleString()}/${ids.length.toLocaleString()}  deleted ${deleted.toLocaleString()} (legs saved ${legsSaved.toLocaleString()})`);
  }

  // Verify on the CORRECT key (lineup included). Measuring on the column-only key here would
  // report ~28,400 "remaining duplicates" that are really legitimate A/B/C/D squads sharing a
  // DNS and a null place -- the exact misreading that made DUP-3 look like 43,037 rows.
  const { rows: [v] } = await c.query(`
    WITH sig AS (
      SELECT rr.relay_result_id, rr.meet_id, rr.event_type_id, rr.team_id, rr.place, rr.mark_raw, rr.round,
             (SELECT string_agg(DISTINCT COALESCE(ra.athlete_id::text, ra.athlete_name), ','
                                ORDER BY COALESCE(ra.athlete_id::text, ra.athlete_name))
              FROM relay_athletes ra WHERE ra.relay_result_id = rr.relay_result_id) AS squad
      FROM relay_results rr
      WHERE rr.meet_id IS NOT NULL AND rr.team_id IS NOT NULL AND rr.mark_raw IS NOT NULL),
    g AS (
      SELECT count(*)::int AS n FROM sig WHERE squad IS NOT NULL
      GROUP BY meet_id, event_type_id, team_id, place, mark_raw, round, squad HAVING count(*) > 1)
    SELECT count(*)::int AS groups_left, COALESCE(sum(n-1),0)::int AS extra_left FROM g`);
  console.log(`\nDONE — relays backed up ${saved.toLocaleString()}, legs backed up ${legsSaved.toLocaleString()}, deleted ${deleted.toLocaleString()}`);
  console.log(`remaining duplicate groups: ${v.groups_left.toLocaleString()} (${v.extra_left.toLocaleString()} extra rows)`);
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
