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
-- WHY AN EXPRESSION INDEX RATHER THAN A GENERATED COLUMN (checked against the Postgres docs,
-- 2026-08-18, rather than decided on instinct):
--   * The docs name this exact use case: a UNIQUE expression index "can be used to enforce
--     constraints that are not definable as a simple unique constraint", e.g. preventing rows
--     "whose values differ only in case". `10.35a` vs `10.35` is that, so this is an intended
--     pattern rather than a workaround.
--   * COST, stated honestly: "index expressions are relatively expensive to maintain because the
--     derived expression(s) must be computed for each row insertion and non-HOT update." Every
--     insert now runs that regex. Acceptable HERE because writes are weekly batch scrapes, not
--     high-frequency transactions. On a write-heavy table the trade would go the other way.
--   * A `GENERATED ALWAYS AS (...) STORED` column would NOT avoid that cost -- it has the same
--     per-write computation, plus disk, plus a full table rewrite under an ACCESS EXCLUSIVE lock
--     (3.3M rows, weak instance, live app).
--   * PG18's VIRTUAL generated columns cut write overhead but CANNOT BE INDEXED, so they are
--     useless for a uniqueness guard. This instance is 17.6 in any case.
-- Refs: postgresql.org/docs/current/indexes-expressional.html · .../indexes-unique.html ·
--       .../ddl-generated-columns.html
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
