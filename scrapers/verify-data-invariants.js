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
    name: 'athlete at two meets on the same day IN DIFFERENT STATES',
    why: 'OWNER, 2026-08-12: competing at two meets on one day is NORMAL when they are close by ' +
         '-- Texas Relays and the Bobcat Invitational are ~30 miles apart and athletes do both. ' +
         'A multi-day meet also spreads its rows across a date window that can overlap a nearby ' +
         'one-day meet. So the raw same-day check is near-useless: 13,504 hits, overwhelmingly ' +
         'legitimate. GEOGRAPHY is the real signal -- one person cannot be in two states on the ' +
         'same day. Independent of the DUP-1 location rule in the sense that it compares the two ' +
         'meets to EACH OTHER, not a meet to its schools.\n' +
         '         BASELINE 2026-08-12 = 2,789 (raw same-day check was 13,504, so ~79%% were ' +
         'same-state and legitimate). Of the 2,789, roughly 500 are ADJACENT states and still ' +
         'plausible (ill+ind 242, ky+ohio 69, ore+wash 49, kan+mo 25 -- Kansas City sits on the ' +
         'line). The remaining ~1,800 are distant pairs that are NOT plausible in one day: ' +
         'mass+texas 736, texas+wis 460, maine+pa 301, calif+colo 191, mich+pa 138. Those are ' +
         'the ones worth investigating; start with mass+texas.\n' +
         '         DO NOT tune this to zero -- three earlier versions were wrong from ' +
         'over-fitting a detector to data that was not understood yet.',
    tolerate: 2860,   // 2026-08-18: +65 from 197 newly-filled meets adding legitimate athlete-days
    sql: `WITH st AS (
            SELECT meet_id,
              CASE
                WHEN location IS NULL THEN NULL
                WHEN split_part(split_part(location,'*',1),',',2) ~ '^\\s*[A-Z]{2}\\s*$'
                  THEN upper(trim(split_part(split_part(location,'*',1),',',2)))
                ELSE lower(trim(trailing '.' from trim(split_part(split_part(location,'*',1),',',2))))
              END AS st
            FROM meets WHERE location IS NOT NULL),
          pairs AS (
            SELECT r.athlete_id, r.date, count(DISTINCT s.st)::int AS states
            FROM results r JOIN st s ON s.meet_id = r.meet_id
            WHERE r.meet_id IS NOT NULL AND r.athlete_id IS NOT NULL
              AND r.date IS NOT NULL AND s.st IS NOT NULL
            GROUP BY 1,2)
          SELECT count(*)::int AS n FROM pairs WHERE states > 1`,
  },
  {
    name: 'every result resolves to a canonical event (results + relay_results)',
    why: 'event_type_id NULL means the row cannot be grouped, ranked or PR-ed correctly.\n' +
         '         COVERS THE RELAY TABLE TOO. Checking only `results` reported 100% coverage ' +
         'while relay_results held 48 NULLs (athletic.net short codes sprintmed2248 / 110shuttleh ' +
         '/ 4x1600m had no alias). Fixed 2026-08-19, migrations/20260819_sibling_table_gaps.sql.',
    tolerate: 0,
    sql: `SELECT (SELECT count(*) FROM results       WHERE event_type_id IS NULL)
               + (SELECT count(*) FROM relay_results WHERE event_type_id IS NULL) AS n`,
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
    name: 'no malformed doubled mark codes (all three tables)',
    why: 'M8. The app renders mark_raw verbatim, so "NM  NM" reaches the user.\n' +
         '         M8 was marked FIXED on 2026-08-12 after repairing 21,683 rows in `results` — ' +
         'but it never reached the siblings, and athlete_prs still held 41 ("NH  NH" x22, ' +
         '"NM  NM" x19) until 2026-08-19. A single-table check made a whole-database claim it ' +
         'could not support. This is the M8/M9/DUP-3 pattern: fix the class, and make the CHECK ' +
         'cover the class too.',
    tolerate: 0,
    sql: `SELECT (SELECT count(*) FROM results       WHERE mark_raw ~ '^(NM|NH|ND|DNS|DNF|DQ|NT)\\s+\\1$')
               + (SELECT count(*) FROM relay_results WHERE mark_raw ~ '^(NM|NH|ND|DNS|DNF|DQ|NT)\\s+\\1$')
               + (SELECT count(*) FROM athlete_prs   WHERE mark_raw ~ '^(NM|NH|ND|DNS|DNF|DQ|NT)\\s+\\1$') AS n`,
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
    name: 'every parseable mark has a numeric mark_seconds',
    why: 'M9. 1,301,371 rows held a time as TEXT with mark_seconds NULL, so they could not be ' +
         'sorted, ranked or PR-ed. Cause: six copy-pasted parsers, all of which demanded 2-3 ' +
         'decimals (so "10.6" returned null) and none of which stripped a trailing wind reading ' +
         '("10.24  (2.0)"). Repaired 2026-08-19; all six replaced by shared/mark_parser.js. ' +
         'This check is what makes the repair stick — a new importer that forgets to parse ' +
         'shows up here instead of quietly accumulating for nine months.\n' +
         '         NOT counted, deliberately: bare integers (Decathlon/Heptathlon/Pentathlon ' +
         'POINTS, ~15,767 rows — writing 8420 into mark_seconds would rank a decathlete as the ' +
         'slowest athlete in the DB) and status codes (DNS/DQ/NM/NT — real results with no ' +
         'numeric value, see MARK_CODES.md).',
    tolerate: 0,
    // ⚠️ ALL THREE SIBLING TABLES. The first version of this check looked only at `results`, and
    // that omission hid 379,508 rows with the identical defect (119,148 relay_results + 260,360
    // athlete_prs). A single-table invariant makes a whole-database claim it cannot support.
    sql: `WITH c AS (
            SELECT regexp_replace(btrim(regexp_replace(mark_raw,'\\s*\\([-+]?[0-9.]+\\)\\s*$','')),
                                  '[ahcyAHCY]$','') AS core
            FROM results       WHERE mark_seconds IS NULL AND mark_meters IS NULL AND mark_raw IS NOT NULL
            UNION ALL
            SELECT regexp_replace(btrim(regexp_replace(mark_raw,'\\s*\\([-+]?[0-9.]+\\)\\s*$','')),
                                  '[ahcyAHCY]$','')
            FROM relay_results WHERE mark_seconds IS NULL AND mark_raw IS NOT NULL
            UNION ALL
            SELECT regexp_replace(btrim(regexp_replace(mark_raw,'\\s*\\([-+]?[0-9.]+\\)\\s*$','')),
                                  '[ahcyAHCY]$','')
            FROM athlete_prs   WHERE mark_seconds IS NULL AND mark_meters IS NULL AND mark_raw IS NOT NULL)
          SELECT count(*)::int AS n FROM c
          WHERE (core ~ '^[0-9]+:[0-9]{2}:[0-9]{1,2}(\\.[0-9]+)?$'
              OR core ~ '^[0-9]+:[0-9]{2}(\\.[0-9]+)?$'
              OR core ~ '^[0-9]+\\.[0-9]+$')
            -- "0:00.0" / "0.00" are shaped like times but are placeholders for a MISSING time.
            -- They are meant to stay NULL (the next check owns them); counting them here would
            -- make this invariant permanently unsatisfiable.
            AND core !~ '^[0:.]+$'`,
  },
  {
    name: 'no zero or negative mark_seconds, and no truncated h:mm:ss',
    why: 'Two distinct corruptions, both found 2026-08-19, both of which put a bogus WORLD ' +
         'RECORD at the top of a leaderboard:\n' +
         '         (a) athletic.net\'s parser did `const [mm, ss] = clean.split(\':\')`, so ' +
         '"1:05:37.73" bound mm="1", ss="05" and stored 65 SECONDS for a 65-MINUTE run. 6 rows.\n' +
         '         (b) sources emit "0:00.0"/"0.00" as a placeholder for a missing time; parsed ' +
         'naively that is faster than any human. 2 rows.\n' +
         '         shared/mark_parser.js now rejects non-positive values outright, and mark_raw ' +
         'still preserves whatever the source actually published.',
    tolerate: 0,
    sql: `SELECT (SELECT count(*) FROM results WHERE mark_seconds IS NOT NULL
                    AND (mark_seconds <= 0
                         OR (mark_raw ~ '^[0-9]+:[0-9]{2}:[0-9]' AND mark_seconds < 600)))
               + (SELECT count(*) FROM relay_results WHERE mark_seconds IS NOT NULL
                    AND (mark_seconds <= 0
                         OR (mark_raw ~ '^[0-9]+:[0-9]{2}:[0-9]' AND mark_seconds < 600)))
               + (SELECT count(*) FROM athlete_prs WHERE mark_seconds IS NOT NULL
                    AND (mark_seconds <= 0
                         OR (mark_raw ~ '^[0-9]+:[0-9]{2}:[0-9]' AND mark_seconds < 600)))
               AS n`,
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
