-- Emergency rollback for 20260904095259_drop_unhelpful_relay_fact_lookup_index.sql.
-- Run with autocommit enabled; CREATE INDEX CONCURRENTLY cannot run in a transaction.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_relay_results_event_type_team_meet
  ON public.relay_results USING btree (event_type_id, team_id, meet_id);
