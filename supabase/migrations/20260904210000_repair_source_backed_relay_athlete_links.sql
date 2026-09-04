BEGIN;

-- Two source-backed relay-leg links only. The source record, leg order, source ID, and
-- display name must still agree before either row is changed. Complete before-images are
-- stored in the existing private archive so this remains reversible without a new table.
DO $$
DECLARE
  operation constant text := '20260904_repair_source_backed_relay_athlete_links_v1';
  archive_count integer;
  updated_count integer;
BEGIN
  CREATE TEMP TABLE _relay_link_repair (
    relay_athlete_id integer PRIMARY KEY,
    source_record_id bigint NOT NULL,
    relay_result_id integer NOT NULL,
    old_athlete_id integer NOT NULL,
    target_athlete_id integer NOT NULL,
    source_key text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _relay_link_repair
    (relay_athlete_id, source_record_id, relay_result_id, old_athlete_id, target_athlete_id, source_key)
  VALUES
    (445111, 137870, 215676, 48608, 193435, '9239760'),
    (467775, 140567, 221445, 30252, 194385, '9273198');

  SELECT count(*) INTO archive_count
    FROM ingest.fact_cleanup_archive
   WHERE operation_key = operation;

  -- A completed migration is a safe replay no-op only when both target links are intact.
  IF archive_count = 2 THEN
    IF (SELECT count(*)
          FROM public.relay_athletes ra
          JOIN _relay_link_repair e ON e.relay_athlete_id = ra.relay_athlete_id
         WHERE ra.athlete_id = e.target_athlete_id) = 2 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'relay link repair archive exists but target state is not complete';
  ELSIF archive_count <> 0 THEN
    RAISE EXCEPTION 'relay link repair archive is partially populated (% rows)', archive_count;
  END IF;

  IF (SELECT count(*)
        FROM public.relay_athletes ra
        JOIN _relay_link_repair e ON e.relay_athlete_id = ra.relay_athlete_id
       WHERE ra.relay_result_id = e.relay_result_id
         AND ra.athlete_id = e.old_athlete_id
         AND lower(btrim(ra.tfrrs_athlete_id)) = e.source_key
         AND lower(regexp_replace(coalesce(ra.athlete_name, ''), '[^a-z0-9]+', '', 'gi'))
             = lower(regexp_replace(coalesce((SELECT a.full_name FROM public.athletes a
                                                WHERE a.athlete_id = e.old_athlete_id), ''),
                                     '[^a-z0-9]+', '', 'gi'))
       ) <> 2 THEN
    RAISE EXCEPTION 'relay link repair row precondition failed';
  END IF;

  IF (SELECT count(*)
        FROM _relay_link_repair e
        JOIN public.athletes a
          ON a.athlete_id = e.target_athlete_id
         AND lower(btrim(a.tfrrs_athlete_id)) = e.source_key
        JOIN public.relay_athletes ra
          ON ra.relay_athlete_id = e.relay_athlete_id
        JOIN ingest.source_links sl
          ON sl.relay_result_id = e.relay_result_id
         AND sl.source_record_id = e.source_record_id
         AND sl.link_status = 'linked'
        JOIN ingest.source_records sr USING (source_record_id)
        CROSS JOIN LATERAL jsonb_array_elements(coalesce(sr.payload->'relay_athletes', '[]'::jsonb)) leg(value)
       WHERE (leg.value->>'leg_order')::integer = ra.leg_order
         AND lower(btrim(leg.value->>'tfrrs_athlete_id')) = e.source_key
         AND lower(regexp_replace(coalesce(leg.value->>'athlete_name', ''), '[^a-z0-9]+', '', 'gi'))
             = lower(regexp_replace(coalesce(a.full_name, ''), '[^a-z0-9]+', '', 'gi'))
       ) <> 2 THEN
    RAISE EXCEPTION 'relay source payload evidence precondition failed';
  END IF;

  IF (SELECT count(*)
        FROM _relay_link_repair e
        JOIN public.athletes a ON a.athlete_id = e.target_athlete_id
       WHERE lower(btrim(a.tfrrs_athlete_id)) = e.source_key) <> 2 THEN
    RAISE EXCEPTION 'relay target source IDs are not unique and canonical';
  END IF;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.relay_athletes', ra.relay_athlete_id::text, to_jsonb(ra)
    FROM public.relay_athletes ra
    JOIN _relay_link_repair e ON e.relay_athlete_id = ra.relay_athlete_id
   ON CONFLICT (operation_key, source_table, source_pk) DO NOTHING;

  IF (SELECT count(*)
        FROM ingest.fact_cleanup_archive
       WHERE operation_key = operation
         AND source_table = 'public.relay_athletes') <> 2 THEN
    RAISE EXCEPTION 'expected two relay-leg before-images';
  END IF;

  UPDATE public.relay_athletes ra
     SET athlete_id = e.target_athlete_id
    FROM _relay_link_repair e
   WHERE ra.relay_athlete_id = e.relay_athlete_id
     AND ra.athlete_id = e.old_athlete_id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> 2 THEN
    RAISE EXCEPTION 'expected two relay athlete links updated, found %', updated_count;
  END IF;

  IF (SELECT count(*)
        FROM public.relay_athletes ra
        JOIN _relay_link_repair e ON e.relay_athlete_id = ra.relay_athlete_id
       WHERE ra.athlete_id = e.target_athlete_id
         AND lower(btrim(ra.tfrrs_athlete_id)) = e.source_key) <> 2 THEN
    RAISE EXCEPTION 'relay link repair postcondition failed';
  END IF;
END
$$;

COMMIT;
