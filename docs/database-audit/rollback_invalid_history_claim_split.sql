-- Emergency reversal for operation 20260902_split_invalid_history_claims.
-- Run only after the corresponding guarded migration has completed successfully.

DO $$
DECLARE
  operation constant text := '20260902_split_invalid_history_claims';
  new_result_ids bigint[];
  current_new_link_count integer;
BEGIN
  IF (SELECT count(*) FROM ingest.fact_cleanup_archive WHERE operation_key = operation) <> 122 THEN
    RAISE EXCEPTION 'complete 122-row cleanup archive is required for rollback';
  END IF;
  IF (SELECT count(*) FROM ingest.fact_cleanup_archive
       WHERE operation_key = operation AND source_table = 'public.results') <> 30
     OR (SELECT count(*) FROM ingest.fact_cleanup_archive
          WHERE operation_key = operation AND source_table = 'ingest.source_links') <> 30
     OR (SELECT count(*) FROM ingest.fact_cleanup_archive
          WHERE operation_key = operation AND source_table = 'ingest.observations') <> 62 THEN
    RAISE EXCEPTION 'cleanup archive relation counts are incomplete';
  END IF;

  WITH archived_links AS (
    SELECT (row_data->>'source_record_id')::bigint AS source_record_id,
           (row_data->>'result_id')::bigint AS old_result_id
      FROM ingest.fact_cleanup_archive
     WHERE operation_key = operation
       AND source_table = 'ingest.source_links'
  )
  SELECT count(*)::integer,
         array_agg(sl.result_id ORDER BY sl.result_id)
    INTO current_new_link_count, new_result_ids
    FROM archived_links a
    JOIN ingest.source_links sl USING (source_record_id)
   WHERE sl.result_id IS DISTINCT FROM a.old_result_id;

  -- A completed rollback is a safe replay no-op.
  IF current_new_link_count = 0 THEN
    IF (SELECT count(*)
          FROM ingest.fact_cleanup_archive a
          JOIN public.results r ON r.result_id = a.source_pk::bigint
         WHERE a.operation_key = operation
           AND a.source_table = 'public.results'
           AND r.meet_id IS NOT DISTINCT FROM (a.row_data->>'meet_id')::integer) = 30 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'no replacement links found and historical rows are not fully restored';
  END IF;
  IF current_new_link_count <> 30 OR cardinality(new_result_ids) <> 30 THEN
    RAISE EXCEPTION 'expected 30 replacement links, found %', current_new_link_count;
  END IF;

  UPDATE ingest.observations o
     SET decision = a.row_data->>'decision',
         decision_reason = a.row_data->>'decision_reason',
         confidence = (a.row_data->>'confidence')::numeric,
         canonical_result_id = (a.row_data->>'canonical_result_id')::bigint,
         canonical_relay_id = (a.row_data->>'canonical_relay_id')::integer
    FROM ingest.fact_cleanup_archive a
   WHERE a.operation_key = operation
     AND a.source_table = 'ingest.observations'
     AND o.observation_id = a.source_pk::bigint;

  UPDATE ingest.source_links sl
     SET entity_type = a.row_data->>'entity_type',
         result_id = (a.row_data->>'result_id')::bigint,
         relay_result_id = (a.row_data->>'relay_result_id')::integer,
         link_status = a.row_data->>'link_status',
         first_linked_at = (a.row_data->>'first_linked_at')::timestamptz,
         last_seen_at = (a.row_data->>'last_seen_at')::timestamptz
    FROM ingest.fact_cleanup_archive a
   WHERE a.operation_key = operation
     AND a.source_table = 'ingest.source_links'
     AND sl.source_record_id = a.source_pk::bigint;

  DELETE FROM public.results
   WHERE result_id = ANY(new_result_ids);
  IF (SELECT count(*) FROM public.results WHERE result_id = ANY(new_result_ids)) <> 0 THEN
    RAISE EXCEPTION 'replacement results remain after rollback delete';
  END IF;

  UPDATE public.results r
     SET meet_id = (a.row_data->>'meet_id')::integer
    FROM ingest.fact_cleanup_archive a
   WHERE a.operation_key = operation
     AND a.source_table = 'public.results'
     AND r.result_id = a.source_pk::bigint;

  IF (SELECT count(*)
        FROM ingest.fact_cleanup_archive a
        JOIN public.results r ON r.result_id = a.source_pk::bigint
       WHERE a.operation_key = operation
         AND a.source_table = 'public.results'
         AND r.meet_id IS NOT DISTINCT FROM (a.row_data->>'meet_id')::integer) <> 30 THEN
    RAISE EXCEPTION 'historical meet assignments were not fully restored';
  END IF;
END
$$;
