# Data Issues Tracker

Living list of every known data problem, its size, and its status. Goal: a fully clean database
before the 2026-27 season (starts Dec 2026 / Jan 2027).

Companion docs: `BACKEND_PRIORITIES.md` (execution order) · `CLAUDE.md` (rules & context) ·
`memory/backend-rebuild-status.md` (problem/solution history).

**SCALE NOTE (owner, 2026-08):** every issue found by inspecting ONE athlete's profile turned out
to affect tens of thousands. Always measure an in-app symptom across the whole DB before deciding
it's minor.

**Working rules for every fix here:** dry-run with counts + samples first · verify after writing ·
never delete without a self-proving test · small throttled batches (weak instance).

---

## 🔴 OPEN — duplicates (user-visible, highest priority)

| # | Issue | Size | Notes |
|---|---|---|---|
| D1 | **Cross-meet duplication** — the same performance attributed to 2-4 different meets | **26,846 extra attributions** (Outdoor 2026 alone) | Proven case: "Utah Spring Classic" (12436) holds **100% Arkansas Spring Invitational** (12337) data — 0 unique rows, athletes all from AR/IA/KS/KY/MO/OK. Owner spotted it: an athlete showing a meet she never attended. **Fix:** find meets with zero unique results, corroborate by geography, delete the copied rows (meet returns to empty = accurate). |
| D2 | **Within-meet round duplicates** — same performance under two round labels | **416,044 extra rows · 69,409 athletes** (2026 seasons alone) | **LARGEST issue in the database. MECHANISM VERIFIED against TFRRS 2026-08:** TFRRS shows a race
BOTH as a combined result AND broken out by heat, so one run is scraped twice with different round
labels. Round pairs in the data: **Finals+Heat N ≈ 328,000 groups** (timed-final events — the run
appears in the combined list and in its heat), Preliminaries+Heat N ≈ 50,000, Finals+Finals 8,762.
**SAFE RULE:** same athlete+meet+event+**mark**+**place** = one performance, whatever the round
label. A genuine prelim→final pair has DIFFERENT times (verified: Carson-Newman 39.50 prelim →
39.30 final), so requiring identical mark AND place cannot merge them. e.g. `11.79 13th "Heat 1"` AND `11.79 13th "Preliminaries"`. 395,160 of 405,301 groups differ ONLY by round label. Same mark **and same place** is the signal (a real prelim/final rarely shares both — place normally differs). Keep Finals > Preliminaries > Heat N. Verify a sample before mass deletion. |
| D3 | **Duplicate relay rows** | ~40,618 extra rows (40,060 groups) | Same meet+event+team+place+identical mark. Pre-existing (not from the athletic.net import, which was dup-guarded). |
| D4 | **Duplicate athlete records** | 294 cross-school + ~646 ambiguous + 3 conflict clusters | Root cause is U2 below. Visible in-app (e.g. "Obiora Okeke", "Mena Scatchard"). |

## 🟠 OPEN — missing / incomplete data

| # | Issue | Size | Notes |
|---|---|---|---|
| M1 | **4x100 times need re-scraping** | 619 meets | Parser is fixed (see F7) but existing rows are still timeless. Re-scrape relay events only, to avoid duplicating individual results. |
| M2 | **All-DNF relay events** | 408 events / 406 meets (1,439 rows) | Consequence of F7. Recoverable from TFRRS *and* athletic.net. |
| M3 | **Relays still unlinked to a meet** | ~25,700 | 11,712 have no matching meet; ~14,000 have a name but **no date** (never attempted — matchable by name alone where unambiguous). |
| M4 | **Relays with no team** | 1,418 | Mostly juco — leg athletes aren't in the DB, so the team can't be derived. Lineups are still recorded. |
| M5 | **Results with no `team_id`** | 394,659 | Mostly pre-2024 (roster history only covers 2024-25, 2025-26). Re-runnable: `backfill-result-team-id.js`. |
| M6 | **Meets with no results link** | 137 (2025-26) · 671 all-time | **Structurally limited** — USTFCCCA's directory is a moving window, so old links are gone (CLAUDE.md §1b). Don't grind; mark `results_status='unavailable'`. |

## 🟡 OPEN — modelling / structural

