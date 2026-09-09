-- Remove 63 empty state-less school shells and consolidate the reviewed Ohio Christian spelling
-- variant. All 64 pairs were traced to the two defective 2026-02-05 school-loader batches.
-- This migration creates no persistent table and reuses ingest.fact_cleanup_archive.

DO $$
DECLARE
  operation constant text := '20260902_remove_reviewed_empty_school_duplicates';
  duplicate_school_count integer;
  duplicate_team_count integer;
  archive_count integer;
BEGIN
  DROP TABLE IF EXISTS _team_merge_map, _school_merge_map;
  CREATE TEMP TABLE _school_merge_map (
    canonical_school_id bigint PRIMARY KEY,
    duplicate_school_id bigint UNIQUE NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _school_merge_map VALUES
    (940,1648),(936,1693),(960,1672),(962,1601),(971,1612),(974,1646),(981,1594),(983,1671),
    (988,1649),(743,1670),(989,1611),(990,1659),(994,1661),(999,1641),(1001,1613),(1005,1600),
    (1008,1624),(1010,1599),(1011,1614),(1014,1666),(1016,1680),(1021,1632),(1022,1639),
    (1025,1642),(1026,1622),(1027,1644),(1028,1655),(1030,1657),(1033,1690),(1042,1637),
    (1043,1684),(1046,1686),(1049,1681),(1050,1603),(1055,1617),(1064,1689),(1066,1677),
    (1068,1678),(1070,1676),(1073,1623),(1079,1679),(831,1818),(1080,1598),(1081,1593),
    (1083,1605),(1084,1630),(1089,1604),(1090,1602),(1091,1643),(1093,1694),(1100,1633),
    (1108,1660),(1111,1631),(1115,1647),(1117,1635),(1113,1675),(1130,1673),(1132,1658),
    (1135,1696),(1134,1626),(1139,1638),(1140,1688),(1145,1664),(1146,1597);

  SELECT count(*) INTO duplicate_school_count
    FROM public.schools s JOIN _school_merge_map m ON m.duplicate_school_id = s.school_id;
  SELECT count(*) INTO duplicate_team_count
    FROM public.teams t JOIN _school_merge_map m ON m.duplicate_school_id = t.school_id;
  SELECT count(*) INTO archive_count
    FROM ingest.fact_cleanup_archive WHERE operation_key = operation;

  -- A completed migration is a safe replay no-op.
  IF duplicate_school_count = 0 AND duplicate_team_count = 0 THEN
    IF archive_count = 355
       AND EXISTS (SELECT 1 FROM public.schools
                    WHERE school_id = 831 AND official_name = 'Ohio Christian'
                      AND short_name = 'Ohio Christian' AND is_active) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'reviewed duplicate rows are absent but the completed state is not valid';
  END IF;

  IF archive_count <> 0 THEN
    RAISE EXCEPTION 'operation archive is partially populated (% rows)', archive_count;
  END IF;
  IF duplicate_school_count <> 64 OR duplicate_team_count <> 128 THEN
    RAISE EXCEPTION 'expected 64 duplicate schools and 128 duplicate teams, found % and %',
      duplicate_school_count, duplicate_team_count;
  END IF;
  IF (SELECT count(*) FROM public.schools s JOIN _school_merge_map m
        ON m.canonical_school_id = s.school_id) <> 64 THEN
    RAISE EXCEPTION 'all 64 canonical schools must exist';
  END IF;

  CREATE TEMP TABLE _team_merge_map ON COMMIT DROP AS
  SELECT ct.team_id AS canonical_team_id, dt.team_id AS duplicate_team_id,
         dt.gender, m.canonical_school_id, m.duplicate_school_id
    FROM _school_merge_map m
    JOIN public.teams dt ON dt.school_id = m.duplicate_school_id
    JOIN public.teams ct ON ct.school_id = m.canonical_school_id AND ct.gender = dt.gender;
  ALTER TABLE _team_merge_map ADD PRIMARY KEY (duplicate_team_id);

  IF (SELECT count(*) FROM _team_merge_map) <> 128 THEN
    RAISE EXCEPTION 'every duplicate team must have one same-gender canonical team';
  END IF;
  IF (SELECT count(*) FROM public.athletes a JOIN _school_merge_map m
        ON m.duplicate_school_id = a.school_id) <> 9
     OR (SELECT count(*) FROM public.results r JOIN _team_merge_map m
          ON m.duplicate_team_id = r.team_id) <> 152
     OR (SELECT count(*) FROM public.relay_results r JOIN _team_merge_map m
          ON m.duplicate_team_id = r.team_id) <> 1 THEN
    RAISE EXCEPTION 'reviewed dependent-row counts drifted; rerun the school identity audit';
  END IF;
  IF (SELECT count(*) FROM public.athletes a JOIN _school_merge_map m
        ON m.duplicate_school_id = a.school_id AND a.school_id <> 1818) <> 0 THEN
    RAISE EXCEPTION 'a reviewed empty shell unexpectedly owns athletes';
  END IF;

  IF (SELECT count(*) FROM ingest.observations o JOIN _team_merge_map m
        ON m.duplicate_team_id = o.target_team_id) <> 0
     OR (SELECT count(*) FROM public.athlete_team_seasons a JOIN _team_merge_map m
          ON m.duplicate_team_id = a.team_id) <> 0
     OR (SELECT count(*) FROM public.live_results l JOIN _team_merge_map m
          ON m.duplicate_team_id = l.team_id) <> 0
     OR (SELECT count(*) FROM ingest.team_aliases a JOIN _team_merge_map m
          ON m.duplicate_team_id = a.team_id) <> 0
     OR (SELECT count(*) FROM public.external_ids e JOIN _school_merge_map m
          ON m.duplicate_school_id = e.school_id) <> 0
     OR (SELECT count(*) FROM public.external_ids e JOIN _team_merge_map m
          ON m.duplicate_team_id = e.team_id) <> 0
     OR (SELECT count(*) FROM public.conference_memberships c JOIN _school_merge_map m
          ON m.duplicate_school_id = c.school_id) <> 0 THEN
    RAISE EXCEPTION 'an unreviewed dependency appeared; rerun the school identity audit';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.relay_results duplicate_relay
      JOIN _team_merge_map m ON m.duplicate_team_id = duplicate_relay.team_id
      JOIN public.relay_results canonical_relay
        ON canonical_relay.team_id = m.canonical_team_id
       AND canonical_relay.meet_id IS NOT DISTINCT FROM duplicate_relay.meet_id
       AND canonical_relay.event_type_id IS NOT DISTINCT FROM duplicate_relay.event_type_id
       AND canonical_relay.place IS NOT DISTINCT FROM duplicate_relay.place
       AND canonical_relay.round IS NOT DISTINCT FROM duplicate_relay.round
       AND lower(regexp_replace(canonical_relay.mark_raw, '[ah]$', ''))
           IS NOT DISTINCT FROM lower(regexp_replace(duplicate_relay.mark_raw, '[ah]$', ''))
  ) THEN
    RAISE EXCEPTION 'team remap would create a relay uniqueness conflict';
  END IF;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.schools.canonical', s.school_id::text, to_jsonb(s)
    FROM public.schools s WHERE s.school_id = 831;
  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.schools.duplicate', s.school_id::text, to_jsonb(s)
    FROM public.schools s JOIN _school_merge_map m ON m.duplicate_school_id = s.school_id;
  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.teams.duplicate', t.team_id::text, to_jsonb(t)
    FROM public.teams t JOIN _team_merge_map m ON m.duplicate_team_id = t.team_id;
  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.athletes', a.athlete_id::text, to_jsonb(a)
    FROM public.athletes a JOIN _school_merge_map m ON m.duplicate_school_id = a.school_id;
  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.results', r.result_id::text, to_jsonb(r)
    FROM public.results r JOIN _team_merge_map m ON m.duplicate_team_id = r.team_id;
  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.relay_results', r.relay_result_id::text, to_jsonb(r)
    FROM public.relay_results r JOIN _team_merge_map m ON m.duplicate_team_id = r.team_id;

  IF (SELECT count(*) FROM ingest.fact_cleanup_archive WHERE operation_key = operation) <> 355 THEN
    RAISE EXCEPTION 'cleanup archive must contain exactly 355 pre-change rows';
  END IF;

  UPDATE public.schools
     SET official_name = 'Ohio Christian', short_name = 'Ohio Christian',
         is_active = true, updated_at = now()
   WHERE school_id = 831;
  UPDATE public.athletes a SET school_id = m.canonical_school_id
    FROM _school_merge_map m WHERE a.school_id = m.duplicate_school_id;
  UPDATE public.results r SET team_id = m.canonical_team_id
    FROM _team_merge_map m WHERE r.team_id = m.duplicate_team_id;
  UPDATE public.relay_results r SET team_id = m.canonical_team_id
    FROM _team_merge_map m WHERE r.team_id = m.duplicate_team_id;

  DELETE FROM public.teams t USING _team_merge_map m WHERE t.team_id = m.duplicate_team_id;
  DELETE FROM public.schools s USING _school_merge_map m WHERE s.school_id = m.duplicate_school_id;

  IF EXISTS (SELECT 1 FROM public.schools s JOIN _school_merge_map m
              ON m.duplicate_school_id = s.school_id)
     OR EXISTS (SELECT 1 FROM public.teams t JOIN _team_merge_map m
                 ON m.duplicate_team_id = t.team_id)
     OR EXISTS (SELECT 1 FROM public.athletes a JOIN _school_merge_map m
                 ON m.duplicate_school_id = a.school_id)
     OR EXISTS (SELECT 1 FROM public.results r JOIN _team_merge_map m
                 ON m.duplicate_team_id = r.team_id)
     OR EXISTS (SELECT 1 FROM public.relay_results r JOIN _team_merge_map m
                 ON m.duplicate_team_id = r.team_id) THEN
    RAISE EXCEPTION 'reviewed duplicate references remain after consolidation';
  END IF;
END
$$;
