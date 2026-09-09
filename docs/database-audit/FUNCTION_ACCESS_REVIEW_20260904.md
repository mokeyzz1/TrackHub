# Function and RPC access review — 2026-09-04

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

This is a read-only production checkpoint for application-owned PostgreSQL functions. It does not
change function privileges, table policies, or data. The goal is to distinguish intentional API
entry points from private ingest helpers before any ACL migration is considered.

## Live inventory

- There are 17 application-owned functions in `public`, `ingest`, and `archive`: 5 in `public`,
  12 in `ingest`, and none in `archive`.
- Every function has a fixed `search_path` that includes `pg_temp` only where needed. The private
  ingest routines use `ingest, public, pg_temp`; public routines use `public, pg_temp`.
- No application function is `SECURITY DEFINER` except `public.register_push_token(text,text)`.

## Execution boundary

| Surface | Live privilege finding | Meaning |
| --- | --- | --- |
| `ingest` operational functions (11) | Explicit `EXECUTE` for `service_role` and `postgres`; no `anon` or `authenticated` execute | Private queue/provenance operations remain service-side. |
| `ingest.clear_recovery_queue_error_on_complete()` | Trigger-only helper; its default PUBLIC execute was removed by the ACL hardening migration. | `anon`/`authenticated` cannot execute it; `service_role`/`postgres` remain operators. |
| `public.detect_timing_platform(text)` | Invoker, pinned path, executable by public API roles | Read-only URL classification used by routing; it does not write facts. |
| `public.get_top_performances(...)` | Invoker, pinned path, executable by public API roles | Read-only home leaderboard RPC. Its WA-point formulas are ranking logic and are separate from source-supplied multi-event aggregate scores. |
| `public.get_weekly_performances(...)` | Invoker, pinned path, executable by public API roles | Read-only weekly performance query. |
| `public.update_updated_at_column()` | Trigger-only helper on six public tables; PUBLIC/anon/authenticated execute was removed by the ACL hardening migration. | Trigger behavior remains intact; `service_role`/`postgres` retain execute. |
| `public.register_push_token(text,text)` | Security definer, pinned path, explicitly executable by `anon`, `authenticated`, and `service_role`; PUBLIC is revoked | Deliberate anonymous RPC used by the app to register one token. It validates length/platform, then upserts by the unique token key. |

The trigger listing confirms that the two application helper functions are attached to seven table
triggers; they are not application RPCs that accept arbitrary table identifiers or SQL. The
platform-owned `storage` trigger helpers were excluded. The ingest schema is not usable by `anon` or
`authenticated`, and the `push_tokens` table itself has no browser table grant.

## `push_tokens` safety check

The table currently contains one active row. Its shape is intentionally narrow: UUID primary key,
non-null Expo token with a unique constraint, optional platform, timestamps, and an active flag.
Its only policies are `push_tokens_service_read` and `push_tokens_service_write` for `service_role`;
table grants are limited to `postgres` and `service_role`. Therefore the security-definer function
is the only browser write path, and its inputs are constrained before the upsert.

## Disposition

The rollback-only trigger test succeeded after revoking browser/public execute: both helpers still
fired, while `anon` and `authenticated` had no execute privilege. The ACL hardening migration then
applied that change to the live database and preserved `service_role`/`postgres` execution. Keep the
public read RPCs and the validated token RPC because they are existing application contracts. Do
not create a table or duplicate the RPC surface to solve this issue.

The multi-event product rule remains unchanged: the database/source supplies the aggregate score;
the current read fix selects the highest supplied Finals value and does not calculate or rewrite it.

## SEC-01 closure follow-up — 2026-09-09

The broader role, policy, trigger and default-privilege audit is recorded in
`SECURITY_CONTRACT_AUDIT_20260909.md`. A live catalog check found that postgres-owned future
functions would inherit browser `EXECUTE` through the global default even though current
functions were explicitly secured. Migration `20260908213000_harden_default_function_execute_acl`
revokes that future default and grants private `service_role` defaults in `ingest` and `archive`.
Existing RPC ACLs and trigger behavior were rechecked unchanged; no table or row data changed.

## Reproducible evidence

- `function_access_scan.sql` contains the exact catalog, trigger, policy, grant, and row-count queries.
- `ACCESS_CONTROL_REVIEW_20260903.md` records the broader table/RLS boundary and the private archive
  move. This packet adds the function-level ACL evidence.
- The ACL hardening migration changed only two function ACLs; no production rows, policies, tables,
  or function bodies changed. Its guarded rollback is
  `docs/database-audit/rollback_harden_trigger_helper_execute_acl.sql`.
