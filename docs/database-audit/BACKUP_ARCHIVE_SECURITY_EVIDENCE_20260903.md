# Public backup archive security evidence — 2026-09-03

## Live ACL/RLS check

All nine `public.*_backup` tables are inaccessible to `anon` and `authenticated`, and all grant
full table privileges only to `postgres` and `service_role`. No backup table has a public policy.

Eight backup tables have RLS enabled. The single exception is
`public.results_athlete_merge_backup`; it has RLS disabled, but its ACL is still restricted to
`postgres` and `service_role` and it has no public policy.

| Archive class | RLS | Public-role SELECT | Service-role SELECT |
| --- | --- | --- | --- |
| 8 standard backup tables | enabled | false | true |
| `results_athlete_merge_backup` | disabled | false | true |

## Disposition

The current ACL boundary prevents public exposure, so no emergency data move is required. Keep all
archives until their associated cleanup decisions and rollback windows close. For defense in depth,
prepare a separate, reversible hardening migration to enable RLS on the exception (with an explicit
service-role policy) after testing archive restore paths; do not combine that with data deletion or
table relocation.

Before any archive retirement or move:

1. Record exact row counts and checksums per archive.
2. Verify each archive’s operation key and source-table linkage.
3. Test service-role restore into an isolated transaction.
4. Recheck `anon`/`authenticated` privileges and policies after the change.

No archive rows, ACLs, or RLS settings were changed by this review.
