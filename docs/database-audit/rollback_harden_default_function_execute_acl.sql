-- SEC-01 rollback: restore the previous future-function behavior only.
-- This does not alter existing functions or rows. Run only if the migration must be reverted.

BEGIN;

-- Restore PostgreSQL's prior global PUBLIC EXECUTE default for future functions.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

-- public previously granted future postgres-owned functions to anon/authenticated explicitly.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

-- ingest/archive previously had PostgreSQL's implicit PUBLIC EXECUTE default and no
-- service_role-specific default. Restore that semantic default for future functions.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ingest
  REVOKE EXECUTE ON FUNCTIONS FROM service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ingest
  GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA archive
  REVOKE EXECUTE ON FUNCTIONS FROM service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA archive
  GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

COMMIT;
