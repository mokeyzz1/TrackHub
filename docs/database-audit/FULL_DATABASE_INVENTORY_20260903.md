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
