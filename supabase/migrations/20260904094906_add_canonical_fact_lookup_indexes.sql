-- Canonical fact lookup indexes, measured against the live workload on 2026-09-04.
--
-- IMPORTANT: this file contains CREATE INDEX CONCURRENTLY and must run with autocommit enabled;
-- PostgreSQL does not allow concurrent index builds inside a transaction block.
--
-- The individual fact writer looks up rows by event types, athletes, and meets. Before this index,
-- a representative live plan used idx_results_athlete_id, fetched 11,307 rows, discarded 11,123,
-- and spent about 1.5 seconds in the results scan to return 184 rows.
--
-- event_type_id is first so each index also covers the corresponding foreign key. The second and
-- third keys supply the selectivity that a previously tested event_type-only index lacked.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_results_event_type_athlete_meet
  ON public.results USING btree (event_type_id, athlete_id, meet_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_relay_results_event_type_team_meet
  ON public.relay_results USING btree (event_type_id, team_id, meet_id);
