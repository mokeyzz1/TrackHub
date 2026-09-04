-- Emergency rollback for the private archive namespace migration.
-- Moves all nine unchanged rollback tables back to public and restores their former ACL/RLS state.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF (SELECT count(*)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'archive' AND c.relkind = 'r') <> 9
     OR (SELECT count(*) FROM archive.athletes_empty_backup) <> 12518
     OR (SELECT count(*) FROM archive.relay_athletes_d3_backup) <> 89085
     OR (SELECT count(*) FROM archive.relay_results_d3_backup) <> 40935
     OR (SELECT count(*) FROM archive.relay_results_20260819_backup) <> 1
     OR (SELECT count(*) FROM archive.results_d1_backup) <> 23766
     OR (SELECT count(*) FROM archive.results_d2_backup) <> 453737
     OR (SELECT count(*) FROM archive.results_xsource_20260819_backup) <> 1252
     OR (SELECT count(*) FROM archive.results_accidental_import_20260819_backup) <> 31
     OR (SELECT count(*) FROM archive.results_athlete_merge_backup) <> 11 THEN
    RAISE EXCEPTION 'complete private rollback archive is required';
  END IF;

  REVOKE ALL ON ALL TABLES IN SCHEMA archive FROM service_role;
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA archive TO service_role;

  ALTER TABLE archive.athletes_empty_backup ENABLE ROW LEVEL SECURITY;
  ALTER TABLE archive.relay_athletes_d3_backup ENABLE ROW LEVEL SECURITY;
  ALTER TABLE archive.relay_results_d3_backup ENABLE ROW LEVEL SECURITY;
  ALTER TABLE archive.relay_results_20260819_backup ENABLE ROW LEVEL SECURITY;
  ALTER TABLE archive.results_d1_backup ENABLE ROW LEVEL SECURITY;
  ALTER TABLE archive.results_d2_backup ENABLE ROW LEVEL SECURITY;
  ALTER TABLE archive.results_xsource_20260819_backup ENABLE ROW LEVEL SECURITY;
  ALTER TABLE archive.results_accidental_import_20260819_backup ENABLE ROW LEVEL SECURITY;
  ALTER TABLE archive.results_athlete_merge_backup DISABLE ROW LEVEL SECURITY;

  ALTER TABLE archive.athletes_empty_backup SET SCHEMA public;
  ALTER TABLE archive.relay_athletes_d3_backup SET SCHEMA public;
  ALTER TABLE archive.relay_results_d3_backup SET SCHEMA public;
  ALTER TABLE archive.relay_results_20260819_backup SET SCHEMA public;
  ALTER TABLE archive.results_d1_backup SET SCHEMA public;
  ALTER TABLE archive.results_d2_backup SET SCHEMA public;
  ALTER TABLE archive.results_xsource_20260819_backup SET SCHEMA public;
  ALTER TABLE archive.results_accidental_import_20260819_backup SET SCHEMA public;
  ALTER TABLE archive.results_athlete_merge_backup SET SCHEMA public;

  DROP SCHEMA archive;

  IF (SELECT count(*) FROM public.athletes_empty_backup) <> 12518
     OR (SELECT count(*) FROM public.relay_athletes_d3_backup) <> 89085
     OR (SELECT count(*) FROM public.relay_results_d3_backup) <> 40935
     OR (SELECT count(*) FROM public.relay_results_20260819_backup) <> 1
     OR (SELECT count(*) FROM public.results_d1_backup) <> 23766
     OR (SELECT count(*) FROM public.results_d2_backup) <> 453737
     OR (SELECT count(*) FROM public.results_xsource_20260819_backup) <> 1252
     OR (SELECT count(*) FROM public.results_accidental_import_20260819_backup) <> 31
     OR (SELECT count(*) FROM public.results_athlete_merge_backup) <> 11
     OR (SELECT count(*)
         FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND grantee = 'service_role'
           AND table_name IN (
             'athletes_empty_backup', 'relay_athletes_d3_backup',
             'relay_results_d3_backup', 'relay_results_20260819_backup',
             'results_d1_backup', 'results_d2_backup',
             'results_xsource_20260819_backup',
             'results_accidental_import_20260819_backup',
             'results_athlete_merge_backup'
           )) <> 63 THEN
    RAISE EXCEPTION 'public rollback-table restoration postcondition failed';
  END IF;

  RAISE NOTICE 'restored nine rollback tables and 621336 rows to public';
END
$$;

COMMIT;
