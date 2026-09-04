-- Emergency rollback for 20260904094906_add_canonical_fact_lookup_indexes.sql.
-- Run with autocommit enabled; DROP INDEX CONCURRENTLY cannot run inside a transaction block.

DROP INDEX CONCURRENTLY IF EXISTS public.idx_results_event_type_athlete_meet;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_relay_results_event_type_team_meet;
