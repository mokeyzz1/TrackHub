# Backend Reconstruction Work Plan

Companion to `docs/BACKEND_ARCHITECTURE.md` (the map of reality — read it first).
Goal: one unified, boring, reliable flow before next season (XC starts ~Aug 2026).
Every step: **dry-run → review output → --commit**. All writes hit production Supabase.

## Phase 1 — Make `meet_id` the single source of truth  ← highest leverage

The app currently matches results by `meet_name`+`date` strings; the fix that kills the
name-matching fragility forever:

- [ ] 1a. Dedup duplicate meets FIRST (`meets/cleanup_duplicate_meets.js`) so backfilled
      `meet_id`s land on surviving rows. Add uniqueness guard (normalized name + date).
- [ ] 1b. Backfill `meet_id` on the 2.2M athlete-history rows by normalized name + date
      window (±3d, use `end_date`). Measured: 10,292 unambiguous matches vs 17 ambiguous.
      Write the match set to a file, review, then apply in batches. Handle the 17 by hand.
- [ ] 1c. Resolve the 15 name/date-mismatch meets (results exist under different string).
- [ ] 1d. Null/fix the 222 orphan rows (meet_ids 94641, 94729).
- [ ] 1e. Migrate `getEventsByMeetWithGender` + `getEventResults`
      (`frontend/services/database-supabase.ts`) to query by `meet_id`
      (fallback to name+date only when `meet_id` misses, during transition).
- [ ] 1f. Add index + FK `results.meet_id → meets.meet_id`.

## Phase 2 — Fix the feeders (so next season self-heals)

- [ ] 2a. Season bug: derive `season` from date + type in `scrape_meets.js` (line 490) —
      never hardcode. Backfill the 1,428 bare `"indoor"` labels from meet dates.
- [ ] 2b. Completed-meet link pass: make link capture for *completed* meets first-class
      (the `last_week` pass in sync-results.yml is the seed of this) so `tfrrs_url`
      fills reliably; that's what makes `sync-weekend-results.js` skip fuzzy matching.
- [ ] 2c. Archive legacy scrapers (`entries/`, `live/`, `final/`, `athletic-net/`,
      `tools/scrape-and-import.js`, `athlete-scraper/`) into `scrapers/legacy/` with a
      README, so the active tree contains only what runs.

## Phase 3 — Off-season backfill (the 830 missed meets)

- [ ] 3a. Profile the 830: by season, level, and whether USTFCCCA/TFRRS still lists them.
- [ ] 3b. Backfill `tfrrs_url` for those meets (`meets/backfill_result_links.js`).
- [ ] 3c. Run the meet-scraper against them as a **resumable background job** (checkpointed,
      rate-limited, off-hours) writing straight to the DB. Accept that some meets simply
      aren't on TFRRS — mark them `results_status='unavailable'` and stop rechecking.

## Phase 4 — Athlete identity cleanup

- [ ] 4a. Merge the 85 duplicate-TFRRS-id athletes (repoint results/PRs/relays, delete dupes).
- [ ] 4b. Design the merge rule for ~19.4k name+school dup rows (many are unattached-vs-
      attached splits of the same person). Dry-run report first — this needs eyeballing.
- [ ] 4c. Add constraints: unique `tfrrs_athlete_id` (where not null); importer must match
      unattached athletes by normalized name before creating.

## Phase 5 — Schema hygiene

- [ ] 5a. Decide per empty table: drop (`events`, `event_entries`, `meet_entries`,
      `conferences`, `conference_memberships`, `regions`, `external_ids`) or commit with a
      real plan. Default: drop — they can come back via migration when actually needed.
- [ ] 5b. Regenerate types (`npm run gen:types`) after schema changes.

## Done
- [x] 2026-07-09 — `meet_url` junk cleanup: 182 athletic.net hubs → `/results`, 89 junk
      links nulled (`meets/fix_meet_urls.js`). Note: `meet_url` is the timing tap-through
      link only; not a results source.

## Superseded (kept so nobody re-derives these wrong turns)
- "~10,300 empty meets need linking" — measured `meet_id` coverage, which the app doesn't
  read. Real user-facing number: 845 look empty (830 missing + 15 mismatched).
- `tools/scrape-and-import.js` as "the engine" — it's a Feb-2026 one-off; the engine is
  `tfrrs/meet-scraper/sync-weekend-results.js`.
- Treating season labels as data-only cleanup — it's a code bug first (`scrape_meets.js:490`).
