---
name: meet-url-backfill-state
description: Snapshot of results/link coverage gaps by season and the backfill plan for TrackHub meets
metadata: 
  node_type: memory
  type: project
  originSessionId: b63228a2-f910-41f5-bd61-21edda8f8e0c
---

Audit run 2026-07-09 (raw SQL via direct Postgres, `db.<ref>.supabase.co:5432`, user `postgres`, pw = root `.env` `DB_PASSWORD`; root `DATABASE_URL`/`DIRECT_URL` are empty). See [results-data-model].

**CRITICAL — the app matches meet→results by `meet_name` + `date` STRINGS, not `meet_id`**
(`frontend/services/database-supabase.ts` `getEventsByMeetWithGender` / `getEventResults`; the
`meetId` param is passed but never used). So `meet_id` coverage is nearly irrelevant to what
users see. An earlier `meet_id`-based audit claimed "~10,300 empty meets" — that was measuring
the wrong field; disregard it.

**Correct audit (2026-07-09, app's name+date logic):** of 12,724 meets, **11,879 (93.4%) show
results in the app.** Only **845 look empty**, split: **830 genuinely missing** (no results
anywhere → real scraping target) and **15 name/date mismatches** (data exists under a different
`meet_name` → trivial reconcile). The app is in good shape; the backfill is ~830 meets, not
thousands.

Re-scrape engine for the 830 = `scrapers/tfrrs/meet-scraper/sync-weekend-results.js` (prefers
stored `tfrrs_url`; needs `tfrrs_url` backfilled from USTFCCCA via `meets/backfill_result_links.js`
first — only ~21 meets have one). `scrape-and-import.js` is an OLD one-off, not the engine.
See [track-season-model]. Revised plan: `docs/DATABASE_CLEANUP_PLAN.md`.

Adjacent issues surfaced: duplicate meet records (e.g. meet_id 542 vs 6101, both NCAA DI XC),
and inconsistent `season` labels.

Job 1 of `docs/OVERNIGHT_BACKFILL_PLAN.md` (fix 271 stale/wrong `meet_url`s) was **completed 2026-07-09** via `scrapers/meets/fix_meet_urls.js --commit`.

**Backend rebuild progress (2026-07-09):**
- ✅ Meet dedup: merged 43 duplicate-meet groups (46 rows) via `cleanup_duplicate_meets.js --commit`.
  ~9 name-variation dupes remain (JDL/ASICS etc.) — deferred to the meet_name reconciliation step.
- ✅ **meet_id backfill (Phase 1b step 1): DONE.** Linked exactly 1,643,825 athlete-history result
  rows to their meets by exact `meet_name`+date (0 ambiguous). results with meet_id: 1.43M→3.07M;
  563,081 remain null (genuinely unmatchable: null date/name or no matching meet — correct).
  Took 5 attempts — key lessons: `results` has 14 indexes (drop `idx_results_meet_id` during bulk
  update, recreate after); ANALYZE temp tables; NEVER `DELETE ... WHERE x IN (subquery)` on big
  tables; use resumable batches + reconnect (direct pg connection drops on long ops).
- Still pending: frontend migration to read by meet_id (the actual behavior change), canonical
  events table, indoor/outdoor tagging, athlete dedup, empty-table verdicts, season-label code fix.
- 222 pre-existing orphaned meet_ids (results → meets 94641/94729 which don't exist) — small cleanup TODO.

Goal set by user: rebuild a clean, portable, self-documenting, migration-based backend (legible to
any dev/agent, movable to AWS). Do structural changes as versioned migrations tested on a Supabase
branch first — no more improvised scratch scripts for risky work. Next: draft target-schema blueprint.
