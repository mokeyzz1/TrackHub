-- Remove four lookup indexes whose access paths are superseded by retained indexes or canonical
-- identity semantics. Reviewed against live index statistics, pg_stat_statements, repository
-- queries, and EXPLAIN plans on 2026-09-04.
--
-- IMPORTANT: run with autocommit enabled; DROP INDEX CONCURRENTLY cannot run in a transaction.

-- Left-prefix duplicate of idx_results_meet_name_date (meet_name, date). The retained composite
-- index serves both meet-name-only and meet-name-plus-date predicates.
DROP INDEX CONCURRENTLY IF EXISTS public.idx_results_meet_name;

-- No current reader filters on athlete_id plus the raw event_name. Canonical event filtering uses
-- event_type_id and is now served by idx_results_event_type_athlete_meet; athlete-only reads retain
-- idx_results_athlete_id and idx_results_athlete_date.
DROP INDEX CONCURRENTLY IF EXISTS public.idx_results_athlete_event;

-- external IDs are source-scoped identities. The unique (source, external_key) index serves all
-- current lookups and enforces the actual identity key.
DROP INDEX CONCURRENTLY IF EXISTS public.idx_external_ids_source;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_external_ids_key;
