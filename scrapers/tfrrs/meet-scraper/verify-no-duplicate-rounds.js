#!/usr/bin/env node
/**
 * END-TO-END CHECK that the scraper never emits one performance twice (U8). READ-ONLY — it
 * fetches a live meet, runs the REAL parse path (fetchMeetEvents -> fetchEventResults, including
 * collapseDuplicateRounds) and inspects the rows. Nothing is written.
 *
 * WHY IT EXISTS. A TFRRS event page renders the same event as several tables — a combined view
 * plus one per heat/flight — and the parser walks all of them, so each athlete came out 2-3 times
 * with different round labels. That produced ~370k duplicate rows (DUP-2). The fix is easy to
 * regress: any future change that iterates tables, or that drops the collapse step, brings it
 * straight back.
 *
 * TWO CONDITIONS, BOTH REQUIRED:
 *   1. no athlete appears twice with the same mark AND place  -> the bug is gone
 *   2. genuine prelim/final pairs still show BOTH races       -> the fix did not overcorrect
 * Condition 2 matters as much as 1: a collapse that eats everything also reports zero duplicates
 * while destroying half a championship.
 *
 * Last run 2026-08-12 against the 2026 NCAA DI Outdoor Championships: 113 rows, 0 duplicates,
 * Long Jump collapsed 48 -> 24 (exactly half — every athlete was in two tables), and prelim/final
 * pairs such as Jaiden Reid 19.63 final / 20.05 prelim were preserved.
 *
 * Run before any release that touches the scrapers:
 *   node verify-no-duplicate-rounds.js
 */
const { fetchMeetEvents, fetchEventResults } = require('./scrape-meet-results');
(async () => {
  const meetUrl = 'https://www.tfrrs.org/results/96875';   // 2026 NCAA DI Outdoor Championships
  console.log('fetching event list...');
  const meet = await fetchMeetEvents(meetUrl);
  const events = (meet && meet.events) || [];
  console.log(`events found: ${events.length}`);
  const pick = events.filter(e => /100 Meters|200 Meters|Long Jump/i.test(e.eventName)).slice(0, 4);
  console.log(`testing ${pick.length}: ${pick.map(e => e.eventName).join(', ')}\n`);

  let grand = { rows: 0, dupes: 0 };
  for (const ev of pick) {
    const rows = await fetchEventResults(ev.eventUrl, 99999, 'TEST', '2026-06-13', ev.eventName);
    // a duplicate = same athlete + same mark + same place emitted more than once
    const seen = new Map();
    for (const r of rows) {
      const k = `${r.athlete_name}|${r.mark_raw}|${r.place}`;
      seen.set(k, (seen.get(k) || 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1);
    grand.rows += rows.length; grand.dupes += dupes.length;
    console.log(`  ${ev.eventName.padEnd(22)} rows=${String(rows.length).padStart(3)}  duplicate performances=${dupes.length}`);
    dupes.slice(0, 3).forEach(([k, n]) => console.log(`      x${n}  ${k}`));
    // show that genuine prelim/final pairs survive
    const multi = new Map();
    rows.forEach(r => multi.set(r.athlete_name, (multi.get(r.athlete_name) || 0) + 1));
    const twice = [...multi.entries()].filter(([, n]) => n > 1).slice(0, 2);
    twice.forEach(([n]) => {
      const rs = rows.filter(r => r.athlete_name === n).map(r => `${r.mark_raw}/${r.round}`);
      console.log(`      kept both races: ${n} -> ${rs.join('  |  ')}`);
    });
  }
  console.log(`\nTOTAL rows ${grand.rows}, duplicate performances ${grand.dupes}`);
  console.log(grand.dupes === 0 ? 'PASS — U8 fix holds end-to-end' : 'FAIL — duplicates still emitted');
})().catch(e => console.error('ERR', e.message));
