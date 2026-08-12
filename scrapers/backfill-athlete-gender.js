/**
 * Maintenance backfill: set athletes.gender where missing, from reliable competition signals.
 *
 * The importers set gender from team_gender on insert, but that's null when a result has no
 * team link (common for Unattached / open-meet athletes). This sweeps up the rest using signals
 * that only fire one way, and refuses to guess when they conflict.
 *
 * Signal priority (set only when the signals agree; skip conflicts; never guess from names):
 *   1. team gender   — results.team_id  -> teams.gender
 *   2. relay gender  — relay_athletes -> relay_results.team_id -> teams.gender
 *   3. gender-specific events — 110mH/Decathlon/8k+10k XC => M ; 100mH/Pentathlon/6k XC => F
 *      (ambiguous events like 60mH, 5k XC, Heptathlon are intentionally NOT used)
 *
 *   node tools/backfill-athlete-gender.js           # dry run
 *   node tools/backfill-athlete-gender.js --apply    # write
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';

(async () => {
  const c = new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 25000, statement_timeout: 240000 });
  await c.connect();
  await c.query(`CREATE TEMP TABLE ng AS
    SELECT a.athlete_id FROM athletes a
    WHERE (a.gender IS NULL OR a.gender='')
      AND (EXISTS (SELECT 1 FROM results r WHERE r.athlete_id=a.athlete_id)
        OR EXISTS (SELECT 1 FROM relay_athletes ra WHERE ra.athlete_id=a.athlete_id))`);
  await c.query('CREATE INDEX ON ng(athlete_id); ANALYZE ng');
  const teamV = (await c.query(`SELECT r.athlete_id id, array_agg(DISTINCT t.gender) g
    FROM results r JOIN teams t ON t.team_id=r.team_id
    WHERE r.athlete_id IN (SELECT athlete_id FROM ng) AND t.gender IN ('M','F') GROUP BY r.athlete_id`)).rows;
  const relayV = (await c.query(`SELECT ra.athlete_id id, array_agg(DISTINCT t.gender) g
    FROM relay_athletes ra JOIN relay_results rr ON rr.relay_result_id=ra.relay_result_id
    JOIN teams t ON t.team_id=rr.team_id
    WHERE ra.athlete_id IN (SELECT athlete_id FROM ng) AND t.gender IN ('M','F') GROUP BY ra.athlete_id`)).rows;
  const evV = (await c.query(`SELECT r.athlete_id id,
      bool_or(et.code IN ('110m H','Decathlon','8k XC','10k XC')) male,
      bool_or(et.code IN ('100m H','Pentathlon','6k XC')) female
    FROM results r JOIN event_types et ON et.event_type_id=r.event_type_id
    WHERE r.athlete_id IN (SELECT athlete_id FROM ng) GROUP BY r.athlete_id`)).rows;

  const votes = {}; const add = (id, g) => { (votes[id] = votes[id] || new Set()).add(g); };
  teamV.forEach(r => r.g.forEach(g => add(r.id, g)));
  relayV.forEach(r => r.g.forEach(g => add(r.id, g)));
  evV.forEach(r => { if (r.male) add(r.id, 'M'); if (r.female) add(r.id, 'F'); });

  const updates = []; let conflicts = 0;
  for (const id in votes) { const s = votes[id]; if (s.size === 1) updates.push([id, [...s][0]]); else conflicts++; }
  console.log(`null-gender competitors: ${(await c.query('SELECT count(*)::int n FROM ng')).rows[0].n} | resolvable: ${updates.length} | conflicts: ${conflicts}`);
  if (APPLY && updates.length) {
    let done = 0;
    for (let i = 0; i < updates.length; i += 500) {
      const chunk = updates.slice(i, i + 500);
      const cases = chunk.map(u => `WHEN ${u[0]} THEN '${u[1]}'`).join(' ');
      const ids = chunk.map(u => u[0]).join(',');
      await c.query(`UPDATE athletes SET gender=CASE athlete_id ${cases} END, updated_at=now()
        WHERE athlete_id IN (${ids}) AND (gender IS NULL OR gender='')`);
      done += chunk.length;
    }
    console.log(`applied: ${done}`);
  } else if (!APPLY) {
    console.log('(dry run — pass --apply to write)');
  }
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
