BEGIN;

-- Trigger-only helpers do not need browser EXECUTE privileges. The rollback-only test verified
-- that both triggers continue to fire after these grants are removed. Keep operator roles intact.
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE (n.nspname, p.proname) IN (
        ('public', 'update_updated_at_column'),
        ('ingest', 'clear_recovery_queue_error_on_complete')
      )
        AND p.prokind = 'f') <> 2 THEN
    RAISE EXCEPTION 'expected both application trigger helpers to exist';
  END IF;

  IF (SELECT count(*)
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE NOT t.tgisinternal
        AND (n.nspname, p.proname) IN (
          ('public', 'update_updated_at_column'),
          ('ingest', 'clear_recovery_queue_error_on_complete')
        )) <> 7 THEN
    RAISE EXCEPTION 'application trigger helper attachment count drifted';
  END IF;
END
$$;

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION ingest.clear_recovery_queue_error_on_complete() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ingest.clear_recovery_queue_error_on_complete() TO service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.update_updated_at_column()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.update_updated_at_column()', 'EXECUTE')
     OR has_function_privilege('anon', 'ingest.clear_recovery_queue_error_on_complete()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'ingest.clear_recovery_queue_error_on_complete()', 'EXECUTE') THEN
    RAISE EXCEPTION 'browser execute privilege remains on a trigger helper';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.update_updated_at_column()', 'EXECUTE')
     OR NOT has_function_privilege('postgres', 'public.update_updated_at_column()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'ingest.clear_recovery_queue_error_on_complete()', 'EXECUTE')
     OR NOT has_function_privilege('postgres', 'ingest.clear_recovery_queue_error_on_complete()', 'EXECUTE') THEN
    RAISE EXCEPTION 'operator execute privilege was removed from a trigger helper';
  END IF;
END
$$;

COMMIT;
