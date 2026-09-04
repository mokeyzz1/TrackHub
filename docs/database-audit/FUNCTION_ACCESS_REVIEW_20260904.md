# Function and RPC access review — 2026-09-04

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
| `ingest.clear_recovery_queue_error_on_complete()` | `proacl` is NULL, so PostgreSQL's default PUBLIC execute applies; no anon/auth schema usage and it is only a trigger helper | An ACL hygiene candidate, not a reachable browser write path. Revoke only in a separately tested migration. |
| `public.detect_timing_platform(text)` | Invoker, pinned path, executable by public API roles | Read-only URL classification used by routing; it does not write facts. |
| `public.get_top_performances(...)` | Invoker, pinned path, executable by public API roles | Read-only home leaderboard RPC. Its WA-point formulas are ranking logic and are separate from source-supplied multi-event aggregate scores. |
| `public.get_weekly_performances(...)` | Invoker, pinned path, executable by public API roles | Read-only weekly performance query. |
| `public.update_updated_at_column()` | Invoker trigger helper with public execute ACL | Trigger-only timestamp helper; public execute is unnecessary but not a table-write grant. Review with the ingest helper. |
| `public.register_push_token(text,text)` | Security definer, pinned path, explicitly executable by `anon`, `authenticated`, and `service_role`; PUBLIC is revoked | Deliberate anonymous RPC used by the app to register one token. It validates length/platform, then upserts by the unique token key. |

The trigger listing confirms that the two helper functions are attached to table triggers; they are
not application RPCs that accept arbitrary table identifiers or SQL. The ingest schema is not usable
by `anon` or `authenticated`, and the `push_tokens` table itself has no browser table grant.

## `push_tokens` safety check

The table currently contains one active row. Its shape is intentionally narrow: UUID primary key,
non-null Expo token with a unique constraint, optional platform, timestamps, and an active flag.
Its only policies are `push_tokens_service_read` and `push_tokens_service_write` for `service_role`;
table grants are limited to `postgres` and `service_role`. Therefore the security-definer function
is the only browser write path, and its inputs are constrained before the upsert.

## Disposition

No live change is approved from this checkpoint. Keep the public read RPCs and the validated token
RPC because they are existing application contracts. Keep all ingest routines private. A future ACL
hygiene migration may explicitly revoke PUBLIC execute from the two trigger helpers, but it must first
prove trigger behavior in a rollback-only test and re-check the exact function signatures. Do not
create a table or duplicate the RPC surface to solve this issue.

The multi-event product rule remains unchanged: the database/source supplies the aggregate score;
the current read fix selects the highest supplied Finals value and does not calculate or rewrite it.

## Reproducible evidence

- `function_access_scan.sql` contains the exact catalog, trigger, policy, grant, and row-count queries.
- `ACCESS_CONTROL_REVIEW_20260903.md` records the broader table/RLS boundary and the private archive
  move. This packet adds the function-level ACL evidence.
- No production rows, policies, functions, or privileges were changed for this review.
