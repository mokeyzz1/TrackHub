# Full database inventory — 2026-09-03

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
