# Current application-schema test baseline

Read-only PostgreSQL 17 `pg_dump --schema-only` captured today's `public`, `ingest`, and `archive`
schemas from the configured production project. No table data was copied and no live objects
were changed. The configured password was passed privately through the process environment,
not command arguments or committed files.

Preserved ignored artifact: `.db-baselines/20260905/current-owner-schema.dump`.
SHA-256: `8db4bc6ae5f6c6ee1a225f19a13cfbbade83246414a64c48d9679b29bf567638`.
This is a schema snapshot, not a fresh full-data backup and not a replacement for the September 2
restore-tested archives or per-operation before-images.

Strict schema-only restore into a newly created isolated database succeeded. Restored objects:
20 public tables, four public views, ten ingest tables, nine archive tables. The temporary server
uses only a private Unix socket; the original archived restore cluster was not modified.

All nine ingestion PostgreSQL tests pass using `TRACK_SCHEMA_TEST_TEMPLATE=current_owner_schema`
and the isolated socket. Each run clones that schema-only template and removes only its own
randomly named fixture database. The existing archived-template option remains available.

Twenty-one master-register entries (four core ingest tables plus all source-record/source-link
columns) now record their purpose, shared-path evidence, and remaining issues. They are marked
reviewed, not complete: immutable per-run raw evidence and broader lifecycle/relationship checks
remain open. Coverage tests still require all 1,709 captured entries.

This proves a current-schema test baseline. It does not prove an empty project can replay the
historical migration chain, that managed Supabase services are restored, or that the current
worktree is deployable. The untracked active migration remains a preflight blocker.

Rollback: revert repository test/review changes if needed. The added local schema-only snapshot
can be retained for reproducibility; no production rollback is necessary.
