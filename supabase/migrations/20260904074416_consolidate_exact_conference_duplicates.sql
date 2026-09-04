-- Consolidate all mechanically provable duplicate conference identities in one operation.
-- Identity is the exact conference name because the live data contains no exact name assigned
-- to more than one non-null division. The most-referenced, most-complete row survives.
-- Every deleted conference and every rewired school is archived before mutation.
-- Rollback: docs/database-audit/rollback_consolidate_exact_conference_duplicates.sql

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  operation constant text := '20260904_consolidate_exact_conference_duplicates_v1';
  expected_conferences constant integer := 1114;
  expected_names constant integer := 197;
  expected_duplicates constant integer := 917;
  expected_school_rewires constant integer := 7;
  archived_count integer;
  updated_count integer;
  deleted_count integer;
BEGIN
  LOCK TABLE public.conferences IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.schools IN SHARE ROW EXCLUSIVE MODE;

  IF (SELECT count(*) FROM public.conferences) <> expected_conferences
     OR (SELECT count(DISTINCT name) FROM public.conferences) <> expected_names THEN
    RAISE EXCEPTION 'conference inventory drifted; expected % rows and % names',
      expected_conferences, expected_names;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.conferences
    GROUP BY name
    HAVING count(DISTINCT division) FILTER (WHERE division IS NOT NULL) > 1
  ) THEN
    RAISE EXCEPTION 'an exact conference name now spans multiple divisions; manual identity review required';
  END IF;

  IF (SELECT count(*) FROM public.conference_memberships) <> 0
     OR (SELECT count(*) FROM public.external_ids WHERE conference_id IS NOT NULL) <> 0 THEN
    RAISE EXCEPTION 'new conference dependencies appeared; rerun the dependency audit before consolidation';
  END IF;

  SELECT count(*) INTO archived_count
  FROM ingest.fact_cleanup_archive
  WHERE operation_key = operation;
  IF archived_count <> 0 THEN
    RAISE EXCEPTION 'operation archive is already populated (% rows)', archived_count;
  END IF;

  CREATE TEMP TABLE _conference_reference_counts ON COMMIT DROP AS
  SELECT c.conference_id,
         (SELECT count(*) FROM public.schools s
           WHERE s.current_conference_id = c.conference_id)
       + (SELECT count(*) FROM public.conference_memberships cm
           WHERE cm.conference_id = c.conference_id)
       + (SELECT count(*) FROM public.external_ids e
           WHERE e.conference_id = c.conference_id) AS reference_count
  FROM public.conferences c;

  CREATE TEMP TABLE _conference_merge_map ON COMMIT DROP AS
  WITH ranked AS (
    SELECT c.conference_id,
           first_value(c.conference_id) OVER (
             PARTITION BY c.name
             ORDER BY rc.reference_count DESC,
                      (c.division IS NOT NULL) DESC,
                      ((c.abbreviation IS NOT NULL)::integer
                       + (c.website IS NOT NULL)::integer
                       + (c.region IS NOT NULL)::integer) DESC,
                      c.conference_id
           ) AS canonical_conference_id,
           row_number() OVER (
             PARTITION BY c.name
             ORDER BY rc.reference_count DESC,
                      (c.division IS NOT NULL) DESC,
                      ((c.abbreviation IS NOT NULL)::integer
                       + (c.website IS NOT NULL)::integer
                       + (c.region IS NOT NULL)::integer) DESC,
                      c.conference_id
           ) AS identity_rank
    FROM public.conferences c
    JOIN _conference_reference_counts rc USING (conference_id)
  )
  SELECT conference_id AS duplicate_conference_id, canonical_conference_id
  FROM ranked
  WHERE identity_rank > 1;

  ALTER TABLE _conference_merge_map
    ADD PRIMARY KEY (duplicate_conference_id);

  IF (SELECT count(*) FROM _conference_merge_map) <> expected_duplicates THEN
    RAISE EXCEPTION 'expected % duplicate conference rows, mapped %',
      expected_duplicates, (SELECT count(*) FROM _conference_merge_map);
  END IF;

  IF (SELECT count(*)
      FROM public.schools s
      JOIN _conference_merge_map m
        ON m.duplicate_conference_id = s.current_conference_id) <> expected_school_rewires THEN
    RAISE EXCEPTION 'expected % school conference references to rewire', expected_school_rewires;
  END IF;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.conferences.duplicate', c.conference_id::text, to_jsonb(c)
  FROM public.conferences c
  JOIN _conference_merge_map m ON m.duplicate_conference_id = c.conference_id
  ORDER BY c.conference_id;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.schools.current_conference', s.school_id::text, to_jsonb(s)
  FROM public.schools s
  JOIN _conference_merge_map m ON m.duplicate_conference_id = s.current_conference_id
  ORDER BY s.school_id;

  IF (SELECT count(*) FROM ingest.fact_cleanup_archive WHERE operation_key = operation)
       <> expected_duplicates + expected_school_rewires THEN
    RAISE EXCEPTION 'cleanup archive is incomplete';
  END IF;

  UPDATE public.schools s
  SET current_conference_id = m.canonical_conference_id
  FROM _conference_merge_map m
  WHERE s.current_conference_id = m.duplicate_conference_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> expected_school_rewires THEN
    RAISE EXCEPTION 'expected % school rewires, updated %', expected_school_rewires, updated_count;
  END IF;

  DELETE FROM public.conferences c
  USING _conference_merge_map m
  WHERE c.conference_id = m.duplicate_conference_id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count <> expected_duplicates THEN
    RAISE EXCEPTION 'expected % conference deletions, deleted %', expected_duplicates, deleted_count;
  END IF;

  IF (SELECT count(*) FROM public.conferences) <> expected_names
     OR (SELECT count(DISTINCT name) FROM public.conferences) <> expected_names
     OR EXISTS (
       SELECT 1 FROM public.conferences GROUP BY name HAVING count(*) > 1
     )
     OR EXISTS (
       SELECT 1
       FROM public.schools s
       JOIN _conference_merge_map m
         ON m.duplicate_conference_id = s.current_conference_id
     ) THEN
    RAISE EXCEPTION 'conference consolidation postcondition failed';
  END IF;

  RAISE NOTICE 'consolidated % duplicate conference rows into % exact-name identities; rewired % schools',
    expected_duplicates, expected_names, expected_school_rewires;
END
$$;

-- Prevent another repeated seed/import from recreating an exact conference-name identity.
CREATE UNIQUE INDEX conferences_normalized_name_uidx
  ON public.conferences (lower(btrim(name)));

-- Cover both conference foreign keys that the Supabase database advisor identified.
CREATE INDEX idx_conference_memberships_conference_id
  ON public.conference_memberships (conference_id);

CREATE INDEX idx_external_ids_conference_id
  ON public.external_ids (conference_id);

COMMIT;
