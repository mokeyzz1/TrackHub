# Backend priorities — working checklist

Rewritten 2026-08-12 after the duplicate purge. Season starts **Dec 2026 / Jan 2027**.

Detail on any item: `DATA_ISSUES_TRACKER.md`. Before writing any cleanup: `DEDUP_METHOD.md`.
Undoing something: `RECOVERY.md`.

---

## ✅ DONE — and the season is protected

| | |
|---|---|
| Duplicates removed | **490,695 rows**, all reversible |
| Marks repaired | 21,683 (`NM  NM` → `NM`) |
| Event coverage | **100%** (0 rows without `event_type_id`) |
| Re-imports | blocked by `results_no_exact_duplicate` (tested) |
| **U8 — the ~370k-row generator** | fixed in both engines, **verified end-to-end on live data** |
| Relay colon bug | fixed — 4x100 times no longer dropped |
| Event grouping in-app | reads `event_type_id`; fixed 25,093 athletes |
| **Deployed to `main`** | **2026-08-12.** Cron scrapers were running unfixed code until then |

Standing checks: `scrapers/verify-data-invariants.js` (7 assertions) ·
`scrapers/tfrrs/meet-scraper/verify-no-duplicate-rounds.js` (run before any scraper release).

---

## 🔴 P0 — before the season (Dec/Jan)

**1. U1 — collapse the two scraper engines into one.**
`scrape-meet-results.js` and `sync-weekend-results.js` are still separate parsers. Both got the
collapse module and the colon fix, but every future fix must be made twice — and that is exactly
how the colon bug survived in one file after being fixed in the other. This is the highest-value
structural work left, and it gets riskier once meets are arriving weekly.

**2. Capture results links during the season.**
USTFCCCA's directory is a moving window (CLAUDE.md §1b) — miss it and the links are gone forever.
2025-26 got 588 athletic.net links vs 89 TFRRS. **This is the only cheap chance each year**, and
it is what makes the athletic.net plan possible at all.

## 🟠 P1 — unblocks the things you want next

**3. Normalized mark column** — gates the whole athletic.net dual-source plan. The dedup guard
keys on `mark_raw`, and athletic.net writes `10.35a` where TFRRS writes `10.35`, so the guard
cannot see a cross-source duplicate. Needs a normalized column + the unique index re-keyed onto
it. Do this **before** any dual-source import runs.

**4. U2 — Unattached per-competition, not per-person.**
`athletes.school_id = 1835` should be `results.team_id` → the Unattached team for that meet, with
the athlete keeping their school. Unblocks the real DUP-4 merges (Okeke's Unattached record holds
3 genuine results), and it is on the path to the Unattached/social work you want.

**5. U4 — `get_top_performances` still uses regex.**
The home-screen leaderboard normalizes events with hand-written regex and infers indoor by "has a
60m event", so it misses athletic.net short codes. Smallest, most visible frontend win — one RPC.

**6. U5 — frontend migration proper.**
The app still matches by `meet_name` / `event_name` text instead of IDs. **Until this lands most
of the backend cleanup is invisible to users.** Do it screen by screen; the athlete screen is
already done. Riskiest item here because it is user-facing.

**7. Schema for athletic.net's richer data.**
No column exists for qualifying status (**big Q** vs **small q**) or splits. Design it before the
season so the scrape captures it from day one — retrofitting means re-scraping meets whose links
have expired.

## 🟡 P2 — real, but no deadline

- **M5** — 394,659 results with no `team_id` (roster history only covers 2024-25, 2025-26)
- **M7** — 1,483,604 rows with no parsed `mark_seconds`/`mark_meters`; 1.3M of them have a
  perfectly numeric `mark_raw`
- **M3** — 22,865 relays unlinked to a meet (11,094 dateless ones are deliberately unlinkable)
- **DUP-4 tail** — the genuine merges, blocked on U2
- **DUP-1 pre-2026** — needs the container query indexed first; it timed out repeatedly at 2026
  scale and will not survive 10,105 meets
- **U3** — per-event source fallback (TFRRS broke on DII 4x100 while athletic.net had it)
- **U6** — delete the abandoned live-results code

## ⚪ P3 — measured, deliberately not fixed

- **Partial cross-meet contamination** — ~1,800 athlete-days in distant states. Owner's call
  2026-08-12: **not worth chasing.** ~0.3% of the database, mostly pre-2026, and every fix
  requires per-performance judgement where the attribution rules have a poor track record.
  The invariant keeps it from growing.
- **M1 / M2** — timeless relay events. Realistic ceiling ~420 rows, and 61% of the meets have no
  link left. Low value, do last.
- **M6** — meets with no results link. Structurally unfixable for old meets.

---

## If you only do three things

1. **Merge the two scrapers** (U1) — before meets start arriving.
2. **Capture links weekly during the season** — the window does not come back.
3. **Frontend migration** (U4 → U5) — the only item that makes any of this visible to users.
