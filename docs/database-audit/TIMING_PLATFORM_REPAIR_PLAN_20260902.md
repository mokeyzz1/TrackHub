# Timing-platform repair plan

Date: 2026-09-02

Status: prepared and isolated-test verified; no production rows changed

## Scope

The read-only scan in `timing_platform_repair_scan.sql` identifies 1,697 rows eligible under
the historical migration predicate. A conservative policy separates them into:

- **1,342 known-provider changes**: the URL matches a named provider supported by the existing
  detector (including Athletic.net, TFRRS, MileSplit, PT Timing, FlashResults, and the other
  explicit provider branches); and
- **325 held changes**: generic or intermediary hosts that would only become `other` or
  `other_timing` from URL text alone.

The 1,342 known-provider candidates are all `completed` meets. There are no `upcoming` or `live`
rows in this proposed write set, so the repair will not change the routing of an active meet.

## Existing database safety primitives

The repair can reuse the existing private `ingest.fact_cleanup_archive` table. It has the following
columns and does not require a new persistent table:

`operation_key`, `source_table`, `source_pk`, `row_data`, and `archived_at`.

Seven prior operation keys are present. A new operation key must be checked for uniqueness before
the transaction begins, for example:

`20260902_timing_platform_known_provider_repair`

`public.meets` has one non-internal trigger, `update_meets_updated_at`, which fires before updates.
The repair must archive each original `timing_platform` and `updated_at`, and the rollback must
restore both values so a rollback is exact despite that trigger.

The only live RLS policy on `public.meets` is public read access. No meet-specific write policy or
additional meet trigger was found. Application code currently implements only the Athletic.net
live/final scraper; other provider labels are logged or skipped, so the completed-only scope has
low operational impact.

## Proposed transaction (not yet executed)

1. Verify the archive operation key is unused.
2. Recompute the detector CASE and assert the exact expected set of 1,342 known-provider rows.
3. Insert one before-image per row into `ingest.fact_cleanup_archive` with the full `public.meets`
   row JSON, not only the two changed fields.
4. Assert the archive count and operation-owned meet-id set exactly match the dry-run fingerprint.
5. Update only rows whose stored value is blank, `other`, or `other_timing` and whose projected value
   is one of the explicit known-provider labels.
6. Assert every archived row now has the expected projected label and that no held fallback row was
   changed.
7. Commit only after all assertions pass.

The transaction should fail closed on a changed candidate count, a reused operation key, a partial
archive, a missing meet, or a postcondition mismatch. The 325 held rows remain untouched.

## Rollback design

The paired rollback will:

1. Require exactly 1,342 archive rows for the operation key.
2. Restore `timing_platform` and `updated_at` from the archived JSON, scoped by `meet_id`.
3. Verify every restored row matches its before-image exactly.
4. Remove only the operation-owned archive rows after successful verification.

This plan is intentionally separate from migration-history reconciliation. It does not mark any
Supabase migration as applied and does not create a public repair command.

## Isolated replay verification

The apply and rollback scripts were replayed against a fresh PostgreSQL 17 restore of the retained
owner-schema snapshot (local port 55433). Results:

- first apply archived and updated exactly 1,342 rows;
- apply replay verified the archive and completed as a no-op;
- rollback restored all 1,342 rows, including the archived `updated_at` values;
- post-rollback candidate count and fingerprint returned to 1,342 and
  `5f860770aa852c58deb0da12addd63f7`; and
- rollback replay completed as a safe no-op with no archive rows left behind.

The test server was stopped after verification. The retained baseline dump and the live database
were not modified.

## Approval gate

No migration or production write should be created/executed until the owner approves the exact
1,342-row known-provider scope. The 325 generic/intermediary rows require a separate policy
decision and are not part of this proposed repair.
