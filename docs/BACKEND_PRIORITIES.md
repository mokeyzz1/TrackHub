# Backend Priorities — working checklist

**Owner's priority (2026-08): make the backend genuinely good before the next season.**
The 2026-27 track season starts **Dec 2026 / Jan 2027**, so there is runway now. Frontend and
marketing come after; the backend is what gets fixed in this window.

Keep this file current — it is the step-by-step of what we're doing and why.
Problem/solution history lives in `memory/backend-rebuild-status.md`.

---

## P0 — Backfill missing meet results for the 2025 + 2026 seasons
*The single most important item.*

| Step | Status |
|---|---|
| athletic.net path for empty 2025-26 meets | ✅ **exhausted** — the 30 with links have **no results posted** on athletic.net (already tried, marked `imported`) |
| TFRRS engine verified end-to-end (NSIC, meet 12948) | ✅ 2,326 results, 56 relays, **100% `team_id`**, 0 new athletes |
| TFRRS batch over the season's remaining empty meets | ⏳ running — 47 meets |
| Post-batch dup verification (normalized marks) | ⬜ |
| Mark genuinely unavailable meets `results_status='unavailable'` so we stop rechecking | ⬜ |

**Scope reality:** 2025-26 season = 2,460 meets, 213 empty at start (91.3% complete).
Of those 213: 76 had links (48 TFRRS + 30 athletic.net), **137 have no link at all**.

## P1 — Meets with no results link
*Owner: "that's fine… we can find a way to backfill that eventually."*

The blocker is structural, not effort: **USTFCCCA's directory is a moving window.** Once a meet
ages out, its links can't be retrieved (see CLAUDE.md §1b). 2025-and-older meets have
essentially **zero** stored links. So:
- ⬜ Don't grind these. Profile them, mark the unreachable ones `unavailable`.
- ⬜ Possible later angles: athlete-overlap matching; scraping athlete profiles (fills marks
  without needing the meet link); TFRRS team/conference pages.
- ✅ **Prevention (done):** meet discovery now captures athletic.net timing links into
  `athletic_net_results_url` so current meets never lose their link again.

## P2 — One proper scraper engine (the "which source" decision)

Today there are two separate pipelines. The goal is **one engine that decides per meet**.

- ✅ Provenance recorded per meet (`meets.results_source`).
- ✅ Both sources documented as co-equal; TFRRS's 99% share is chronology, not superiority
  (CLAUDE.md §1).
- ⬜ **Orchestrator**: per meet — pick source by which link exists; prefer the one with better
  coverage for that meet; record `results_source`; never import a second source into a meet that
  already has results.
- ⬜ Fold both importers onto the shared modules (`event_resolver`, `name_parser`,
  `AthleteResolver`) so a fix lands once, not twice. *(This copy-paste is what let the same
  duplicate bug exist separately in `batch_import.js` and `sync-weekend-results.js`.)*
- ⬜ Consider the status-router already sketched in `backend/SCRAPING_PIPELINE.md`
  (upcoming→entries, live→live results, completed→final).

**Selection rule of thumb:** TFRRS = structured, complete, canonical identity + rankings.
athletic.net = live, richer fields (wind/splits/PB-SB), covers meets TFRRS misses. Use whichever
has the meet; prefer athletic.net when you want the rich fields, TFRRS when you want structure.

## P3 — Data quality still open

- ⬜ **394,659 results have no `team_id`** (mostly pre-2024 seasons; roster history only covers
  2024-25 and 2025-26). Re-runnable: `scrapers/backfill-result-team-id.js`.
