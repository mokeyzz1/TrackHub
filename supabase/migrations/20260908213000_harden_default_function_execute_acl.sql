-- SEC-01: keep future application functions private by default.
-- Existing RPCs keep their explicit grants; this only changes defaults for functions
-- subsequently created by the migration owner. Platform-managed supabase_admin defaults
-- are intentionally untouched.

BEGIN;

-- PostgreSQL's built-in global function default grants EXECUTE to PUBLIC. Revoke it
-- globally first; a per-schema REVOKE cannot remove a global default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ingest
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA archive
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ingest
  GRANT EXECUTE ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA archive
  GRANT EXECUTE ON FUNCTIONS TO service_role;

COMMIT;
