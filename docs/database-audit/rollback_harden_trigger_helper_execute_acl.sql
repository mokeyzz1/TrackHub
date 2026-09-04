-- Guarded rollback for migration 20260904230000_harden_trigger_helper_execute_acl.sql.
-- This restores only the old browser/public EXECUTE grants. It does not touch storage functions.

BEGIN;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.update_updated_at_column()', 'EXECUTE')
     OR has_function_privilege('anon', 'ingest.clear_recovery_queue_error_on_complete()', 'EXECUTE') THEN
    RAISE EXCEPTION 'trigger-helper browser grants are already present; refusing to broaden them';
  END IF;
END
$$;

GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ingest.clear_recovery_queue_error_on_complete() TO PUBLIC, anon, authenticated;

COMMIT;
