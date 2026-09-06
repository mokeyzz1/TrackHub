# Restore the existing insert-only waitlist flow

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

## Confirmed cause and change

The frontend `addToWaitlist` inserts email/feature without supplying an ID. The table default
calls `nextval(public.waitlist_id_seq)`, but live anon/authenticated roles lacked sequence USAGE.
The positive policy test reproduced SQLSTATE 42501, permission denied for waitlist_id_seq.
The table INSERT grant and input-validation RLS policy were already present.

Migration `20260905195401_restore_waitlist_sequence_usage.sql` grants **only USAGE** on that
sequence to anon/authenticated, after asserting its ownership relationship to waitlist.id.
No new table/function or expanded table access. PostgreSQL documents the required privilege
in [sequence functions](https://www.postgresql.org/docs/17/functions-sequence.html).

## Before-image and rollback

Before sequence ACL: `{postgres=rwU/postgres,service_role=rwU/postgres}`. Both public roles had
USAGE/SELECT/UPDATE=false. Waitlist contained one row; sequence last_value=9, is_called=true.
Rollback: `REVOKE USAGE ON SEQUENCE public.waitlist_id_seq FROM anon, authenticated;`.
This rollback was tested locally and restores the prior missing permission; it would break
new anonymous signups again. Never reset the sequence to its prior value.

## Verification

- All 23 isolated PostgreSQL tests pass. The new scenario checks both public roles across all
  31 application tables, valid waitlist insertion, invalid-input rejection, and denied reads
  of waitlist/push tokens/private runs and denied result deletion. All writes are synthetic
  and rolled back; sequence increments in the disposable test database are not rolled back.
- Live after: anon/authenticated USAGE=true, sequence SELECT/UPDATE=false; waitlist
  SELECT/UPDATE/DELETE=false. Service-role privileges unchanged. Row count=1 and sequence=9
  unchanged. No live signup was inserted and no app-screen test is claimed.
- Local file matches the ledger's sole stored SQL entry (MD5 c8bc408c7e2218c1447a5e8c79b6aa75);
  SHA-256/fingerprint are recorded in the approved history manifest. Filename aligned to the
  actual live ledger version without replay.
- Security advisors before/after: same 13 findings, no new finding. Eleven private-ingest
  no-policy information notices are intentional deny-public posture. Existing push-registration
  [anonymous](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
  and [authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
  SECURITY DEFINER warnings remain explicit review, not silently waived or revoked.

This fixes a database permission dependency in an existing flow. It does not certify every RPC,
platform policy, abuse-control mechanism or future default privilege. No public performance data
was touched and no unrelated pending migration was applied.
