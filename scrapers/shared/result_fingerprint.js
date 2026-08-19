/**
 * result_fingerprint — the ONE way to decide "do we already have this performance?"
 *
 * WHY THIS EXISTS. The owner opened an athlete profile on 2026-08-19 and saw the NCAA DII Outdoor
 * 4x100 listed FOUR times: `45.15a` / `45.34a` (athletic.net) alongside `45.15 F` / `45.34 P`
 * (TFRRS). 1,252 rows across 243 meets were duplicated this way. Both importers had a
 * duplicate guard. They just did not agree on what a duplicate IS:
 *
 *   athletic.net  keyed on  athlete | event_type_id | NORMALISED mark
 *   TFRRS         keyed on  athlete | event_NAME     | RAW mark | date
 *
 * So when TFRRS imported into a meet athletic.net had already filled — which is what happened,
 * 31 minutes apart — it compared its own "45.15" against the stored "45.15a", saw no match, and
 * inserted. The trailing `a` (all-weather track) is a SOURCE ANNOTATION, not part of the mark.
 *
 * The unique indexes could not save us either: both include `round`, and athletic.net supplies no
 * round, so NULL vs 'Finals' reads as two different performances. A database guard cannot
 * distinguish "one race from two sources" from "a genuine prelim and final at the same time" —
 * only the importer, which knows the provenance, can. That is why this must be enforced here.
 *
 * TWO MORE BUGS THIS FIXES, both in the TFRRS path:
 *   - Its existing-results query was a bare `.select()`, which PostgREST caps at 1000 rows. Meet
 *     13142 holds 1,937, so the guard could not see its own meet's later rows. `fetchAll` pages.
 *   - It keyed on `event_name`, which differs by source ("60mh" vs "60 Meter Hurdles"), so the
 *     same event under two spellings never matched. Key on `event_type_id`, which is canonical.
 */

/**
 * Normalise a mark for MATCHING ONLY — never for storage or display.
 *
 * Strips whitespace, lowercases, and removes a trailing source annotation:
 *   a = all-weather track · h = hand-timed · c = converted · y = yard conversion · m = metres
 * so "45.15a", "45.15", "5.08m" and "5.08" all collapse to the same key.
 *
 * ⚠️ This is DELIBERATELY more aggressive than mark_parser.js, which must NOT strip a trailing
 * "m" (doing so turned the 5.08-metre jump into 5.08 seconds). Here the result is only ever a
 * comparison key, so collapsing "5.08m" and "5.08" is correct: they are the same performance
 * written by two sources. Never store the output of this function.
 */
function normaliseMarkKey(mark) {
  return String(mark || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[a-z]+$/, '');
}

/**
 * The fingerprint of one performance: who, which canonical event, what mark.
 * Round and place are deliberately EXCLUDED — they are the two fields the sources disagree on
 * (athletic.net gives no round, and gave place 5 where TFRRS gave place 4 for the same relay).
 */
function fingerprint(row) {
  return `${row.athlete_id}|${row.event_type_id}|${normaliseMarkKey(row.mark_raw)}`;
}

/**
 * Page through a PostgREST query. A bare `.select()` silently returns at most 1000 rows, and a
 * dedup guard that only sees the first 1000 existing rows is worse than none: it reports success
 * while letting duplicates through.
 */
async function fetchAll(makeQuery, page = 1000) {
  const out = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await makeQuery().range(from, from + page - 1);
    if (error) throw new Error(`fetchAll: ${error.message}`);
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < page) break;
  }
  return out;
}

/**
 * Build the set of performances a meet already holds, so an importer can skip them.
 * Returns a Set of fingerprints.
 */
async function loadMeetFingerprints(supabase, meetIds) {
  const seen = new Set();
  for (const meetId of [...new Set(meetIds)].filter(Boolean)) {
    const rows = await fetchAll(() => supabase.from('results')
      .select('athlete_id, event_type_id, mark_raw').eq('meet_id', meetId));
    rows.forEach(r => seen.add(fingerprint(r)));
  }
  return seen;
}

module.exports = { normaliseMarkKey, fingerprint, fetchAll, loadMeetFingerprints };
