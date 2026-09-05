-- Read-only; no age-based status changes or historical target rewrites.
SELECT mode, status, count(*)::text AS runs,
       count(*) FILTER (WHERE finished_at IS NULL)::text AS without_finish,
       count(*) FILTER (WHERE status = 'running' AND started_at < now() - interval '24 hours')::text AS running_over_24h
FROM ingest.runs GROUP BY mode, status ORDER BY mode, status;

SELECT count(*)::text AS observations,
       count(*) FILTER (WHERE o.source <> r.source AND r.source <> 'mixed')::text AS run_source_mismatches,
       count(*) FILTER (WHERE o.source <> s.source)::text AS evidence_source_mismatches,
       count(*) FILTER (WHERE o.entity_type = 'individual_result' AND o.canonical_relay_id IS NOT NULL)::text AS individual_wrong_target,
       count(*) FILTER (WHERE o.entity_type = 'relay_result' AND o.canonical_result_id IS NOT NULL)::text AS relay_parent_wrong_target
FROM ingest.observations o
JOIN ingest.runs r USING (run_id)
JOIN ingest.source_records s USING (source_record_id);

SELECT o.target_meet_id, coalesce(cr.meet_id, rr.meet_id) AS canonical_meet_id,
       o.entity_type, count(*)::text AS observations,
       count(DISTINCT o.run_id)::text AS runs,
       count(DISTINCT o.source_record_id)::text AS source_records,
       count(DISTINCT o.canonical_result_id)::text AS individual_facts,
       count(DISTINCT o.canonical_relay_id)::text AS relay_facts,
       count(*) FILTER (WHERE o.source_snapshot_hash IS NOT NULL)::text AS version_bound
FROM ingest.observations o
LEFT JOIN public.results cr ON cr.result_id = o.canonical_result_id
LEFT JOIN public.relay_results rr ON rr.relay_result_id = o.canonical_relay_id
WHERE (o.canonical_result_id IS NOT NULL AND cr.meet_id IS DISTINCT FROM o.target_meet_id)
   OR (o.canonical_relay_id IS NOT NULL AND rr.meet_id IS DISTINCT FROM o.target_meet_id)
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
