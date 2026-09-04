-- The relay half of 20260904094906 did not improve the measured canonical lookup.
-- PostgreSQL continued to combine the existing meet_id and team_id indexes, while the new
-- event_type-leading index remained unused. Remove it to avoid unnecessary write and storage cost.
--
-- IMPORTANT: run with autocommit enabled; DROP INDEX CONCURRENTLY cannot run in a transaction.

DROP INDEX CONCURRENTLY IF EXISTS public.idx_relay_results_event_type_team_meet;
