# Isolated PostgreSQL regression baseline

`application-schema-pre-checkpoints.sql` is the schema-only `public`/`ingest` export from the
September 5 archive documented in `CURRENT_SCHEMA_TEST_BASELINE_20260905.md`, before this session's
additive evidence and view checkpoints. It preserves table definitions, functions, constraints,
indexes, policies and grants, but no user data or sequence values. Managed and archive schemas are
not included. Schema/role prerequisites are explicit in the bootstrap script.

Run from the repository root with PostgreSQL 17 binaries available:

```sh
npm run test:database-isolated
```

On macOS, set `TRACK_SCHEMA_PG_BIN=/opt/homebrew/opt/postgresql@17/bin` if they are not on PATH.
Install the scraper dependencies first (`npm ci --prefix scrapers`). No production credentials.
The script always creates a fresh private cluster; it never restores into an existing database.
Tests intentionally apply later migrations themselves. Refresh this fixture only with corresponding
test-baseline updates, not as a way to erase migration-history or failing-before evidence.
