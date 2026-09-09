# ING-02c1: preserve the evidence each observation consumed

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

Implemented and verified locally; additive private migration applied live as
`20260905183823_preserve_ingestion_source_versions`. Shared worker code is updated in this
checkout. No scraper run was launched, no public fact was changed, and no app deployment is claimed.

## Model and behavior

`source_records` remains the provider-qualified identity and latest-payload compatibility row.
The new private `source_record_versions` represents a distinct missing entity: immutable evidence
versions. Its composite primary key is source-record ID plus SHA-256 of canonical JSON containing
payload and source URL/meet/event locators. Repeated identical evidence shares one version across
runs; no redundant surrogate ID or per-run payload copy. JSON object keys sort recursively; array
order is meaningful and preserved. Existing `payload_hash` semantics are not repurposed.

Each observation references its exact version through a nullable hash and composite foreign key.
The staging transaction inserts versions append-only; payload-only or normalized changes within
the same run roll back atomically. A new run can retain new evidence without changing old evidence.
Promotion reads the referenced version, never the latest payload. A legacy observation with no
snapshot and no prior fact link is held as `missing_source_snapshot`; a prior linked fact is kept
without rebuilding relay participation from unknowable raw data.

This does **not** implement automatic correction of already-linked public facts. Existing replay
keeps the prior fact. A reviewed correction workflow and audits of direct/older writers remain
ING-02c work. Privileged database owners can still modify data: append-only application behavior
and service-role privileges are not a claim of tamper-proof storage against administrators.

## Evidence and tests

- 234 ingestion tests pass; two canonical-evidence hash tests pass.
- 12 PostgreSQL tests pass (11 scenarios plus parent) against a disposable clone of the current
  schema-only restore. Migration BEGIN/ROLLBACK removes the candidate schema cleanly; applying it
  afterward succeeds. Synthetic data only.
- Cross-run payload-change test proves the earlier staged result uses its original wind even
  after a later scrape replaces the latest payload. Identical evidence deduplicates.
- Payload-only same-run conflict rolls back. Unknown legacy evidence creates no public fact.
- Service role can select/insert versions but cannot update; invalid snapshot FK is rejected.
- Existing replay, concurrent imports, quarantine and transactional failure tests still pass.
- Live precheck: 156,385 observations, 44,514 pending, 24,895 source identities observed in multiple
  runs. These counts measure exposure, **not** how many payloads actually changed or were corrupted.
- Live postcheck: same observation/pending counts, zero new versions and zero snapshot references;
  RLS enabled, FK validated, anon/authenticated SELECT denied, service-role INSERT allowed and
  UPDATE/DELETE denied. No historical backfill. No named trackhub workers appeared in the activity
  snapshot; that observation is not a guarantee that unrelated clients cannot run later.

## Deployment and preservation

Used exact reviewed SQL through targeted migration application, not a directory-wide `db push`.
The unrelated untracked LAI migration and 39 held migrations were not executed. The returned live
version was read from the ledger and the local CLI-created filename aligned to it. Approved history
now has 86 migrations. Whole-directory preflight must continue rejecting the unrelated draft.

The fresh pre-change schema archive/hash and strict restore are documented in
`CURRENT_SCHEMA_TEST_BASELINE_20260905.md`; historical backups remain intact. The change is additive:
no table/row was dropped or overwritten. Existing nullable references explicitly preserve unknown
historical evidence rather than claiming today's payload was the original. The new FK intentionally
prevents deleting a source identity while evidence references it; no cascading evidence deletion.

Rollback after deployment is to revert the worker changes while **retaining** the additive table,
column and any versions already stored. Do not drop populated evidence to undo application code.
Pre-commit migration failure rolls back transactionally (tested); there is no destructive down script.

## Security review and remaining queue

Supabase skill guidance informed private-schema RLS, least-privilege grants and real role tests.
The existing security advisor findings for `v_athlete_prs` and `register_push_token` predate this
migration and remain SEC-01 review items, not silently fixed by this change. A private deny-by-default
table deliberately has no public policies; do not add a permissive policy just to silence the
[RLS-without-policy informational advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
Role-test approach is consistent with [Supabase testing guidance](https://supabase.com/docs/guides/local-development/testing/pgtap-extended).

Next: use the explicit snapshot-backed correction workflow in
`SOURCE_CORRECTION_WORKFLOW_20260908.md` for reviewed fact changes; continue historical recovery
only where source evidence exists. Direct-writer inventory and fail-closed guards are recorded in
`DIRECT_WRITER_INVENTORY_20260908.md`. The existing PR view's advisor finding and entire schema
cleanup remain open.
