-- Read-only contract check for the two private recovery queues.
-- No queue row, lease, policy, or grant is changed by this script.

SELECT status, coverage_status, relay_coverage_status, count(*) AS rows
FROM ingest.recovery_queue
GROUP BY status, coverage_status, relay_coverage_status
ORDER BY status, coverage_status, relay_coverage_status;

SELECT status, count(*) AS rows
FROM ingest.event_recovery_queue
GROUP BY status
ORDER BY status;

SELECT
  count(*) AS event_queue_rows,
  count(*) FILTER (WHERE event_type_id IS NOT NULL) AS typed_event_rows,
  count(*) FILTER (WHERE individual_fact_count > 0) AS individual_work_rows,
  count(*) FILTER (WHERE parent_fact_count > 0) AS parent_work_rows,
  count(*) FILTER (WHERE leg_fact_count > 0) AS relay_leg_work_rows
FROM ingest.event_recovery_queue;
