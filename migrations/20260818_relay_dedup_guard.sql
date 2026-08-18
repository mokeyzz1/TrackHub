-- Prevent the same relay performance being stored twice.
--
-- APPLIED 2026-08-18 out-of-band (CREATE INDEX CONCURRENTLY cannot run inside the migration
-- runner's transaction). Built in 1.4s. This file is the record.
--
-- WHY: relay_results had NO database-level duplicate protection at all, unlike `results`. Every
-- safeguard was script logic -- and script logic failed three times in one session (raw mark
-- comparison, full-name lineup signature, missing round labels). 40,210 duplicate rows were
-- removed before this could be built.
--
-- THE PREDICATE IS THE WHOLE DESIGN. Each clause exists because omitting it broke the build:
--
--   mark_raw ~ '[0-9]'      A school enters A/B/C/D squads. When they all scratch they share
--                           mark='DNS' and place=NULL and are IDENTICAL on every indexed column
--                           while being four different teams. Deduping those would have deleted
--                           29,184 rows, 93% of whose legs named athletes absent from the
--                           survivor. Status codes must stay OUTSIDE the index. A real time plus
--                           a place, though, cannot be shared by two squads -- that is one race
--                           recorded twice.
--   team_id IS NOT NULL     1,418 relays have no resolved team (juco, legs not in the DB). Under
--                           NULLS NOT DISTINCT two NULL teams match each other, so including them
--                           would merge different schools. The first build failed on exactly
--                           this: key (1316, 49, null, 1, 11:01.70, null).
--   meet_id IS NOT NULL     unlinked relays are not comparable as meet results.
--
-- GENERAL RULE, learned three times today: **a guard's WHERE must match the cleanup's WHERE.**
-- Any row the cleanup skipped will violate a guard that does not skip it too. This bit on
-- `squad IS NOT NULL` (26,494 rows), then `team_id IS NOT NULL` (above), and on the results index
-- via `meet_id IS NOT NULL` (athlete-history rows).
--
-- NULLS NOT DISTINCT is required (PG15+; this instance is 17.6) because place and round are
-- nullable and default NULL semantics would let duplicates through.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS relay_results_no_exact_duplicate
  ON relay_results (meet_id, event_type_id, team_id, place, mark_raw, round)
  NULLS NOT DISTINCT
  WHERE mark_raw ~ '[0-9]' AND team_id IS NOT NULL AND meet_id IS NOT NULL;

-- Verified immediately: re-inserting an existing relay now fails with
--   duplicate key value violates unique constraint "relay_results_no_exact_duplicate"
