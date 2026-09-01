-- Meet 13048 is the NJCAA Division I Outdoor Championships. Its individual facts are NJCAA,
-- but 19 legacy 4x400 relay parents were copied from the CAA meet 13058 on the same date. Each
-- contaminated parent has exactly one matching parent on meet 13058 and no private provenance.
-- Archive and remove only those exact cross-meet copies; the reviewed TFRRS NJCAA relay source
-- remains private until its 4x100 recovery is promoted separately.

DO $$
DECLARE
  operation constant text := '20260829_njcaa_cross_meet_4x400';
  bad_parent_ids constant integer[] := ARRAY[
    224421,224422,224423,224424,224425,224426,224427,224428,224429,
    224441,224442,224443,224444,224445,224446,224447,224448,224449,224450
  ];
  present_count integer;
  exact_copy_count integer;
  lineup_count integer;
  private_reference_count integer;
BEGIN
  SELECT count(*)::integer INTO present_count
    FROM public.relay_results
   WHERE meet_id = 13048 AND relay_result_id = ANY(bad_parent_ids);

  -- Clean local/test databases and already-repaired production are both valid outcomes.
  IF present_count = 0 THEN
    RETURN;
  END IF;
  IF present_count <> 19 THEN
    RAISE EXCEPTION 'expected 19 reviewed NJCAA contaminated parents, found %', present_count;
  END IF;

  WITH matches AS (
    SELECT bad.relay_result_id,count(good.relay_result_id)::integer AS copies
      FROM public.relay_results bad
      LEFT JOIN public.relay_results good
        ON good.meet_id = 13058
       AND good.team_id = bad.team_id
       AND good.event_type_id = bad.event_type_id
       AND lower(trim(good.mark_raw)) = lower(trim(bad.mark_raw))
       AND good.mark_seconds IS NOT DISTINCT FROM bad.mark_seconds
       AND good.place IS NOT DISTINCT FROM bad.place
       AND good.round IS NOT DISTINCT FROM bad.round
     WHERE bad.meet_id = 13048
       AND bad.relay_result_id = ANY(bad_parent_ids)
     GROUP BY bad.relay_result_id
  )
  SELECT count(*) FILTER (WHERE copies = 1)::integer INTO exact_copy_count FROM matches;
  IF exact_copy_count <> 19 THEN
    RAISE EXCEPTION 'all 19 NJCAA contaminated parents must have one exact CAA copy, matched %', exact_copy_count;
  END IF;

  SELECT count(*)::integer INTO lineup_count
    FROM public.relay_athletes
   WHERE relay_result_id = ANY(bad_parent_ids);
  IF lineup_count <> 76 THEN
    RAISE EXCEPTION 'expected 76 contaminated NJCAA lineup rows, found %', lineup_count;
  END IF;

  SELECT
    (SELECT count(*) FROM ingest.source_links WHERE relay_result_id = ANY(bad_parent_ids))
    + (SELECT count(*) FROM ingest.observations WHERE canonical_relay_id = ANY(bad_parent_ids))
    INTO private_reference_count;
  IF private_reference_count <> 0 THEN
    RAISE EXCEPTION 'contaminated NJCAA facts unexpectedly have % private provenance references', private_reference_count;
  END IF;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.relay_athletes', relay_athlete_id::text, to_jsonb(a)
    FROM public.relay_athletes a
   WHERE relay_result_id = ANY(bad_parent_ids)
  ON CONFLICT DO NOTHING;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.relay_results', relay_result_id::text, to_jsonb(r)
    FROM public.relay_results r
   WHERE meet_id = 13048 AND relay_result_id = ANY(bad_parent_ids)
  ON CONFLICT DO NOTHING;

  DELETE FROM public.relay_athletes WHERE relay_result_id = ANY(bad_parent_ids);
  DELETE FROM public.relay_results WHERE meet_id = 13048 AND relay_result_id = ANY(bad_parent_ids);

  IF (SELECT count(*) FROM ingest.fact_cleanup_archive WHERE operation_key = operation) <> 95 THEN
    RAISE EXCEPTION 'NJCAA cleanup archive must contain 95 rows';
  END IF;
END
$$;
