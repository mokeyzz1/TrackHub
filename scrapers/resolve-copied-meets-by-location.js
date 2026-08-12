#!/usr/bin/env node
/**
 * DUP-1 resolver — decide which of two identical meets is REAL, using where it was held.
 *
 * The problem this solves: 50 meets sit in mutual pairs, each a full copy of the other, with
 * identical row counts and no stored link. Every structural heuristic tried failed —
 * "largest same-date meet" named a real unrelated championship as owner of Big Ten results,
 * "largest link-backed meet" named a meet containing 0 of the rows, and "keep the biggest in the
 * cluster" is a coin flip when both sides have the same count.
 *
 * THE SIGNAL (found 2026-08-10): `meets.location` holds the host city and state, and the REAL
 * meet's host state appears among its own schools' states. The copy's does not:
 *
 *   Jim Duncan Invitational    Des Moines, Iowa   schools IA/NE/SD   <- real
 *   Jim Linthicum Invitational Cupertino, Calif.  schools IA/NE/SD   <- copy
 *   Ed Jacoby Twilight         Boise, Idaho       schools ID/OR      <- real
 *   St. Lawrence Twilight      Canton, N.Y.       schools ID/OR      <- copy
 *
 * Note the earlier cluster rule picked "St. Lawrence Twilight" — wrong. This is not cosmetic.
 *
 * TFRRS writes AP-style abbreviations ("Ind.", "Calif.", "N.Y."), not postal codes, so they are
 * mapped explicitly below. A meet whose location cannot be parsed is REPORTED, never guessed.
 *
 * This only ever reports. Deletion stays in dedup-copied-meets.js behind --only, so a human
 * decides which resolved pairs get applied.
 *
 *   node resolve-copied-meets-by-location.js --since=2026-01-01
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');

const SINCE = (process.argv.find(a => a.startsWith('--since=')) || '--since=2026-01-01').split('=')[1];
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';

// AP style -> postal. TFRRS uses AP abbreviations in `location`.
const AP = {
  'ala':'AL','alaska':'AK','ariz':'AZ','ark':'AR','calif':'CA','colo':'CO','conn':'CT','del':'DE',
  'fla':'FL','ga':'GA','hawaii':'HI','idaho':'ID','ill':'IL','ind':'IN','iowa':'IA','kan':'KS',
  'ky':'KY','la':'LA','maine':'ME','md':'MD','mass':'MA','mich':'MI','minn':'MN','miss':'MS',
  'mo':'MO','mont':'MT','neb':'NE','nev':'NV','n.h':'NH','n.j':'NJ','n.m':'NM','n.y':'NY',
  'n.c':'NC','n.d':'ND','ohio':'OH','okla':'OK','ore':'OR','pa':'PA','r.i':'RI','s.c':'SC',
  's.d':'SD','tenn':'TN','texas':'TX','utah':'UT','vt':'VT','va':'VA','wash':'WA','w.va':'WV',
  'wis':'WI','wyo':'WY','d.c':'DC',
};
function stateOf(location) {
  if (!location) return null;
  const city = String(location).split('*')[0];          // "Boise, Idaho * Ed Jacoby Track"
  const part = city.split(',').pop().trim().replace(/\.$/, '').toLowerCase();
  if (/^[a-z]{2}$/.test(part)) return part.toUpperCase(); // already postal
  return AP[part] || null;
}

(async () => {
  const c = new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false }, statement_timeout: 600000 });
  await c.connect();

  // meets holding results that are fully duplicated elsewhere, with their schools' states
  const { rows } = await c.query(`
    WITH keyed AS (
      SELECT r.meet_id, m.date, r.athlete_id, r.event_type_id, r.mark_raw, r.place
      FROM results r JOIN meets m ON m.meet_id = r.meet_id
      WHERE m.date >= $1 AND r.athlete_id IS NOT NULL AND r.mark_raw IS NOT NULL),
    shared AS (
      SELECT date, athlete_id, event_type_id, mark_raw, place
      FROM keyed GROUP BY 1,2,3,4,5 HAVING count(DISTINCT meet_id) > 1),
    per_meet AS (
      SELECT k.meet_id, count(*)::int AS total_rows, count(s.date)::int AS shared_rows
      FROM keyed k LEFT JOIN shared s
        ON s.date = k.date AND s.athlete_id = k.athlete_id
       AND s.event_type_id IS NOT DISTINCT FROM k.event_type_id
       AND s.mark_raw = k.mark_raw AND s.place IS NOT DISTINCT FROM k.place
      GROUP BY 1)
    SELECT pm.meet_id, m.name, m.date::text, m.location, pm.total_rows,
           (SELECT array_agg(DISTINCT s.state) FILTER (WHERE s.state IS NOT NULL)
            FROM results r2 JOIN teams t ON t.team_id = r2.team_id
            JOIN schools s ON s.school_id = t.school_id
            WHERE r2.meet_id = pm.meet_id) AS school_states
    FROM per_meet pm JOIN meets m ON m.meet_id = pm.meet_id
    WHERE pm.shared_rows = pm.total_rows AND pm.total_rows > 0`, [SINCE]);

  console.log(`fully-duplicated meets since ${SINCE}: ${rows.length}\n`);

  let resolved = 0, unresolved = 0;
  for (const r of rows) {
    const st = stateOf(r.location);
    const states = r.school_states || [];
    if (!st) { console.log(`  ? "${r.name}" (#${r.meet_id}) — location unparsed: ${JSON.stringify(r.location)}`); unresolved++; continue; }
    if (!states.length) { console.log(`  ? "${r.name}" (#${r.meet_id}) — no school states (no team_id)`); unresolved++; continue; }
    const match = states.includes(st);
    console.log(`  ${match ? 'REAL ' : 'COPY '} "${r.name}" (#${r.meet_id}, ${r.total_rows} rows)  host=${st}  schools=${states.join('/')}`);
    resolved++;
  }
  console.log(`\nresolved ${resolved}, unresolved ${unresolved}`);
  console.log('COPY = host state absent from its own schools. Feed those ids to');
  console.log('dedup-copied-meets.js --only=<ids> --apply after eyeballing them.');
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
