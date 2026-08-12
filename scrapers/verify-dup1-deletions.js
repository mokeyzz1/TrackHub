#!/usr/bin/env node
/**
 * AUDIT the DUP-1 deletions after the fact. Read-only.
 *
 * 33 meets had their results deleted as copies. The rows are in `results_d1_backup`, so each
 * deleted meet's schools can be reconstructed and tested against its own host state — the same
 * evidence that resolved DUP-1 in the first place.
 *
 * EXPECTED: a genuine copy's host state is ABSENT from its own schools' states (the results
 * belong to a meet somewhere else). If a deleted meet's host state MATCHES its schools, it was
 * probably the real meet and the deletion was wrong — restore it from results_d1_backup.
 *
 *   node verify-dup1-deletions.js
 *
 * RESULT 2026-08-12: 33 audited, 31 clean, 2 flagged — BOTH FALSE POSITIVES.
 * "Big West" (host CA) and "Big Sky" (host OR) hold Big Ten data, and the post-expansion Big Ten
 * includes USC and UCLA (CA), Oregon and Washington (OR/WA). So the host state matched by
 * coincidence, not because the meet was real. Verified by listing the CA/OR schools in those
 * rows: Oregon, UCLA, USC.
 *
 * ⚠️ KNOWN LIMITATION: a conference with a nationwide footprint will coincidentally match many
 * host states. Treat a flag as "look at the school NAMES", not as proof of a wrong deletion.
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';
const AP = {'ala':'AL','alaska':'AK','ariz':'AZ','ark':'AR','calif':'CA','colo':'CO','conn':'CT','del':'DE',
 'fla':'FL','ga':'GA','hawaii':'HI','idaho':'ID','ill':'IL','ind':'IN','iowa':'IA','kan':'KS','ky':'KY',
 'la':'LA','maine':'ME','md':'MD','mass':'MA','mich':'MI','minn':'MN','miss':'MS','mo':'MO','mont':'MT',
 'neb':'NE','nev':'NV','n.h':'NH','n.j':'NJ','n.m':'NM','n.y':'NY','n.c':'NC','n.d':'ND','ohio':'OH',
 'okla':'OK','ore':'OR','pa':'PA','r.i':'RI','s.c':'SC','s.d':'SD','tenn':'TN','texas':'TX','utah':'UT',
 'vt':'VT','va':'VA','wash':'WA','w.va':'WV','wis':'WI','wyo':'WY','d.c':'DC'};
const stateOf = loc => { if(!loc) return null;
  const part = String(loc).split('*')[0].split(',').pop().trim().replace(/\.$/,'').toLowerCase();
  return /^[a-z]{2}$/.test(part) ? part.toUpperCase() : (AP[part] || null); };

(async () => {
  const c = new Client({ host, port:5432, user:'postgres', password: rootEnv.DB_PASSWORD,
    database:'postgres', ssl:{rejectUnauthorized:false}, statement_timeout:600000 });
  await c.connect();
  const { rows } = await c.query(`
    SELECT b.meet_id, m.name, m.location, count(*)::int AS deleted_rows,
           (array_agg(DISTINCT s.state) FILTER (WHERE s.state IS NOT NULL)) AS school_states
    FROM results_d1_backup b
    JOIN meets m ON m.meet_id = b.meet_id
    LEFT JOIN teams t ON t.team_id = b.team_id
    LEFT JOIN schools s ON s.school_id = t.school_id
    GROUP BY b.meet_id, m.name, m.location
    ORDER BY count(*) DESC`);

  let ok=0, wrong=0, unknown=0;
  for (const r of rows) {
    const st = stateOf(r.location); const states = r.school_states || [];
    if (!st || !states.length) { console.log(`  ?     "${r.name}" (#${r.meet_id}, ${r.deleted_rows}) — host=${st||'?'} schools=${states.join('/')||'none'}`); unknown++; continue; }
    if (states.includes(st)) { console.log(`  WRONG "${r.name}" (#${r.meet_id}, ${r.deleted_rows}) — host=${st} IS among its schools ${states.join('/')}`); wrong++; }
    else { console.log(`  ok    "${r.name}" (#${r.meet_id}, ${r.deleted_rows}) — host=${st} not in ${states.join('/')}`); ok++; }
  }
  console.log(`\nmeets audited: ${rows.length}`);
  console.log(`  confirmed copies (host state absent from own schools): ${ok}`);
  console.log(`  SUSPECT — host state matches own schools:              ${wrong}`);
  console.log(`  cannot tell (no location or no school states):         ${unknown}`);
  if (wrong) console.log('\nRestore a suspect meet:\n  INSERT INTO results SELECT * FROM results_d1_backup WHERE meet_id = <id>;');
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
