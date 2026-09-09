-- Emergency rollback for 20260904135909_remove_superseded_lookup_indexes.sql.
-- Run with autocommit enabled; CREATE INDEX CONCURRENTLY cannot run in a transaction.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_results_meet_name
  ON public.results USING btree (meet_name);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_results_athlete_event
  ON public.results USING btree (athlete_id, event_name);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_external_ids_source
  ON public.external_ids USING btree (source);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_external_ids_key
  ON public.external_ids USING btree (external_key);
