-- Thirty pre-2026-08-29 ingestion claims attached older history rows to newer meets when the
-- athlete, event, and mark happened to match. The source observation and the retained canonical
-- row describe different performances (different date/meet and usually different place/round).
-- Preserve the history row by returning it to its original unlinked state, create the observed
-- current-meet fact, and move only that source record's private provenance to the new fact.
--
-- This reuses ingest.fact_cleanup_archive. It does not create another repair/archive table.

DO $$
DECLARE
  operation constant text := '20260902_split_invalid_history_claims';
  affected_ids constant bigint[] := ARRAY[
    2257246,2880339,3602436,3732162,4037287,4335324,4466081,4477303,4525573,4615558,
    4650530,4656831,4656833,4688609,4712038,4757163,4807893,4812167,4884521,4893790,
    4919642,4930288,4933599,4933648,4933676,4945490,4970080,5024550,5025656,5025674
  ]::bigint[];
  rec record;
  new_result_id bigint;
  new_result_ids bigint[] := ARRAY[]::bigint[];
  row_count integer;
BEGIN
  SELECT count(*)::integer INTO row_count
    FROM public.results
   WHERE result_id = ANY(affected_ids);

  -- Empty development databases are valid migration targets.
  IF row_count = 0 THEN
    RETURN;
  END IF;
  IF row_count <> 30 THEN
    RAISE EXCEPTION 'expected all 30 reviewed history rows, found %', row_count;
  END IF;

  SELECT count(*)::integer INTO row_count
    FROM ingest.source_links
   WHERE result_id = ANY(affected_ids);

  -- Replay after a completed repair is a no-op only when its full archive is present.
  IF row_count = 0 THEN
    IF (SELECT count(*) FROM ingest.fact_cleanup_archive WHERE operation_key = operation) = 122
       AND (SELECT count(*) FROM public.results
             WHERE result_id = ANY(affected_ids) AND meet_id IS NULL) = 30 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'reviewed history rows have no current source links and no complete repair archive';
  END IF;
  IF row_count <> 30 THEN
    RAISE EXCEPTION 'expected one source link for each reviewed row, found % links', row_count;
  END IF;

  IF (SELECT count(DISTINCT source_record_id) FROM ingest.source_links
       WHERE result_id = ANY(affected_ids)) <> 30 THEN
    RAISE EXCEPTION 'reviewed rows do not resolve to 30 distinct source records';
  END IF;
  IF (SELECT count(*) FROM ingest.observations
       WHERE canonical_result_id = ANY(affected_ids)) <> 62 THEN
    RAISE EXCEPTION 'expected 62 reviewed observation rows';
  END IF;
  IF (SELECT count(*) FROM ingest.observations
       WHERE canonical_result_id = ANY(affected_ids)
         AND decision = 'claim'
         AND decision_reason = 'unlinked_history_exact_match') <> 30 THEN
    RAISE EXCEPTION 'expected exactly one invalid claim observation per reviewed row';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.results r
      JOIN ingest.observations o
        ON o.canonical_result_id = r.result_id
       AND o.decision = 'claim'
       AND o.decision_reason = 'unlinked_history_exact_match'
     WHERE r.result_id = ANY(affected_ids)
       AND r.meet_id IS DISTINCT FROM o.target_meet_id
  ) THEN
    RAISE EXCEPTION 'a reviewed row is no longer attached to its claimed target meet';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.results old
      JOIN ingest.source_links sl ON sl.result_id = old.result_id
      JOIN ingest.source_records sr ON sr.source_record_id = sl.source_record_id
      JOIN ingest.observations o
        ON o.source_record_id = sl.source_record_id
       AND o.canonical_result_id = old.result_id
       AND o.decision = 'claim'
       AND o.decision_reason = 'unlinked_history_exact_match'
      JOIN public.results current
        ON current.result_id <> old.result_id
       AND current.athlete_id IS NOT DISTINCT FROM o.target_athlete_id
       AND current.meet_id IS NOT DISTINCT FROM o.target_meet_id
       AND current.event_type_id IS NOT DISTINCT FROM o.event_type_id
       AND lower(regexp_replace(current.mark_raw, '[ah]$', '', 'g'))
           IS NOT DISTINCT FROM lower(regexp_replace(o.mark_raw, '[ah]$', '', 'g'))
       AND current.place IS NOT DISTINCT FROM o.place
       AND current.round IS NOT DISTINCT FROM o.round
     WHERE old.result_id = ANY(affected_ids)
  ) THEN
    RAISE EXCEPTION 'a replacement performance already exists; review instead of splitting';
  END IF;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.results', result_id::text, to_jsonb(r)
    FROM public.results r
   WHERE result_id = ANY(affected_ids)
  ON CONFLICT DO NOTHING;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'ingest.source_links', source_record_id::text, to_jsonb(sl)
    FROM ingest.source_links sl
   WHERE result_id = ANY(affected_ids)
  ON CONFLICT DO NOTHING;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'ingest.observations', observation_id::text, to_jsonb(o)
    FROM ingest.observations o
   WHERE canonical_result_id = ANY(affected_ids)
  ON CONFLICT DO NOTHING;

  IF (SELECT count(*) FROM ingest.fact_cleanup_archive WHERE operation_key = operation) <> 122 THEN
    RAISE EXCEPTION 'repair archive must contain 122 rows before mutation';
  END IF;

  FOR rec IN
    SELECT old.result_id AS old_result_id,
           sl.source_record_id,
           o.observation_id AS claim_observation_id,
           o.target_athlete_id,
           o.target_team_id,
           o.raw_event_name,
           o.mark_raw,
           o.mark_seconds,
           o.mark_meters,
           o.place,
           o.round,
           o.result_date,
           o.target_meet_id,
           o.event_type_id,
           sr.payload
      FROM public.results old
      JOIN ingest.source_links sl ON sl.result_id = old.result_id
      JOIN ingest.source_records sr ON sr.source_record_id = sl.source_record_id
      JOIN ingest.observations o
        ON o.source_record_id = sl.source_record_id
       AND o.canonical_result_id = old.result_id
       AND o.decision = 'claim'
       AND o.decision_reason = 'unlinked_history_exact_match'
     WHERE old.result_id = ANY(affected_ids)
     ORDER BY old.result_id
  LOOP
    UPDATE public.results
       SET meet_id = NULL
     WHERE result_id = rec.old_result_id
       AND meet_id = rec.target_meet_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'reviewed history row % changed before split', rec.old_result_id;
    END IF;

    INSERT INTO public.results
      (athlete_id, team_id, event_name, mark_raw, mark_seconds, mark_meters, mark_feet,
       wind, round, date, season_code, meet_name, meet_location, place, total_competitors,
       is_pr, is_season_best, meet_id, event_id, event_type_id, environment)
    VALUES
      (rec.target_athlete_id,
       rec.target_team_id,
       COALESCE(NULLIF(rec.payload->>'event_name', ''), rec.raw_event_name),
       rec.mark_raw,
       rec.mark_seconds,
       rec.mark_meters,
       NULLIF(rec.payload->>'mark_feet', ''),
       NULLIF(rec.payload->>'wind', ''),
       NULLIF(rec.round, ''),
       rec.result_date,
       NULLIF(rec.payload->>'season_code', ''),
       NULLIF(rec.payload->>'meet_name', ''),
       NULLIF(rec.payload->>'meet_location', ''),
       rec.place,
       NULLIF(rec.payload->>'total_competitors', '')::integer,
       CASE WHEN lower(rec.payload->>'is_pr') IN ('true', 't', '1') THEN true ELSE false END,
       CASE WHEN lower(rec.payload->>'is_season_best') IN ('true', 't', '1') THEN true ELSE false END,
       rec.target_meet_id,
       NULLIF(rec.payload->>'event_id', '')::integer,
       rec.event_type_id,
       NULLIF(rec.payload->>'environment', ''))
    RETURNING result_id INTO new_result_id;

    new_result_ids := array_append(new_result_ids, new_result_id);

    UPDATE ingest.source_links
       SET result_id = new_result_id,
           last_seen_at = now()
     WHERE source_record_id = rec.source_record_id
       AND result_id = rec.old_result_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'source link for history row % changed before split', rec.old_result_id;
    END IF;

    UPDATE ingest.observations
       SET canonical_result_id = new_result_id,
           decision = CASE WHEN observation_id = rec.claim_observation_id THEN 'insert' ELSE decision END,
           decision_reason = CASE
             WHEN observation_id = rec.claim_observation_id
             THEN 'repaired_invalid_history_claim_split'
             ELSE decision_reason
           END,
           confidence = CASE WHEN observation_id = rec.claim_observation_id THEN 1 ELSE confidence END
     WHERE source_record_id = rec.source_record_id
       AND canonical_result_id = rec.old_result_id;
  END LOOP;

  IF cardinality(new_result_ids) <> 30 THEN
    RAISE EXCEPTION 'expected 30 replacement results, inserted %', cardinality(new_result_ids);
  END IF;
  IF (SELECT count(*) FROM public.results
       WHERE result_id = ANY(affected_ids) AND meet_id IS NULL) <> 30 THEN
    RAISE EXCEPTION 'all 30 history rows must be restored to an unlinked state';
  END IF;
  IF EXISTS (SELECT 1 FROM ingest.source_links WHERE result_id = ANY(affected_ids))
     OR EXISTS (SELECT 1 FROM ingest.observations WHERE canonical_result_id = ANY(affected_ids)) THEN
    RAISE EXCEPTION 'old history rows still have current-meet provenance';
  END IF;
  IF (SELECT count(*) FROM ingest.source_links WHERE result_id = ANY(new_result_ids)) <> 30
     OR (SELECT count(*) FROM ingest.observations
          WHERE canonical_result_id = ANY(new_result_ids)) <> 62 THEN
    RAISE EXCEPTION 'replacement provenance counts are incomplete';
  END IF;
END
$$;
