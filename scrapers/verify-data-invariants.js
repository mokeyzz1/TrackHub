#!/usr/bin/env node
/**
 * STANDING DATA INVARIANTS — things that must always be true. Read-only.
 *
 * WHY THIS EXISTS. The 2026-08 duplicate purge removed ~490k rows, and every check on it was
 * written by the same mind that wrote the bugs. That is the structural weakness: self-review
 * cannot catch a blind spot you don't know you have. The industry answer (dbt tests, Great
 * Expectations) is to stop relying on judgement and assert invariants that run every time.
 *
 * These are deliberately INDEPENDENT of the cleanup logic. #1 in particular knows nothing about
 * how DUP-1 decided which meet was a copy — it just asserts a fact about physical reality, so it
 * can catch a DUP-1 mistake that the DUP-1 audit (which reuses the location signal) cannot.
 *
 * Run after any bulk change, and before any release:
 *   node verify-data-invariants.js
 * Exit code 1 if any invariant fails.
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};
const { Client } = require('pg');
const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';

const CHECKS = [
  {
    name: 'athlete at two different meets on the same day',
    why: 'A STRONG SMELL, NOT A PROOF — an athlete can occasionally compete twice in a day, so ' +
         'this is not literally impossible. Independent of the DUP-1 cleanup logic: it does not ' +
         'reuse the host-location signal DUP-1 was decided with, so it can catch what that audit ' +
         'structurally cannot. Baseline 2026-08-12 = 13,504 (2017-09-15..2026-05-09). Of the ' +
         'underlying performances, 14,666 have the SAME mark at both meets, i.e. genuine ' +
         'cross-meet copies. THIS NUMBER SHOULD ONLY EVER GO DOWN.',
    tolerate: 13504,
    sql: `SELECT count(*)::int AS n FROM (
            SELECT athlete_id, date FROM results
            WHERE meet_id IS NOT NULL AND athlete_id IS NOT NULL AND date IS NOT NULL
            GROUP BY 1,2 HAVING count(DISTINCT meet_id) > 1) t`,
  },
  {
    name: 'every result resolves to a canonical event',
    why: 'event_type_id NULL means the row cannot be grouped, ranked or PR-ed correctly.',
    tolerate: 0,
    sql: `SELECT count(*)::int AS n FROM results WHERE event_type_id IS NULL`,
  },
  {
    name: 'no exact duplicate performance on a meet-linked result',
    why: 'enforced by results_no_exact_duplicate; this catches the index being dropped.',
    tolerate: 185,   // the deliberately-kept Preliminaries+Finals pairs
    sql: `SELECT COALESCE(sum(n-1),0)::int AS n FROM (
            SELECT count(*)::int AS n FROM results
            WHERE meet_id IS NOT NULL AND athlete_id IS NOT NULL AND mark_raw IS NOT NULL
            GROUP BY athlete_id, meet_id, event_type_id, mark_raw, place, round
            HAVING count(*) > 1) t`,
  },
  {
    name: 'no duplicate relay (same meet, event, team, place, mark, round AND lineup)',
    why: 'DUP-3. The lineup MUST be in the key — without it, A/B/C/D squads that all DNS look ' +
         'identical and a dedup would delete real teams.',
    tolerate: 0,
    sql: `SELECT COALESCE(sum(n-1),0)::int AS n FROM (
            SELECT count(*)::int AS n FROM (
              SELECT rr.meet_id, rr.event_type_id, rr.team_id, rr.place, rr.mark_raw, rr.round,
                (SELECT string_agg(DISTINCT COALESCE(ra.athlete_id::text, ra.athlete_name), ','
                        ORDER BY COALESCE(ra.athlete_id::text, ra.athlete_name))
                 FROM relay_athletes ra WHERE ra.relay_result_id = rr.relay_result_id) AS squad
              FROM relay_results rr
              WHERE rr.meet_id IS NOT NULL AND rr.team_id IS NOT NULL AND rr.mark_raw IS NOT NULL) s
            WHERE squad IS NOT NULL
            GROUP BY meet_id, event_type_id, team_id, place, mark_raw, round, squad
            HAVING count(*) > 1) t`,
  },
  {
    name: 'no malformed doubled mark codes',
    why: 'M8. The app renders mark_raw verbatim, so "NM  NM" reaches the user.',
    tolerate: 0,
    sql: `SELECT count(*)::int AS n FROM results WHERE mark_raw ~ '^(NM|NH|ND|DNS|DNF|DQ|NT)\\s+\\1$'`,
  },
  {
    name: 'no meet holds results that are 100% duplicated at another meet',
    why: 'DUP-1 remainder for 2026: mutual pairs and the cases location could not resolve. ' +
         'NOTE this only finds meets that are 100%% copies — a PARTIALLY contaminated meet has ' +
         'unique rows and is invisible here. Use the same-day check above for those. ' +
         'Baseline 2026-08-12 = 39.',
    tolerate: 39,
    sql: `WITH keyed AS (
            SELECT r.meet_id, m.date, r.athlete_id, r.event_type_id, r.mark_raw, r.place
            FROM results r JOIN meets m ON m.meet_id = r.meet_id
            WHERE m.date >= '2026-01-01' AND r.athlete_id IS NOT NULL AND r.mark_raw IS NOT NULL),
          shared AS (
            SELECT date, athlete_id, event_type_id, mark_raw, place FROM keyed
            GROUP BY 1,2,3,4,5 HAVING count(DISTINCT meet_id) > 1),
          per_meet AS (
            SELECT k.meet_id, count(*)::int AS total, count(s.date)::int AS shared
            FROM keyed k LEFT JOIN shared s
              ON s.date=k.date AND s.athlete_id=k.athlete_id
             AND s.event_type_id IS NOT DISTINCT FROM k.event_type_id
             AND s.mark_raw=k.mark_raw AND s.place IS NOT DISTINCT FROM k.place
            GROUP BY 1)
          SELECT count(*)::int AS n FROM per_meet WHERE total > 0 AND shared = total`,
  },
  {
    name: 'no result dated more than 7 days from its own meet date',
    why: 'a result far from its meet date usually means it was attached to the wrong meet. ' +
         'Baseline 2026-08-12 = 0, which is real evidence the DUP-1 deletions did not scramble ' +
         'dates.',
    tolerate: 0,
    sql: `SELECT count(*)::int AS n FROM results r JOIN meets m ON m.meet_id = r.meet_id
          WHERE r.date IS NOT NULL AND m.date IS NOT NULL
            AND abs(r.date - m.date) > 7`,
  },
];

(async () => {
  const c = new Client({ host, port: 5432, user: 'postgres', password: rootEnv.DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false }, statement_timeout: 900000 });
  await c.connect();
  let failed = 0;
  for (const chk of CHECKS) {
    let n;
    try { ({ rows: [{ n }] } = await c.query(chk.sql)); }
    catch (e) { console.log(`  ERROR  ${chk.name}\n         ${e.message}`); failed++; continue; }
    const baseline = chk.tolerate;
    const status = baseline === null ? 'INFO ' : (n <= baseline ? 'PASS ' : 'FAIL ');
    if (status === 'FAIL ') failed++;
    console.log(`  ${status} ${chk.name}: ${Number(n).toLocaleString()}` +
                (baseline !== null && baseline > 0 ? ` (allowed ${baseline})` : ''));
    if (status !== 'PASS ') console.log(`         ${chk.why}`);
  }
  console.log(failed ? `\n${failed} invariant(s) failed` : '\nall invariants pass');
  await c.end();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
