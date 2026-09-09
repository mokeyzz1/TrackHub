#!/usr/bin/env node
/**
 * Classify the duplicate groups that remain after the cross-source cleanup, ROUND-INSENSITIVELY.
 *
 * WHY ROUND-INSENSITIVE. Both unique indexes on `results` include `round`, so anything that
 * differs only by round label is invisible to them by construction. That is deliberate for real
 * prelim/final pairs — and it is exactly the hole the athletic.net rows came through, because
 * athletic.net supplies no round label at all (NULL vs 'Finals' reads as two performances).
 * So the guards cannot answer "is this a duplicate?"; only a round-insensitive scan can.
 *
 * The four outcomes mean different things, and only two are bugs:
 *   diff round AND place  -> a real prelim then final. Legitimate, leave alone.
 *   diff round, same place -> the deliberately-kept ambiguous pairs (185 at last count).
 *   same round, diff place -> SUSPECT: one race recorded twice with disagreeing places.
 *   identical round+place  -> a TRUE duplicate that slipped past both indexes.
 *
 *   node classify-remaining-dupes.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';

const SQL = `
WITH k AS (
  SELECT athlete_id, meet_id, event_type_id,
         lower(regexp_replace(mark_raw,'[ah]$','')) AS nm,
         count(*)::int AS copies,
         count(DISTINCT COALESCE(round,'~NULL~'))::int AS dr,
         count(DISTINCT COALESCE(place,-1))::int       AS dp
  FROM results
  WHERE meet_id IS NOT NULL AND athlete_id IS NOT NULL AND mark_raw ~ '[0-9]'
  GROUP BY 1,2,3,4 HAVING count(*) > 1)
SELECT CASE WHEN dr>1 AND dp>1 THEN 'diff round AND place  -> real prelim/final (legitimate)'
            WHEN dr>1 AND dp=1 THEN 'diff round, same place -> deliberately kept (185-type)'
            WHEN dr=1 AND dp>1 THEN 'same round, diff place -> SUSPECT'
            ELSE                    'identical round+place  -> TRUE DUPLICATE' END AS kind,
       count(*)::int AS groups, sum(copies-1)::int AS extra_rows
FROM k GROUP BY 1 ORDER BY groups DESC`;

const SAMPLE = `
WITH k AS (
  SELECT athlete_id, meet_id, event_type_id,
         lower(regexp_replace(mark_raw,'[ah]$','')) AS nm,
         count(*)::int AS copies,
         count(DISTINCT COALESCE(round,'~NULL~'))::int AS dr,
         count(DISTINCT COALESCE(place,-1))::int       AS dp
  FROM results
  WHERE meet_id IS NOT NULL AND athlete_id IS NOT NULL AND mark_raw ~ '[0-9]'
  GROUP BY 1,2,3,4 HAVING count(*) > 1)
SELECT k.kindlabel, r.result_id, r.athlete_id, r.meet_name, r.event_name, r.mark_raw, r.place, r.round
FROM (SELECT *, CASE WHEN dr=1 AND dp>1 THEN 'SUSPECT'
                     WHEN dr=1 AND dp=1 THEN 'TRUE_DUP' END AS kindlabel FROM k
      WHERE dr=1) k
JOIN results r ON r.athlete_id=k.athlete_id AND r.meet_id=k.meet_id
 AND r.event_type_id IS NOT DISTINCT FROM k.event_type_id
 AND lower(regexp_replace(r.mark_raw,'[ah]$',''))=k.nm
ORDER BY k.kindlabel, r.athlete_id, r.result_id
LIMIT 24`;

(async () => {
  const c = new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false }, statement_timeout: 900000 });
  await c.connect();
  const { rows } = await c.query(SQL);
  rows.forEach(r => console.log(
    `  ${String(r.groups).padStart(6)} groups  ${String(r.extra_rows).padStart(6)} extra   ${r.kind}`));
  console.log('\nsamples of the two bug categories:');
  const { rows: s } = await c.query(SAMPLE);
  s.forEach(r => console.log(
    `  [${r.kindlabel}] #${r.result_id} ath:${r.athlete_id} ${r.event_name} ${r.mark_raw} pl:${r.place} [${r.round}] @ ${String(r.meet_name).slice(0,40)}`));
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
