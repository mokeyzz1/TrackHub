---
name: results-data-model
description: "How TrackHub's results table works (dual-purpose) and the stored-link scrape model that replaced name-matching"
metadata: 
  node_type: memory
  type: project
  originSessionId: b63228a2-f910-41f5-bd61-21edda8f8e0c
---

The `results` table serves **two purposes**, distinguished by `meet_id`:
- `meet_id` **set** → meet-linked results, power meet result pages. ~1.4M rows across ~1,572 distinct meets.
- `meet_id` **null** (but `athlete_id` set, plus a `meet_name` string) → athlete-history results scraped from individual athlete pages; power athlete profiles/PRs/progression. ~2.2M rows (≈60% of the table). These are NOT a bug or orphans — by design.

So "X% of meets have no results" only refers to meet-linked coverage; the athlete marks for those meets usually still exist via the athlete-history path.

**CRITICAL: the app displays a meet's results by matching `results.meet_name` + `date` against
`meets.name` + `date` — it does NOT use `meet_id`** (`frontend/services/database-supabase.ts`:
`getEventsByMeetWithGender`, `getEventResults`; `meetId` param is accepted but never used in the
query). So `meet_id` coverage is largely irrelevant to what users see, and setting `meet_id` on
rows changes nothing in the app. What makes a meet look empty is `meets.name`+`date` not
string-matching any `results.meet_name`+`date`. See [meet-url-backfill-state].

**Results enter via two TFRRS pipelines** (verified by reading the code 2026-07-09):
- `scrapers/tfrrs/meet-scraper/sync-weekend-results.js` — CURRENT engine. Finds recent meets
  (looks back `--days`, default 7) without results, prefers the stored `tfrrs_url` (fragile
  name-match only with `--fuzzy`), scrapes the TFRRS meet page, imports **with `meet_id` set**
  (+ relays into `relay_results`/`relay_athletes`). This is the "new model" — store the
  reliable link, skip name-guessing. `scrapers/tools/scrape-and-import.js` is an OLDER one-off,
  not the engine.
- `scrapers/tfrrs/athlete-scraper/` — older bulk-historical. Scrapes each athlete's TFRRS
  profile and imports results **with no `meet_id`** (`import-results-to-db.js:166-184`). This
  produced the ~2.2M unlinked rows.

Meets are created by `scrapers/meets/scrape_meets.js` (USTFCCCA). It hardcodes `season:'indoor'`
(line 490 — bad-label source) and rarely captures `tfrrs_url` (only ~21 meets) because it runs
on upcoming meets before TFRRS posts links. See [meet-url-backfill-state].

**Why "Timing Site" link only:** commit 75762f9 made the meets scraper trust only the `"Timing Site"`-labeled link (dropped the old keyword `scoreLink` heuristic that grabbed hubs/registration/homepages).

**Canonical docs (2026-07-09):** `docs/BACKEND_ARCHITECTURE.md` = verified map of the whole
backend (active vs legacy scrapers, tables, the two result eras, defects). Read it BEFORE
reasoning about the pipeline. Work plan = `docs/DATABASE_CLEANUP_PLAN.md`. Agreed direction:
make `meet_id` the single authoritative meet↔results linkage and migrate the app off
name+date matching.
