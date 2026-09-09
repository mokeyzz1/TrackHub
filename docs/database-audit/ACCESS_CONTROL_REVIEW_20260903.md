# Access-control review — 2026-09-03

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

## Live findings

The read-only catalog check found one RLS exception in the application-owned schemas:

- `public.results_athlete_merge_backup` has RLS disabled and has no public policy.
- The table is an 11-row historical archive; its grants must remain restricted to service roles.

All other `public` and `ingest` base tables have RLS enabled. `anon` and `authenticated` have no
direct INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, or TRIGGER grants on the application tables;
the only public-role write grant is the constrained `INSERT` path on `public.waitlist`.

The `ingest` tables have no row policies but are protected by RLS plus explicit service-role and
postgres grants. That is an intentional private-schema boundary, not an omission to “fix” by adding
public policies.

## Function security

Application functions use fixed `search_path` settings including `pg_temp`. The only application
security-definer function is `public.register_push_token(text,text)`, which is the intended
validated public RPC. Ingest recovery functions are invoker-security functions and are not public
table write grants.

## Disposition

No access-control change is being applied in this pass. The backup exception will be verified against
its complete ACL and archive-retention policy before deciding whether to enable RLS or move the
archive into the private `ingest` boundary. Managed `auth`, `storage`, `realtime`, and `vault`
security surfaces remain platform-owned and are documented but not modified.

## Post-move checkpoint — 2026-09-04

The backup tables were moved to the private `archive` schema in a separate reversible migration.
`archive.results_athlete_merge_backup` has RLS disabled by design, but its live ACL is
`postgres=arwdDxtm` and `service_role=r`; `anon` and `authenticated` have no SELECT privilege. The
same private-schema boundary applies to all nine historical backup tables. No public policy is
needed, and no archive rows were changed.