| # | Issue | Notes |
|---|---|---|
| U1 | **Two scraper engines with copy-pasted logic** | The relay colon bug (F7) existed **separately in two files**. One shared engine = fix once. |
| U2 | **Unattached modelled per-person, not per-competition** | `athletes.school_id=1835` instead of `results.team_id` → one person's unattached and college records look like two athletes. Root cause of D4. |
| U3 | **No per-event source fallback** | TFRRS broke on DII 4x100 while athletic.net had it perfectly. Current rule is per-meet; needs to be per-event. |
| U4 | **`get_top_performances` uses regex, not `event_type_id`** | Home-screen leaderboard normalizes events by hand-written regex and infers indoor by "has a 60m event" — misses athletic.net short codes. Best first target for the frontend migration. |
| ~~U4b~~ | ~~Athlete progression & season bests split one event into several~~ | **FIXED 2026-08-09 — see F13.** |
| U5 | **Frontend still matches by text** | App reads `meet_name`/`event_name` strings instead of IDs. Until this lands most cleanup is dormant. |
| U6 | **Abandoned live-results code** | In-app live results was dropped (link-out via `meet_url` is the shipped answer). Dead: `live_results` table, `useLiveResults.ts`, `getTopPerformances()`, 8 live scripts. |
| U7 | **Merge `backend-rebuild` → `main`** | Nothing touches app code; low risk. |

## ✅ FIXED (2026-07 → 2026-08)

| # | Fix | Result |
|---|---|---|
| F1 | Transferred athletes showing old school | 5,446 corrected · re-runnable migration |
| F2 | `results.team_id` missing | 86.5% → 89.3% (104,487 filled from roster history) |
| F3 | athletic.net dropped relays entirely | 3,686 relays / 11,230 legs imported |
| F4 | Imported relays not clickable | Leg rows now written to `results` (app builds event lists from there) |
| F5 | **Relays orphaned from meets** | **157,780 linked** — 4x100 went 6% → 85% |
| F6 | athletic.net event short-codes unmapped | 3,589 results fixed → event coverage back to 100% |
| F7 | **Relay time parser required a colon** | 4x100 (`39.30`) fell to the DNF fallback while 4x400 (`3:17.58`) worked. Fixed in **both** scrapers |
| F8 | Empty 2025-26 meets (TFRRS-linked) | 47 meets → **72,454 results + 2,016 relays** |
| F9 | TFRRS sync would import onto populated meets | Caught before any writes — would have duplicated 42 meets |
| F10 | Link drift at discovery | athletic.net timing links now also fill `athletic_net_results_url` |
| F11 | Provenance unknown | `meets.results_source` populated (tfrrs 11,853 · athletic_net 108) |
| F12 | Context lost between sessions | `CLAUDE.md` + this tracker + priorities doc |
| F13 | **One event shown as several, each with its own season best / PR** | **34,748 athlete-event pairs · 25,093 athletes · worst case 1 event shown 6×.** First frontend cut-over to `event_type_id`. |

### F13 detail — first use of the canonical event in the app

**Symptom (owner-reported):** progression listed `100` and `100 Meters` separately; season bests
showed 60m twice.

**Diagnosis — the first guess was wrong and worth recording.** The initial theory was "the frontend
never normalizes". False: `normalizeEventName()` *is* applied at every grouping site, and it
collapses `100`/`100 Meters`/`100m` correctly. The real cause is that
`utils/eventNames.ts` carries a **hand-written 192-entry map**, while the DB resolves **1,186
spellings** through `event_aliases`. Everything the map doesn't know falls through as its own event.

Measured across the whole DB (2026-08-09): the map splits **58 of 62 event types**;
**64,054 track & field results** land on a stray label. Examples — `200m` rendered as 35 different
labels (`200 Meter Dash Open`, `200 M Participate`, `200 Meter Dash Unseeded`…), `800m` as 66,
`Pole Vault` as 43. Athlete 84383 saw six separate Pole Vault events, each with its own season best.

**Fix:** new `canonicalEventName(row)` in `utils/eventNames.ts` returns `event_types.code` from the
DB and falls back to `normalizeEventName()` only when a row has no `event_type_id`. Every query
that groups by event now selects `event_type_id, event_types ( code )`:
`getAthletePerformances` · `getAthletePRs` · `getAthleteComparisonStats` · `getHeadToHead` ·
`getAthleteRelays` — plus the grouping sites in `app/athlete/[id].tsx` and `AthleteStatsModal.tsx`.
`getHeadToHead` had to change **in the same commit** as `getAthleteComparisonStats`: it filters
using the keys that function produces, so a half-migration would have silently matched nothing.

**Note:** `types/database.ts` was stale — it had no `event_type_id` and no `event_types` table at
all, so the query wouldn't typecheck. Added those by hand rather than regenerating (a full regen
churns 41 KB and the file is stale in other ways too — worth doing, separately).

**Not covered by this fix:** XC. 52,496 XC results also carry non-canonical labels, but there the
distances are genuinely different (`4.97M`, `7k`, `5 MILE (XC)` all map to `8k XC`). Collapsing
those to one label would *hide* real differences — that's a DB modelling question, not a display
bug. Left alone deliberately.

**Earlier in the rebuild:** athlete dedup (6,277 merged) · canonical events (63 types, 100%) ·
`meet_id` FKs + orphan cleanup · divisions dimension · gender 99.96% · names 99.9% ·
computed PRs (`v_athlete_prs`) · scraper hardening (orphan leak, event resolution, dup guards).
