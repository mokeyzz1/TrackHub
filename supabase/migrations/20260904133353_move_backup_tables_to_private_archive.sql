-- Preserves all nine historical rollback tables while removing them from the public API schema.
-- This is a namespace/ACL change only: no archive row is inserted, updated, or deleted.
-- Rollback: docs/database-audit/rollback_move_backup_tables_to_private_archive.sql

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  archive_table_count integer;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'archive') THEN
    RAISE EXCEPTION 'archive schema already exists; review it before using this migration';
  END IF;

  SELECT count(*) INTO archive_table_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname IN (
      'athletes_empty_backup',
      'relay_athletes_d3_backup',
      'relay_results_d3_backup',
      'relay_results_20260819_backup',
      'results_d1_backup',
      'results_d2_backup',
      'results_xsource_20260819_backup',
      'results_accidental_import_20260819_backup',
      'results_athlete_merge_backup'
    );

  IF archive_table_count <> 9 THEN
    RAISE EXCEPTION 'expected all nine public rollback tables, found %', archive_table_count;
  END IF;

  IF (SELECT count(*) FROM public.athletes_empty_backup) <> 12518
     OR (SELECT count(*) FROM public.relay_athletes_d3_backup) <> 89085
     OR (SELECT count(*) FROM public.relay_results_d3_backup) <> 40935
     OR (SELECT count(*) FROM public.relay_results_20260819_backup) <> 1
     OR (SELECT count(*) FROM public.results_d1_backup) <> 23766
     OR (SELECT count(*) FROM public.results_d2_backup) <> 453737
     OR (SELECT count(*) FROM public.results_xsource_20260819_backup) <> 1252
     OR (SELECT count(*) FROM public.results_accidental_import_20260819_backup) <> 31
     OR (SELECT count(*) FROM public.results_athlete_merge_backup) <> 11 THEN
    RAISE EXCEPTION 'rollback archive row counts drifted; reconcile before moving tables';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint k
    WHERE k.contype = 'f'
      AND (k.conrelid::regclass::text = ANY (ARRAY[
             'athletes_empty_backup', 'relay_athletes_d3_backup',
             'relay_results_d3_backup', 'relay_results_20260819_backup',
             'results_d1_backup', 'results_d2_backup',
             'results_xsource_20260819_backup',
             'results_accidental_import_20260819_backup',
             'results_athlete_merge_backup'
           ])
           OR k.confrelid::regclass::text = ANY (ARRAY[
             'athletes_empty_backup', 'relay_athletes_d3_backup',
             'relay_results_d3_backup', 'relay_results_20260819_backup',
             'results_d1_backup', 'results_d2_backup',
             'results_xsource_20260819_backup',
             'results_accidental_import_20260819_backup',
             'results_athlete_merge_backup'
           ]))
  ) THEN
    RAISE EXCEPTION 'a rollback table has acquired a foreign-key dependency';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN (
        'athletes_empty_backup', 'relay_athletes_d3_backup',
        'relay_results_d3_backup', 'relay_results_20260819_backup',
        'results_d1_backup', 'results_d2_backup',
        'results_xsource_20260819_backup',
        'results_accidental_import_20260819_backup',
        'results_athlete_merge_backup'
      )
      AND grantee NOT IN ('postgres', 'service_role')
  ) THEN
    RAISE EXCEPTION 'unexpected role privileges exist on rollback tables';
  END IF;

  CREATE TEMP TABLE _archive_table_oids ON COMMIT DROP AS
  SELECT c.relname, c.oid
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'athletes_empty_backup', 'relay_athletes_d3_backup',
      'relay_results_d3_backup', 'relay_results_20260819_backup',
      'results_d1_backup', 'results_d2_backup',
      'results_xsource_20260819_backup',
      'results_accidental_import_20260819_backup',
      'results_athlete_merge_backup'
    );

  CREATE SCHEMA archive AUTHORIZATION postgres;
  COMMENT ON SCHEMA archive IS
    'Private, preservation-only rollback tables. Not an application data or API schema.';

  REVOKE ALL ON SCHEMA archive FROM PUBLIC, anon, authenticated;
  GRANT USAGE ON SCHEMA archive TO service_role;

  ALTER DEFAULT PRIVILEGES IN SCHEMA archive REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA archive GRANT SELECT ON TABLES TO service_role;

  ALTER TABLE public.athletes_empty_backup SET SCHEMA archive;
  ALTER TABLE public.relay_athletes_d3_backup SET SCHEMA archive;
  ALTER TABLE public.relay_results_d3_backup SET SCHEMA archive;
  ALTER TABLE public.relay_results_20260819_backup SET SCHEMA archive;
  ALTER TABLE public.results_d1_backup SET SCHEMA archive;
  ALTER TABLE public.results_d2_backup SET SCHEMA archive;
  ALTER TABLE public.results_xsource_20260819_backup SET SCHEMA archive;
  ALTER TABLE public.results_accidental_import_20260819_backup SET SCHEMA archive;
  ALTER TABLE public.results_athlete_merge_backup SET SCHEMA archive;

  ALTER TABLE archive.athletes_empty_backup DISABLE ROW LEVEL SECURITY;
  ALTER TABLE archive.relay_athletes_d3_backup DISABLE ROW LEVEL SECURITY;
  ALTER TABLE archive.relay_results_d3_backup DISABLE ROW LEVEL SECURITY;
  ALTER TABLE archive.relay_results_20260819_backup DISABLE ROW LEVEL SECURITY;
  ALTER TABLE archive.results_d1_backup DISABLE ROW LEVEL SECURITY;
  ALTER TABLE archive.results_d2_backup DISABLE ROW LEVEL SECURITY;
  ALTER TABLE archive.results_xsource_20260819_backup DISABLE ROW LEVEL SECURITY;
  ALTER TABLE archive.results_accidental_import_20260819_backup DISABLE ROW LEVEL SECURITY;
  ALTER TABLE archive.results_athlete_merge_backup DISABLE ROW LEVEL SECURITY;

  REVOKE ALL ON ALL TABLES IN SCHEMA archive FROM PUBLIC, anon, authenticated, service_role;
  GRANT SELECT ON ALL TABLES IN SCHEMA archive TO service_role;

  COMMENT ON TABLE archive.athletes_empty_backup IS 'Rollback before-images for removed empty duplicate athletes.';
  COMMENT ON TABLE archive.relay_athletes_d3_backup IS 'Rollback relay legs for reviewed duplicate relay cleanup.';
  COMMENT ON TABLE archive.relay_results_d3_backup IS 'Rollback relay parents for reviewed duplicate relay cleanup.';
  COMMENT ON TABLE archive.relay_results_20260819_backup IS 'Rollback row for the 2026-08-19 cross-source relay cleanup.';
  COMMENT ON TABLE archive.results_d1_backup IS 'Rollback results for copied-meet cleanup.';
  COMMENT ON TABLE archive.results_d2_backup IS 'Rollback results for reviewed duplicate/history cleanup.';
  COMMENT ON TABLE archive.results_xsource_20260819_backup IS 'Rollback results for 2026-08-19 cross-source cleanup.';
  COMMENT ON TABLE archive.results_accidental_import_20260819_backup IS 'Rollback results for the 2026-08-19 accidental import cleanup.';
  COMMENT ON TABLE archive.results_athlete_merge_backup IS 'Rollback results for reviewed athlete merges.';

  IF (SELECT count(*)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'archive' AND c.relkind = 'r') <> 9
     OR EXISTS (
       SELECT 1
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN _archive_table_oids old ON old.relname = c.relname
       WHERE n.nspname = 'archive' AND c.oid <> old.oid
     )
     OR (SELECT count(*) FROM archive.athletes_empty_backup) <> 12518
     OR (SELECT count(*) FROM archive.relay_athletes_d3_backup) <> 89085
     OR (SELECT count(*) FROM archive.relay_results_d3_backup) <> 40935
     OR (SELECT count(*) FROM archive.relay_results_20260819_backup) <> 1
     OR (SELECT count(*) FROM archive.results_d1_backup) <> 23766
     OR (SELECT count(*) FROM archive.results_d2_backup) <> 453737
     OR (SELECT count(*) FROM archive.results_xsource_20260819_backup) <> 1252
     OR (SELECT count(*) FROM archive.results_accidental_import_20260819_backup) <> 31
     OR (SELECT count(*) FROM archive.results_athlete_merge_backup) <> 11
     OR has_schema_privilege('anon', 'archive', 'USAGE')
     OR has_schema_privilege('authenticated', 'archive', 'USAGE')
     OR (SELECT count(*)
         FROM information_schema.role_table_grants
         WHERE table_schema = 'archive' AND grantee = 'service_role') <> 9
     OR EXISTS (
       SELECT 1
       FROM information_schema.role_table_grants
       WHERE table_schema = 'archive'
         AND grantee = 'service_role'
         AND privilege_type <> 'SELECT'
     ) THEN
    RAISE EXCEPTION 'private archive postcondition failed';
  END IF;

  RAISE NOTICE 'moved nine rollback tables and 621336 rows from public to private archive schema';
END
$$;

COMMIT;
