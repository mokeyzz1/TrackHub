# ING-02a: real PostgreSQL promotion concurrency

The isolated integration test reproduced a real defect: two providers promoting the same new
performance concurrently created one fact but quarantined the second observation with an insert
conflict. Sequential mocks did not expose the stale candidate read.

The shared writer now takes transaction-scoped advisory locks before reading source links and
canonical candidates. Locks cover source records, meets, and athlete/event identity for history
claims across meets. Numeric hash ordering is consistent and acquisition uses one round trip.
Unrelated meets/athletes retain independent locks. Locks release on commit/rollback; no lock table
or database migration was added. All writers must use this updated path to benefit; old/direct
writers are not coordinated by advisory locks and remain a broader ingestion audit concern.

Seven real-PostgreSQL scenarios (eight TAP tests including the parent) pass:
FK-error staging rollback; sequential replay/cross-provider matching; quarantine isolation;
private payload access denial; concurrent provider matching; concurrent same-source replay;
and writer-failure rollback with advisory-lock release. The initial concurrency scenario failed
before the fix and passed afterward. Historical unit/ingestion suites were rerun separately.

Safety: initialized a fresh PostgreSQL 17 cluster on a private temporary Unix socket with no TCP
listener. Restored schema only from the September 2 owner archive; no production records copied.
Each run creates a randomly named test database, inserts synthetic fixtures, closes connections,
then drops only that generated test database. Socket and server data-directory checks reject
remote or unrelated databases. Without `TRACK_SCHEMA_TEST_SOCKET`, this integration suite skips;
a skipped test is not verification. Production and the original backup/restore copy are unchanged.

Reproduce after provisioning the schema-only test template:
`TRACK_SCHEMA_TEST_SOCKET=/tmp/track-schema-validation.<suffix> npm run test:ingestion-postgres`.
The fixture server must listen only on its private socket, port 55434, and use `<socket>/pgdata`.
The schema-only `postgres` template requires the archived schema and anon/authenticated/service_role/
supabase_admin roles; the test creates its disposable database from it.

This validates the shared core against the archived schema, not complete current-schema parity,
full historical migration replay, every source adapter, changed-payload semantics, or all API
relationships. Those remain open. No historical quarantine was retried or deleted. Rollback is
reverting the code checkpoint; no live before-image is needed because no production write occurred.

Design followed the Supabase Postgres skill's transaction advisory lock, consistent ordering and
short transaction guidance. There are no external source fetches inside the promotion transaction.
