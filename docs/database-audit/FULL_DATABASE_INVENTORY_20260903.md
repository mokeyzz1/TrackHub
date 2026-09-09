# Full database inventory — 2026-09-03

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

## Purpose and safety

This is the first complete-instance catalog for the live Supabase PostgreSQL project. It is
read-only. No tables, columns, rows, policies, grants, functions, or other database objects were
changed while producing this inventory.

The inventory is deliberately broader than the application-facing audit. It includes application
schemas, Supabase-managed schemas, extension-facing schemas, migration metadata, and the vault
schema. Managed and PostgreSQL system objects are documented for completeness but are not presumed
safe or appropriate to modify.

## Instance-level catalog

The live catalog currently reports these non-system schemas:

| Schema | Tables | Views | Sequences | Role in this project |
| --- | ---: | ---: | ---: | --- |
| `auth` | 23 | 0 | 1 | Supabase authentication internals |
| `extensions` | 0 | 2 | 0 | Extension-provided views |
| `graphql` | 0 | 0 | 0 | Supabase GraphQL metadata |
| `graphql_public` | 0 | 0 | 0 | GraphQL API surface |
| `ingest` | 10 | 0 | 8 | Private ingestion, provenance, recovery, and archive data |
| `public` | 30 | 4 | 18 | Track-meet application data and public API surface |
| `realtime` | 3 | 0 | 1 | Supabase Realtime internals |
| `storage` | 8 | 0 | 0 | Supabase Storage internals |
| `supabase_migrations` | 1 | 0 | 0 | Applied migration metadata |
| `vault` | 1 | 1 | 0 | Supabase encrypted-secret storage |

Across those schemas the catalog contains 76 tables, 7 views, and 29 sequences. The complete
column catalog was retrieved from `information_schema.columns`, including ordinal position, data
type, underlying type, nullability, defaults, and numeric/length metadata.

## Security and structural surface

- `public` has 23 row-level-security policies in the live catalog.
- The live catalog includes constraints in both application and managed schemas; the application
  schemas currently report 21 primary keys and 30 foreign keys in `public`, and 10 primary keys
  and 21 foreign keys in `ingest`.
- Functions and triggers were enumerated by schema, as were installed extensions.
- Installed extensions include `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, and
  `uuid-ossp`.

## Exact application-schema counts captured

The current live audit evidence and bounded schema pass provide these exact counts. They are
inventory facts, not PostgreSQL estimates:

| Schema | Table | Rows |
| --- | --- | ---: |
| `ingest` | `athlete_aliases` | 1,339 |
| `ingest` | `event_recovery_queue` | 10,608 |
| `ingest` | `fact_cleanup_archive` | 138,911 |
| `ingest` | `observations` | 156,385 |
| `ingest` | `quarantine` | 9,648 |
| `ingest` | `recovery_queue` | 2,573 |
| `ingest` | `runs` | 1,497 |
| `ingest` | `source_links` | 41,214 |
| `ingest` | `source_records` | 54,518 |
| `ingest` | `team_aliases` | 114 |
| `public` | `athletes` | 151,537 |
| `public` | `athlete_team_seasons` | 127,357 |
| `public` | `results` | 3,419,178 |
| `public` | `relay_results` | 200,736 |
| `public` | `relay_athletes` | 450,685 |
| `public` | `schools` | 1,786 |
| `public` | `teams` | 3,516 |
| `public` | `athlete_prs` | 475,523 |
| `public` | `event_types` | 67 |
| `public` | `event_aliases` | 1,329 |

Additional exact public counts include `meets` 12,973, `conferences` 1,114, `divisions` 6,
`regions` 27, `external_ids` 356, `events` 0, `conference_memberships` 0, `live_results` 48,
`unmapped_events` 46, `push_tokens` 1, and `waitlist` 1. The public backup/archive counts are
`athletes_empty_backup` 12,518, `relay_results_d3_backup` 40,935,
`relay_athletes_d3_backup` 89,085, `results_d1_backup` 23,766,
`results_d2_backup` 453,737, `results_xsource_20260819_backup` 1,252,
`results_accidental_import_20260819_backup` 31, `results_athlete_merge_backup` 11, and
`relay_results_20260819_backup` 1.

The remaining small public tables, backup tables, and managed-schema tables are being counted in
separate bounded batches. Large historical fact/archive counts are intentionally not inferred from
PostgreSQL statistics; the final report will record the exact query result or an explicit count
limitation.

## Exact managed-schema counts captured

The managed-schema batch completed without count errors:

| Schema | Exact rows across tables | Notable populated objects |
| --- | ---: | --- |
| `auth` | 77 | `schema_migrations` only; user/session/auth data is currently empty |
| `realtime` | 81 | `schema_migrations` only; subscription/message tables are empty |
| `storage` | 1,906 | 1 bucket and 1,840 storage objects |
| `supabase_migrations` | 64 | applied migration metadata |
| `vault` | 0 | encrypted-secret table currently empty |

The same pass captured 240 auth columns, 20 realtime columns, 71 storage columns, 6 migration
metadata columns, and 17 vault columns, plus the managed enum types. These objects are included in
the catalog for completeness; they are not candidates for application-level consolidation.

## Required follow-through

This file is an inventory baseline, not a cleanup decision. Every cataloged object still needs an
evidence-backed disposition:

1. Identify ownership and purpose.
2. Profile data-bearing objects with exact row counts and column-level quality metrics.
3. Map foreign keys, policies, grants, routines, triggers, views, and application references.
4. Decide whether the object is canonical, needs improvement, should be consolidated, archived,
   retired, managed/left untouched, or requires an owner decision.
5. Record unresolved questions explicitly; no cleanup is complete while an object lacks a
   disposition.

The next pass is the per-schema/per-object review. It will not create a new private table or run a
cleanup migration merely to hold audit state.

## Current catalog checkpoint — 2026-09-04

After the archive-boundary and empty-table cleanup waves, a fresh catalog count reports:

| Schema | Tables | Views | Sequences |
| --- | ---: | ---: | ---: |
| `archive` | 9 | 0 | 0 |
| `auth` | 23 | 0 | 1 |
| `extensions` | 0 | 2 | 0 |
| `graphql` | 0 | 0 | 0 |
| `graphql_public` | 0 | 0 | 0 |
| `ingest` | 10 | 0 | 8 |
| `public` | 20 | 4 | 17 |
| `realtime` | 2 | 0 | 1 |
| `storage` | 8 | 0 | 0 |
| `supabase_migrations` | 1 | 0 | 0 |
| `vault` | 1 | 1 | 0 |

The live instance therefore contains 74 tables, 7 views, and 27 sequences across these
non-system schemas. `public` currently has 22 RLS policies. The migration ledger contains 83 rows,
ending at `20260904195352_fix_v_athlete_prs_points_source`.

The nine private archive tables retain the exact before-image counts: `athletes_empty_backup`
(12,518), `relay_athletes_d3_backup` (89,085), `relay_results_20260819_backup` (1),
`relay_results_d3_backup` (40,935), `results_accidental_import_20260819_backup` (31),
`results_athlete_merge_backup` (11), `results_d1_backup` (23,766), `results_d2_backup` (453,737),
and `results_xsource_20260819_backup` (1,252). The public `events` table and its sequence are
absent after the dependency-checked retirement; `live_results` remains intentionally deferred.

This checkpoint supersedes the earlier pre-cleanup counts in this file for current-state work. The
original baseline remains preserved as historical evidence.
