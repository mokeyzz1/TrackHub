-- Guard against the same performance being inserted twice.
--
-- APPLIED 2026-08-10 out-of-band, not through the migration runner: CREATE INDEX CONCURRENTLY
-- cannot run inside a transaction block, and the runner wraps everything in one. The app is
-- live, so a plain CREATE INDEX (which takes an exclusive lock on a 3.3M-row table) was not
-- acceptable. Build took 62s concurrently. This file is the record; to recreate it elsewhere,
-- run the statement below on its own connection, outside a transaction.
--
-- WHY IT EXISTS
-- DUP-2 removed 452,748 duplicate result rows. Nothing had prevented them: the only unique index on
-- `results` was the primary key, a serial, which never compares content. Two mechanisms:
--   1. one TFRRS page captured twice under different round labels (Finals + Heat N)
--   2. a whole meet imported twice -- byte-identical rows differing only in `date`
-- This index stops (2) dead: a re-import now raises a unique violation instead of silently
-- doubling the meet.
--
-- THREE DESIGN POINTS, each of which cost a failed attempt:
--
-- * `round` is INCLUDED on purpose. Without it the index rejects the 185 legitimate cases where
--   an athlete ran the same time and placed the same in both a prelim and a final. That is real
--   data. Including `round` keeps those legal while still blocking exact re-inserts.
--
-- * NULLS NOT DISTINCT is required (PG15+; this instance is 17.6). `place`, `round` and
--   `event_type_id` are all nullable, and under default NULL semantics two rows that are both
--   NULL there count as different and slide straight through the index.
--
-- * The index MUST be partial on `meet_id IS NOT NULL`. `results` is dual-purpose: rows with a
--   NULL meet_id are athlete-history marks, and 1,524 groups of those are duplicates of each
--   other. A non-partial build fails outright ("could not create unique index"). Those history
--   duplicates are a separate open issue -- do not assume this index covers them.
--
-- WHAT THIS DOES NOT COVER
-- Mechanism (1). Those rows differ in `round`, so they are legal here by design. That has to be
-- caught at import time by collapsing rows sharing (athlete, event_type, mark, place) that
-- differ only by round label -- the same rule the DUP-2 cleanup used, applied at write time.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS results_no_exact_duplicate
  ON results (athlete_id, meet_id, event_type_id, mark_raw, place, round)
  NULLS NOT DISTINCT
  WHERE meet_id IS NOT NULL;

-- Verified working immediately after creation: re-inserting an existing row now fails with
--   ERROR: duplicate key value violates unique constraint "results_no_exact_duplicate"
--   DETAIL: Key (athlete_id, meet_id, event_type_id, mark_raw, place, round)
--           =(93, 11876, 23, 21.19, 3, Finals) already exists.
