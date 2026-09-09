# All registered table columns now have aggregate profiles

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

The second live scan covered 513 columns across 45 tables in archive, auth, realtime, storage,
supabase_migrations and vault. Combined with the application profile, automated comparison
against the register accounts for all **872 table columns across 76 tables**. The 105 view
columns remain outside this table-profile checkpoint. No rows, credentials, tokens or stored
secret values were exported; the artifact contains only column names and aggregate counts.

Evidence: `platform_archive_column_profile_20260905.json` plus `column_profile_20260905.json`.
The secondary scan completed in roughly five seconds. It used `BEGIN`, session-local
`trackhub.audit_schemas='archive,auth,realtime,storage,supabase_migrations,vault'`, the checked-in
`quality_scan.sql` with a 90-second local timeout, `COMMIT`, and aggregate export from its
session-local temporary table. There were no permanent writes or schema changes.

The profiler now supports explicit schema scope (default remains public/ingest) and partitioned
parents. A synthetic custom-schema partition test proves scope isolation and parent/child
coverage. Never sum parent and partition counts as separate data. All 22 PostgreSQL tests and
all 22 history/register tests pass.

## Meaning and limits

- Completeness profiling is now measurable across every registered table column; omissions
  fail the coverage test. It is not a semantic signoff for 872 columns.
- Null or empty managed-platform fields may be required by Supabase's own lifecycle and
  optional features. No platform column is a cleanup candidate solely due to missingness.
- Archive rows remain preserved. A profile is not a backup and does not replace restore tests.
- Each table was aggregated as read; the two scans do not form one consistent database snapshot.
- Distinctness, domains, attribution, policies, grants, functions, dependencies, and all view
  relationships remain separate review gates. No blanket “whole schema finished” conclusion.

Next priority remains application semantics and tested constraints, while platform objects are
reviewed for ownership/exposure rather than redesigned. The data-quality skill informed the
separation of coverage from correctness. Read-only capture has no data rollback requirement.
