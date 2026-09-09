BEGIN;

-- Remove only the public logo association for Dawgs Track Club. The actual image asset remains
-- preserved in the repository backup directory and the complete school row is archived privately.
DO $$
DECLARE
  operation text := '20260904_remove_reviewed_dawgs_logo_association_v1';
  archived_count integer;
  updated_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.schools
     WHERE school_id = 1829
       AND official_name = 'Dawgs Track Club'
       AND logo_file_path = 'schools/1829.png'
       AND logo_source = 'manual_verified'
  ) THEN
    RAISE EXCEPTION 'Dawgs logo precondition failed';
  END IF;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.schools', s.school_id::text, to_jsonb(s)
    FROM public.schools s
   WHERE s.school_id = 1829
   ON CONFLICT (operation_key, source_table, source_pk) DO NOTHING;

  SELECT count(*) INTO archived_count
    FROM ingest.fact_cleanup_archive
   WHERE operation_key = operation AND source_table = 'public.schools';
  IF archived_count <> 1 THEN
    RAISE EXCEPTION 'expected one archived Dawgs school row, found %', archived_count;
  END IF;

  UPDATE public.schools
     SET logo_file_path = NULL,
         logo_source = NULL,
         updated_at = now()
   WHERE school_id = 1829
     AND official_name = 'Dawgs Track Club'
     AND logo_file_path = 'schools/1829.png'
     AND logo_source = 'manual_verified';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> 1 THEN
    RAISE EXCEPTION 'expected one Dawgs school row updated, found %', updated_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.schools
     WHERE school_id = 1829
       AND (logo_file_path IS NOT NULL OR logo_source IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Dawgs logo association postcondition failed';
  END IF;
END
$$;

COMMIT;
