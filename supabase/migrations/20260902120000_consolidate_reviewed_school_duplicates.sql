-- Consolidate only the 17 school pairs reviewed on 2026-09-02.
-- This migration is intentionally data-specific, guarded, replay-safe, and reversible through
-- docs/database-audit/rollback_reviewed_school_duplicates.sql.
-- It reuses the existing private cleanup archive and creates no persistent table or public API.

DO $$
DECLARE
  operation constant text := '20260902_consolidate_reviewed_school_duplicates';
  duplicate_school_count integer;
  duplicate_team_count integer;
  archive_count integer;
  relay_conflict_count integer;
BEGIN
  CREATE TEMP TABLE _school_merge_map (
    canonical_school_id bigint PRIMARY KEY,
    duplicate_school_id bigint UNIQUE NOT NULL,
    preferred_name text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _school_merge_map VALUES
    (1178, 1775, 'Bethany (W.V.)'),
    (973,  1589, 'Coffeyville CC'),
    (726,  1782, 'Columbia Int''l'),
    (727,  1726, 'Columbia (S.C.)'),
    (1000, 1590, 'Fort Scott CC'),
    (1315, 1780, 'Johnson & Wales (R.I.)'),
    (1067, 1588, 'Neosho County CC'),
    (1096, 1625, 'Richard Bland'),
    (857,  1807, 'SCAD Atlanta'),
    (1121, 1592, 'Southwestern CC'),
    (1509, 1697, 'Stevens'),
    (1496, 1707, 'St. John Fisher'),
    (1500, 1728, 'St. Joseph''s (Me.)'),
    (1503, 1744, 'St. Mary''s (Md.)'),
    (897,  1777, 'The Master''s'),
    (1532, 1753, 'Union (N.Y.)'),
    (1585, 1822, 'York (N.Y.)');

  SELECT count(*) INTO duplicate_school_count
    FROM public.schools s JOIN _school_merge_map m ON m.duplicate_school_id = s.school_id;
  SELECT count(*) INTO duplicate_team_count
    FROM public.teams t JOIN _school_merge_map m ON m.duplicate_school_id = t.school_id;
  SELECT count(*) INTO archive_count
    FROM ingest.fact_cleanup_archive WHERE operation_key = operation;

  -- A completed migration is a safe replay no-op.
  IF duplicate_school_count = 0 AND duplicate_team_count = 0 THEN
    IF archive_count = 11562
       AND (SELECT count(*) FROM public.schools s JOIN _school_merge_map m
              ON m.canonical_school_id = s.school_id
             AND s.official_name = m.preferred_name
             AND s.short_name = m.preferred_name) = 17 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'reviewed duplicate rows are absent but the completed state is not valid';
  END IF;

  IF archive_count <> 0 THEN
    RAISE EXCEPTION 'operation archive is partially populated (% rows)', archive_count;
  END IF;
  IF duplicate_school_count <> 17 OR duplicate_team_count <> 33 THEN
    RAISE EXCEPTION 'expected 17 duplicate schools and 33 duplicate teams, found % and %',
      duplicate_school_count, duplicate_team_count;
  END IF;
  IF (SELECT count(*) FROM public.schools s JOIN _school_merge_map m
        ON m.canonical_school_id = s.school_id) <> 17 THEN
    RAISE EXCEPTION 'all 17 canonical schools must exist';
  END IF;

  CREATE TEMP TABLE _team_merge_map ON COMMIT DROP AS
  SELECT ct.team_id AS canonical_team_id, dt.team_id AS duplicate_team_id,
         dt.gender, m.canonical_school_id, m.duplicate_school_id
    FROM _school_merge_map m
    JOIN public.teams dt ON dt.school_id = m.duplicate_school_id
    JOIN public.teams ct ON ct.school_id = m.canonical_school_id AND ct.gender = dt.gender;
  ALTER TABLE _team_merge_map ADD PRIMARY KEY (duplicate_team_id);

  IF (SELECT count(*) FROM _team_merge_map) <> 33 THEN
    RAISE EXCEPTION 'every duplicate team must have one same-gender canonical team';
  END IF;

  IF (SELECT count(*) FROM public.athletes a JOIN _school_merge_map m
        ON m.duplicate_school_id = a.school_id) <> 677
     OR (SELECT count(*) FROM public.results r JOIN _team_merge_map m
          ON m.duplicate_team_id = r.team_id) <> 9724
     OR (SELECT count(*) FROM public.relay_results r JOIN _team_merge_map m
          ON m.duplicate_team_id = r.team_id) <> 441
     OR (SELECT count(*) FROM ingest.observations o JOIN _team_merge_map m
          ON m.duplicate_team_id = o.target_team_id) <> 653 THEN
    RAISE EXCEPTION 'reviewed dependent-row counts drifted; rerun the school identity audit';
  END IF;

  IF (SELECT count(*) FROM public.athlete_team_seasons a JOIN _team_merge_map m
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

  SELECT count(*)::integer INTO relay_conflict_count
    FROM public.relay_results duplicate_relay
    JOIN _team_merge_map m ON m.duplicate_team_id = duplicate_relay.team_id
    JOIN public.relay_results canonical_relay
      ON canonical_relay.team_id = m.canonical_team_id
     AND canonical_relay.meet_id IS NOT DISTINCT FROM duplicate_relay.meet_id
     AND canonical_relay.event_type_id IS NOT DISTINCT FROM duplicate_relay.event_type_id
     AND canonical_relay.place IS NOT DISTINCT FROM duplicate_relay.place
     AND canonical_relay.round IS NOT DISTINCT FROM duplicate_relay.round
     AND lower(regexp_replace(canonical_relay.mark_raw, '[ah]$', ''))
         IS NOT DISTINCT FROM lower(regexp_replace(duplicate_relay.mark_raw, '[ah]$', ''));
  IF relay_conflict_count <> 0 THEN
    RAISE EXCEPTION 'team remap would create % relay uniqueness conflicts', relay_conflict_count;
  END IF;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.schools.canonical', s.school_id::text, to_jsonb(s)
    FROM public.schools s JOIN _school_merge_map m ON m.canonical_school_id = s.school_id;
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
  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'ingest.observations', o.observation_id::text, to_jsonb(o)
    FROM ingest.observations o JOIN _team_merge_map m ON m.duplicate_team_id = o.target_team_id;

  IF (SELECT count(*) FROM ingest.fact_cleanup_archive WHERE operation_key = operation) <> 11562 THEN
    RAISE EXCEPTION 'cleanup archive must contain exactly 11562 pre-change rows';
  END IF;

  UPDATE public.schools canonical
     SET official_name = m.preferred_name,
         short_name = m.preferred_name,
         is_active = canonical.is_active OR duplicate.is_active,
         updated_at = now()
    FROM _school_merge_map m
    JOIN public.schools duplicate ON duplicate.school_id = m.duplicate_school_id
   WHERE canonical.school_id = m.canonical_school_id;

  UPDATE public.athletes a SET school_id = m.canonical_school_id
    FROM _school_merge_map m WHERE a.school_id = m.duplicate_school_id;
  UPDATE public.results r SET team_id = m.canonical_team_id
    FROM _team_merge_map m WHERE r.team_id = m.duplicate_team_id;
  UPDATE public.relay_results r SET team_id = m.canonical_team_id
    FROM _team_merge_map m WHERE r.team_id = m.duplicate_team_id;
  UPDATE ingest.observations o SET target_team_id = m.canonical_team_id
    FROM _team_merge_map m WHERE o.target_team_id = m.duplicate_team_id;

  DELETE FROM public.teams t USING _team_merge_map m WHERE t.team_id = m.duplicate_team_id;
  DELETE FROM public.schools s USING _school_merge_map m WHERE s.school_id = m.duplicate_school_id;

  IF (SELECT count(*) FROM public.schools s JOIN _school_merge_map m
        ON m.duplicate_school_id = s.school_id) <> 0
     OR (SELECT count(*) FROM public.teams t JOIN _team_merge_map m
          ON m.duplicate_team_id = t.team_id) <> 0
     OR (SELECT count(*) FROM public.athletes a JOIN _school_merge_map m
          ON m.duplicate_school_id = a.school_id) <> 0
     OR (SELECT count(*) FROM public.results r JOIN _team_merge_map m
          ON m.duplicate_team_id = r.team_id) <> 0
     OR (SELECT count(*) FROM public.relay_results r JOIN _team_merge_map m
          ON m.duplicate_team_id = r.team_id) <> 0
     OR (SELECT count(*) FROM ingest.observations o JOIN _team_merge_map m
          ON m.duplicate_team_id = o.target_team_id) <> 0 THEN
    RAISE EXCEPTION 'reviewed duplicate references remain after consolidation';
  END IF;
END
$$;
