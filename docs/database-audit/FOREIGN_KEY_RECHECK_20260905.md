# Declared reference integrity verified

The read-only aggregate scanner checked all 75 non-system foreign keys: 18 auth, 23 ingest,
29 public and five storage. All are validated. Live results: zero orphan rows, zero invalid
MATCH FULL partial-null rows, zero unsupported operators/match modes and zero query errors.
The saved profile is compared against all 75 relationship entries in the object register.

Nullable MATCH SIMPLE references are not treated as orphans. For MATCH FULL, wholly null keys
are allowed but partially null keys are counted separately. Nonstandard equality operators are
explicitly reported unsupported instead of being guessed. The local regression deliberately
creates valid, orphaned and partially null historical rows before adding a NOT VALID composite
FK, proves the scanner detects them, and preserves all four fixture rows. All 24 PostgreSQL
tests pass from a fresh isolated cluster.

Execution: `foreign_key_scan.sql` inside a transaction with a 90-second local timeout, then
aggregate export from its temporary profile table. No permanent write, trigger disable, FK
validation operation, source rewrite or row deletion. Evidence: `foreign_key_profile_20260905.json`.

This establishes current declared-reference existence, not identity correctness, undeclared
relationships, appropriate cascade behavior, or future safety if constraints are bypassed.
An existing but wrong athlete/meet reference passes an FK; source-aware identity review remains
open. Per-check snapshots are not a globally frozen application state. No data rollback needed.
