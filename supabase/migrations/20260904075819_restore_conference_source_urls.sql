-- Preserve the 32 TFRRS conference URLs carried only by the pre-consolidation rows.
-- The prior cleanup archive is the authoritative source; canonical rows are archived first.
-- Rollback: docs/database-audit/rollback_restore_conference_source_urls.sql

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
  source_operation constant text := '20260904_consolidate_exact_conference_duplicates_v1';
  operation constant text := '20260904_restore_conference_source_urls_v1';
  expected_count constant integer := 32;
  updated_count integer;
BEGIN
  CREATE TEMP TABLE _conference_url_restore ON COMMIT DROP AS
  SELECT c.conference_id,
         c.name,
         a.row_data->>'website' AS website
  FROM public.conferences c
  JOIN ingest.fact_cleanup_archive a
    ON a.operation_key = source_operation
   AND a.source_table = 'public.conferences.duplicate'
   AND a.row_data->>'name' = c.name
  WHERE c.website IS NULL
    AND nullif(a.row_data->>'website', '') IS NOT NULL;

  IF (SELECT count(*) FROM _conference_url_restore) <> expected_count
     OR (SELECT count(DISTINCT conference_id) FROM _conference_url_restore) <> expected_count
     OR EXISTS (
       SELECT 1 FROM _conference_url_restore GROUP BY conference_id HAVING count(*) > 1
     ) THEN
    RAISE EXCEPTION 'expected exactly % unambiguous archived conference URLs', expected_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM ingest.fact_cleanup_archive
    WHERE operation_key = operation
  ) THEN
    RAISE EXCEPTION 'conference URL repair archive is already populated';
  END IF;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.conferences', c.conference_id::text, to_jsonb(c)
  FROM public.conferences c
  JOIN _conference_url_restore r USING (conference_id)
  ORDER BY c.conference_id;

  UPDATE public.conferences c
  SET website = r.website
  FROM _conference_url_restore r
  WHERE c.conference_id = r.conference_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> expected_count THEN
    RAISE EXCEPTION 'expected % conference URL updates, updated %', expected_count, updated_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _conference_url_restore r
    JOIN public.conferences c USING (conference_id)
    WHERE c.website IS DISTINCT FROM r.website
  ) OR (SELECT count(*) FROM ingest.fact_cleanup_archive WHERE operation_key = operation)
       <> expected_count THEN
    RAISE EXCEPTION 'conference URL repair postcondition failed';
  END IF;

  RAISE NOTICE 'restored % archived TFRRS conference URLs', expected_count;
END
$$;

COMMIT;
