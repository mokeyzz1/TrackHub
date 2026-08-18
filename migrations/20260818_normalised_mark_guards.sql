-- Make duplicates STRUCTURALLY impossible, not something scripts chase afterwards.
--
-- APPLIED 2026-08-18 out-of-band (CREATE INDEX CONCURRENTLY cannot run in the runner's
-- transaction). results 29.9s, relay_results 6.0s. Zero violations on either -- nothing had to be
-- deleted to make room.
--
-- OWNER, 2026-08-18: "why can't we just have something there so it can prevent duplicates from
-- happening... because then you keep deleting and re-deleting and going back and forth."
-- Correct. Scripts are cleanup; constraints are prevention. This is the prevention.
--
-- THE GAP THIS CLOSES. The earlier guards keyed on `mark_raw`, so the SAME performance written by
-- two sources produced two different keys and both were accepted:
--     TFRRS        10.35
--     athletic.net 10.35a      <- 'a' = auto/FAT timing
-- 32,229 athletic.net marks carry that suffix against 1,313 from TFRRS. This was the documented
-- blocker on the dual-source plan: neither source could safely write into the other's meet.
--
-- WHY AN EXPRESSION INDEX RATHER THAN A GENERATED COLUMN. `mark_norm GENERATED ALWAYS AS (...)
-- STORED` would be tidier to read, but adding a stored column rewrites the whole table under an
-- ACCESS EXCLUSIVE lock -- 3.3M rows on a weak instance with a live app. The expression index
-- gives identical enforcement with a CONCURRENT build and no rewrite.
--
-- Verified immediately after creation: inserting "22.82a" where "22.82" already existed was
-- REJECTED.
--
-- STILL NOT COVERED (deliberately):
--   * Finals + Heat N -- those rows differ in `round` and genuinely mean one race in a timed
--     final. No constraint can express that; it is collapsed at scrape time by
--     scrapers/shared/collapse_duplicate_rounds.js (U8).
--   * athlete-history rows (meet_id IS NULL) -- 1,524 groups are duplicates of each other, so a
--     guard cannot be added until those are cleaned.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS results_no_dup_normmark
  ON results (athlete_id, meet_id, event_type_id,
              (lower(regexp_replace(mark_raw, '[ah]$', ''))), place, round)
  NULLS NOT DISTINCT
  WHERE meet_id IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS relay_no_dup_normmark
  ON relay_results (meet_id, event_type_id, team_id, place,
                    (lower(regexp_replace(mark_raw, '[ah]$', ''))), round)
  NULLS NOT DISTINCT
  WHERE mark_raw ~ '[0-9]' AND team_id IS NOT NULL AND meet_id IS NOT NULL;

-- The earlier raw-mark indexes (results_no_exact_duplicate, relay_results_no_exact_duplicate) are
-- now strict subsets of these and are kept only as belt-and-braces; they can be dropped if index
-- maintenance cost ever matters on this instance.
