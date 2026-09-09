# SEC-01: application security contract audit

Status: complete on 2026-09-09. This checkpoint covers the application-owned `public`,
`ingest`, and `archive` schemas. Managed `auth`, `storage`, `realtime`, `vault`, and the
`supabase_admin` defaults were cataloged but not modified.

## Scope and live inventory

- `public`: 26 base tables and eight views. Every public base table has RLS enabled. The two
  private status-evidence tables intentionally have no public policy or browser grant; the other
  public tables have explicit read/write policies matching their contract.
- `ingest`: 11 base tables. Every table has RLS enabled and no public policy. `anon` and
  `authenticated` have no `USAGE` on the schema, while `service_role` and `postgres` are the
  operational roles.
- `archive`: nine historical backup tables. The schema is private; `service_role` has
  `SELECT` only and `postgres` retains recovery access. RLS is disabled by design because the
  schema ACL is the boundary.
- Browser table privileges are limited to `SELECT` on the published public relations and
  `INSERT` on `public.waitlist`. `anon` and `authenticated` have no table `SELECT` on waitlist,
  no fact-table writes, and no access to private schemas. The waitlist sequence has only the
  narrow `USAGE` grant required by its insert-only default.
- There are 17 application functions and seven application triggers. All functions have pinned
  `search_path` settings. The only security-definer routine is the validated
  `public.register_push_token(text,text)` RPC. Public read RPCs are invoker-security; trigger
  helpers are not browser-executable.

## Live role tests

Read tests passed for both `anon` and `authenticated`: each saw 151,534 public athlete rows and
zero provisional status periods. Private-view and private-schema reads returned PostgreSQL
`42501` permission errors. Fact-table updates were denied. The insert-only waitlist policy
accepted one synthetic insert for each role inside a transaction and both transactions were
rolled back.

The two rolled-back waitlist tests consumed sequence values (PostgreSQL sequences are
non-transactional), moving `waitlist_id_seq.last_value` from the prior recorded 9 to 11. No
waitlist row was retained (the live row count remains 1); the sequence is intentionally not
rewound because gaps are valid and resetting it could collide with future IDs.

## Future-function default hardening

The catalog showed that postgres-owned functions in `public` inherited browser `EXECUTE` by
default, even though every existing function had an explicit ACL. The guarded migration
`20260908213000_harden_default_function_execute_acl.sql` now:

1. revokes the global postgres-owned function `EXECUTE` default from `PUBLIC`, `anon`, and
   `authenticated`;
2. removes the explicit browser defaults in `public`; and
3. grants the private `service_role` default in `ingest` and `archive`.

Existing RPC grants and function bodies were not changed. The transaction rehearsal created a
temporary function and proved `anon=false`, `authenticated=false`, `service_role=true`; it then
rolled back. The live migration was applied once, recorded as ledger version `20260908213000`,
and the same postconditions were verified. The rollback companion is
`rollback_harden_default_function_execute_acl.sql`.

The platform-managed `supabase_admin` default ACLs remain unchanged. Application migrations must
continue to run as `postgres` and explicitly grant any intentional browser RPC.

## Evidence and disposition

- Existing ACL, RLS, policy, function, and trigger evidence: `ACCESS_CONTROL_REVIEW_20260903.md`,
  `FUNCTION_ACCESS_REVIEW_20260904.md`, `function_access_scan.sql`, and
  `WAITLIST_SEQUENCE_ACCESS_20260905.md`.
- This pass found no public data leak, private-schema bypass, unbounded browser write, or
  unpinned application function. No table, column, result, athlete, relay, or source row was
  added, deleted, or rewritten.
- The default-function ACL migration is the only schema-security change. Its exact local SQL
  matches the single live ledger entry and is listed in
  `migration_approved_history_20260908.json`.

PostgreSQL's documented default-function behavior and the global-versus-per-schema rule are the
basis for revoking the global default before applying schema-specific defaults:
<https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html>.