- ⬜ **1,418 relays have no team** (mostly juco — their leg athletes aren't in the DB).
- ⬜ **~40,618 DUPLICATE relay rows** (40,060 groups sharing meet+event+team+place+identical mark;
  ~18% of 228k). Pre-existing, not from the athletic.net import (ours were dup-guarded). Shows up
  as the same relay listed twice on an athlete's profile. Needs a dedup pass like the athlete one.
- ⬜ **Broken relay events (owner-reported): 408 relay-event groups across 406 meets have NO
  times at all** (1,439 rows, all DNF/blank) — a TFRRS parse failure, not real DNFs. Verified case:
  NCAA DII Outdoor Champs (meet 13142) 4x100 = 7 rows all DNF, while the SAME meet's 4x400 imported
  perfectly (80 rows with times). This is exactly the owner's "I see the 4x4s but not the 4x1s".
  **athletic.net has the correct data for that meet** (m 4x100: 24 rows, Carson-Newman 39.30a;
  f 4x100: 24 rows, Tusculum 44.05a) — so the fix is per-EVENT source fallback, which the current
  "one meet, one source" rule doesn't cover. Proposed: detect all-DNF relay events, delete those
  rows, re-import that event from athletic.net where a link exists.
- ⬜ **relay_results hygiene:** 183,916 rows (81%) have NULL `meet_id` and 14,424 (6.3%) NULL
  `date` — `getAthleteRelays` sorts by date, so ordering on profiles is unreliable.
- ⬜ **Dedup tail**: 294 cross-school + ~646 ambiguous pairs + 3 conflict clusters.
  Duplicate athletes are **user-visible** (e.g. "Obiora Okeke", "Mena Scatchard").
- ⬜ **Unattached modelled per-person, not per-competition** — the root cause of those duplicates
  (CLAUDE.md §2). Correct model: `results.team_id` → the Unattached team for that meet.
- ⬜ Uniqueness guard on `tfrrs_athlete_id` after the dedup tail.
- 🔁 **Re-run each season:** `migrations/20260719_refresh_athlete_current_school.sql` (transfers),
  `backfill-result-team-id.js`, `backfill-athlete-{names,gender}.js`.

## P3b — Retire the abandoned live-results feature
Owner abandoned in-app live results (would need ~24/7 scraping + a timing UI). Shipped solution:
link out to the timing site (`meet_url` in a WebView) — that stays. Leftovers to retire:
- ⬜ `frontend/hooks/useLiveResults.ts` — zero imports (zero-risk delete)
- ⬜ `getTopPerformances()` in `services/database-supabase.ts` — never called (home screen uses the
  `get_top_performances` RPC). Keep the rest of that file; other functions are in use.
- ⬜ `live_results` table (48 junk rows) + `unprocessed_live_results` view — drop with the
  frontend migration (generated types reference them)
- ⬜ live scrapers: `backend/scripts/*live*` (8 files), `scrapers/live/live_scraper.js`
- ✅ Keep `backend/LIVE_RESULTS_INVESTIGATION.md` — records *why* it was abandoned

## P4 — Ship / structural

- ⬜ Merge `backend-rebuild` → `main` (nothing here touches app code; low risk).
- ⬜ **Frontend migration** — app reads by `meet_id`/`event_type_id`/`division_id` instead of
  matching text. Until this lands most backend cleanup is dormant. Riskiest step; do it screen by
  screen. Then execute `COLUMN_RETIREMENT_PLAN.md`.
- ⬜ **Best first target: the `get_top_performances` DB function** (powers the home-screen
  leaderboard; `hooks/useTopPerformances.ts` calls it via `supabase.rpc`). It reads `results`
  (good) but does two things by hand that the DB now knows as data:
  1. **normalizes events with a hand-written regex list** (`'^200\s*(Meters?|Meter\s*Dash|m|M)'`
     → '200 Meters') instead of `event_type_id` — so it **misses aliases it doesn't list**,
     notably athletic.net short codes (`60mh`, `1mile`, `weight`, `shot`, `tj`);
  2. **guesses indoor by "does the meet have a 60m event"** instead of using `results.environment`.
  Rewriting it on `event_type_id` + `environment` shrinks a 26KB function, picks up every one of
  the ~1,180 aliases, and makes indoor/outdoor exact. Self-contained (one function, one screen),
  so it's the lowest-risk way to start the migration and prove the payoff.
- ⬜ Computed PRs: `v_athlete_prs` is live and fast (0.6 ms/athlete). Only materialize if
  PR-based leaderboards get built. **Do not drop `athlete_prs`** — it's complementary.

---

## Done in this rebuild (don't redo)
Athlete dedup (6,277 merged) · canonical events 100% (63 types, incl. relays) · `meet_id` FKs +
orphan cleanup · divisions dimension (research-validated) · gender 99.96% · first/last name 99.9% ·
transferred-athlete school fix (5,446) · `team_id` 86.5%→89.3% · athletic.net pipeline
(108 meets / ~58k results) · relays (3,686 / 11,230 legs) · computed PRs · provenance
(`results_source`) · scraper hardening (orphan-leak, event resolution, name split, dup guards).
