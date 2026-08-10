-- School pages were taking seconds to load (owner-reported). APPLIED to prod 2026-08-09.
--
-- CAUSE: the school page filters `results` by the school's team_ids, but `results` had indexes on
-- athlete_id, meet_id, date, event_name, meet_name, round and season_code — and NONE on team_id.
-- Every school page therefore scanned a 3.7M-row table. Measured: 2,473 ms for ONE of the several
-- queries a school page runs.
--
-- FIX: index team_id (+ date, since these queries sort by date DESC). Measured after: 145 ms.
-- ~17x faster. Created CONCURRENTLY so it never locks the table.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_results_team_id   ON public.results USING btree (team_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_results_team_date ON public.results USING btree (team_id, date DESC);

-- season_code is 100% NULL, so this index could never match anything — pure write overhead.
DROP INDEX CONCURRENTLY IF EXISTS idx_results_season;

-- NOT KEPT: an index on (event_type_id, environment). It was tried and MADE THINGS WORSE —
-- a leaderboard-style scan went from 8s (seq scan) to 22.5s, because matching 185k rows via an
-- index means that many scattered heap fetches, and this instance's I/O is slow enough that a
-- sequential scan wins. Lesson: on this DB, indexes help high-selectivity lookups (one team,
-- one athlete) and hurt broad scans. Always measure before keeping one.
