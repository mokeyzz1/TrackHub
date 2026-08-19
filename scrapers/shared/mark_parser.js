/**
 * mark_parser — the ONE place a raw mark becomes a number.
 *
 * WHY THIS EXISTS. There were two parsers (`parseMarkSeconds` in
 * scrapers/tfrrs/meet-scraper/scrape-meet-results.js and `parseMark` in
 * scrapers/athletic-net/import_meet_results.js) and they disagreed. That is U1 — copy-pasted
 * logic — and it produced two separate defects:
 *
 *   1. athletic.net's version did `const [mm, ss] = clean.split(':')`, which on "1:05:37.73"
 *      binds mm="1", ss="05" and returns **65 seconds for a 65-minute run**. Six rows in the
 *      database carried this (a 1:07:14 10K stored as 67s). Verified and repaired 2026-08-19.
 *   2. TFRRS's version required exactly 2-3 decimals (`\d{2}\.\d{2,3}`), so "10.6" and
 *      "1:00:06.1" — both real TFRRS formats — silently returned null.
 *
 * VALIDATED, not assumed. This logic was checked against the 1,082,583 rows that already had a
 * mark_seconds: it reproduces 1,082,576 exactly. The 7 misses are the 6 corrupt h:mm:ss rows
 * (where this is right and the stored value was wrong) and one 3-decimal rounding difference.
 *
 * WHAT IS DELIBERATELY *NOT* PARSED — these are not failures:
 *   - Status codes (DNS, DNF, DQ, FS, SCR, NT, NM, NH, ND, ENR, NP). Per OWNER_DECISIONS.md
 *     these ARE results; they simply have no numeric value. See docs/MARK_CODES.md.
 *   - Bare integers on multi-events ("8420"). That is a Decathlon/Heptathlon/Pentathlon POINTS
 *     total, not a time or a distance. 15,767 such rows exist. Writing points into mark_seconds
 *     would rank a decathlete as the slowest athlete in the database. There is no points column
 *     yet; until there is, these stay unparsed on purpose.
 */

// Only the KNOWN timing suffixes, never "any trailing letter": a=all-weather, h=hand-timed,
// c=converted, y=imperial-yard conversion. Stripping letters generically turned the field mark
// "5.08m" into 5.08 SECONDS, because the metre marker looks like a suffix.
const TIMING_SUFFIX = /[ahcy]$/i;
const TRAILING_WIND = /\s*\([-+]?[0-9.]+\)\s*$/; // "10.24  (2.0)" / "1:00.00  (+0.0)"

/** Strip wind annotation and timing-suffix letters, leaving the bare numeric core. */
function core(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim().replace(TRAILING_WIND, '').trim().replace(TIMING_SUFFIX, '');
}

/**
 * Raw mark -> seconds, or null if it has no numeric time value.
 * Handles  ss.x / ss.xx / ss.xxx  ·  m:ss.xx  ·  h:mm:ss.xx  — each optionally with a
 * timing-suffix letter and/or a trailing wind reading.
 */
function parseMarkSeconds(raw) {
  const c = core(raw);
  if (!c) return null;

  let m;
  if ((m = c.match(/^(\d+):(\d{2}):(\d{1,2}(?:\.\d+)?)$/)))      // h:mm:ss
    return round3(+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]));
  if ((m = c.match(/^(\d+):(\d{2}(?:\.\d+)?)$/)))                 // m:ss
    return round3(+m[1] * 60 + parseFloat(m[2]));
  if ((m = c.match(/^(\d+\.\d+)$/)))                              // ss.xx
    return round3(parseFloat(m[1]));

  // A bare integer is intentionally not a time — see the header note on multi-event points.
  return null;
}

/** Raw mark -> metres, or null. Handles "5.08m" and imperial "24-01.50" (feet-inches). */
function parseMarkMeters(raw) {
  if (raw === null || raw === undefined) return null;
  const t = String(raw).trim();

  const metric = t.match(/^(\d+(?:\.\d+)?)\s*m$/i);
  if (metric) return round3(parseFloat(metric[1]));

  // Two imperial spellings, both real: TFRRS writes 24-01.50, and its older pages write 15' 6.75".
  const dashed = t.match(/^(\d+)-(\d+(?:\.\d+)?)$/);              // 24-01.50 => 24ft 1.5in
  if (dashed) return round3(feetInches(+dashed[1], parseFloat(dashed[2])));

  const quoted = t.match(/^(\d+)'\s*(\d+(?:\.\d+)?)"?$/);         // 15' 6.75"
  if (quoted) return round3(feetInches(+quoted[1], parseFloat(quoted[2])));

  return null;
}

/**
 * Convenience: returns { mark_seconds, mark_meters } with at most one set.
 * A colon always means a time, so it wins over the metre pattern.
 */
function parseMark(raw) {
  const seconds = parseMarkSeconds(raw);
  if (seconds !== null) return { mark_seconds: seconds, mark_meters: null };
  return { mark_seconds: null, mark_meters: parseMarkMeters(raw) };
}

const feetInches = (ft, inch) => (ft * 12 + inch) * 0.0254;

// Zero and negative are rejected, not stored. Sources emit "0:00.0" / "0.00" as a placeholder for
// a missing time; as a NUMBER that is faster than any world record and tops every leaderboard.
// Two such rows reached the database. `mark_raw` still keeps whatever the source published.
const round3 = n => (Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : null);

module.exports = { parseMark, parseMarkSeconds, parseMarkMeters, core };
