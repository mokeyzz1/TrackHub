# Database engineering master checklist

This is the single ordered work queue. `MASTER_CHECKLIST.json` is its exhaustive object register;
other audit documents are supporting evidence, not competing queues. Scope: every non-system
schema exposed by the catalog, including platform-managed schemas. Application ownership does
not extend to rewriting Supabase internals. Snapshot: 2026-09-05.

## Product and data contract

One meet contains individual performances and team relay performances. A relay is one collective
performance with athlete participation links. Athlete and team reads must preserve those links
without counting four copies of a relay as four team performances. Multi-event totals and
component scores come from the source; never calculate replacement scores. Historical team
affiliations, legitimate rounds, status results, and unattributed history must survive cleanup.
Identity decisions use reviewed source evidence, not names or conflicting source IDs alone.
Live tracking and a new UI remain deferred. The entire database, not 4x100, is the workstream.

## Ordered checkpoints

| ID | Priority | Work / completion criteria | Dependencies | Status |
|---|---|---|---|---|
| TRACK-01 | P0 | Exhaustive object register, ordered queue, explicit evidence and completion gates; automated coverage check | None | Complete: register and coverage tests |
| TRACK-02 | P0 | Add defaults, sequences, effective grants, enums, extensions, publication/event triggers and scheduler-presence evidence to the register | TRACK-01 | Complete: EXTENDED_SCHEMA_COVERAGE_20260905.md; object review still open |
| SAFE-01 | P0 | Recheck backup availability/hashes; identify restore-tested scope and managed-platform limitations; require fresh before-images for each mutation | TRACK-01 | Complete: PRESERVATION_RECHECK_20260905.md |
| MIG-01 | P0 | Reconcile local and live migration versions/statements; classify every unmatched entry; prove a safe deployment path without replaying applied SQL | SAFE-01 | Open |
| MIG-01a | P0 | Align the two recent local filenames after full SQL comparison with recorded live versions; no SQL replay | SAFE-01 | Complete: MIGRATION_ALIGNMENT_20260905.md |
| MIG-01b | P0 | Compare all migration SQL, align 27 verified filenames, and restore the original quarantine-refresh migration history with regression tests | MIG-01a | Complete: MIGRATION_RECONCILIATION_CHECKPOINT_20260905.md |
| MIG-01c | P0 | Respect ledger statement boundaries, restore four rewritten historical migrations and one missing local migration; preserve later fixes | MIG-01b | Complete: MIGRATION_STATEMENT_REVIEW_20260905.md; 13 tests pass |
| MIG-01d | P0 | Preserve 39 non-deployable files outside automatic discovery; enforce reviewed history and report untracked SQL | MIG-01c | Complete: MIGRATION_DEPLOYMENT_BOUNDARY_20260905.md; 18 tests pass |
| MIG-01e | P0 | Prove isolated schema/test baseline and deployment behavior; resolve unreviewed active SQL before any production push | MIG-01d | Open; unrelated untracked LAI file blocks current-worktree push |
| MIG-01e1 | P0 | Capture and strictly restore current application schema; rerun PostgreSQL contracts against it | SAFE-01, MIG-01d | Complete: CURRENT_SCHEMA_TEST_BASELINE_20260905.md; no live changes |
| MIG-01e2 | P0 | Make the PostgreSQL regression fixture reproducible without private backups or production credentials | MIG-01e1 | Complete: REPRODUCIBLE_DATABASE_TESTS_20260905.md; fresh-cluster local run passes |
| MIG-01e3 | P0 | Confirm the configured PostgreSQL job on hosted CI after branch publication | MIG-01e2 | Open; no push or remote workflow dispatch performed |
| ING-01 | P1 | Provider-qualified replay keys; whole-call duplicate/provenance validation; regression tests; measure existing cross-provider key collisions | TRACK-01 | Complete: 233 ingestion / 65 shared tests pass; zero live cross-provider key groups |
| MODEL-01 | P1 | Review each application table/column purpose, actual values, readers/writers and reference relationships; decide preserve, improve or retire | SAFE-01 for read-only review; MIG-01 for deployment | Open |
| ID-01 | P1 | Review canonical identity constraints, reviewed aliases and uncertainty handling; verify prior repairs against alias history | MODEL-01 | Open |
| ING-02 | P1 | Prove replay, concurrency, payload changes, source-link consistency and rollback using isolated PostgreSQL integration tests | MIG-01, ID-01, ING-01 | Open |
| ING-02a | P1 | Reproduce and fix shared promotion race; verify seven synthetic PostgreSQL scenarios without production writes | SAFE-01, ING-01; isolated tests only | Complete: INGESTION_POSTGRES_CONCURRENCY_20260905.md |
| ING-02b | P1 | Reject conflicting normalized restages within a run; preserve exact-retry decisions; prove transaction rollback | ING-02a | Complete: INGESTION_RESTAGE_CONTRACT_20260905.md |
| ING-02c | P1 | Model immutable per-run source payloads and explicit source corrections; measure historical ambiguity without fabricating payload versions | MODEL-01, ING-02b | Open; version preservation implemented, correction workflow/direct-writer review and historical recovery remain |
| ING-02c1 | P1 | Add versioned raw evidence, bind staged observations, reject payload-only restages, hold unknown legacy evidence, verify migration and permissions | ING-02b, MIG-01e1; targeted additive deployment only | Complete: SOURCE_EVIDENCE_VERSIONS_20260905.md; private migration live, no public repairs |
| ING-02d | P1 | Enforce individual/relay-parent source-link target kinds while preserving legacy relay-leg compatibility; test parent replay and rollback | ING-02c1 | Complete: SOURCE_LINK_TARGET_KIND_20260905.md; constraint live, no rows rewritten |
| ING-02c2 | P1 | Hold changed linked-source performances for correction review without overwriting canonical facts; preserve retry reasons | ING-02c1, ING-02d | Complete: SOURCE_CORRECTION_GUARD_20260905.md; shared worker code tested, no live ingestion run |
| ING-02e | P1 | Reproduce and eliminate reversed-batch source-staging deadlocks with whole-call deterministic lock order | ING-02c2 | Complete: SOURCE_STAGING_LOCK_ORDER_20260905.md; code-only, isolated regression verified |
| ING-02f | P1 | Pin promotion isolation required by lock-wait candidate rereads; do not inherit arbitrary session defaults | ING-02e | Complete: PROMOTION_ISOLATION_20260905.md; code-only, alternate-default regression verified |
| ING-02g | P1 | Preserve primary failures, close owned stores after run creation failure, and distinguish successful work from failed status reporting | ING-02f | Complete: RUN_ERROR_REPORTING_20260905.md; orchestrator code only, crash reconciliation remains open |
| DATA-01 | P1 | Apply source-backed repairs with exact before-images, affected-ID assertions and postconditions; ambiguous groups explicitly held | ID-01, ING-02 | Open |
| API-01 | P1 | Verify all views/RPCs and application reads against meet/team/athlete/relay/multi-event contracts; fix measured relationship/count defects | MODEL-01 | Open |
| SEC-01 | P1 | Object-level grants/RLS/policies/functions/triggers review with positive and negative role tests | SAFE-01, MIG-01 | Open |
| SEC-01a | P0 | Restore PR-view caller-policy boundary without altering base permissions or result selection | SAFE-01, MIG-01e1; targeted metadata-only migration | Complete: PR_VIEW_SECURITY_20260905.md; live option/advisor and role tests verified |
| SEC-01b | P1 | Pass manual scheduler inputs as quoted data; validate lookback integers; capture scheduler entry points | TRACK-02 | Complete in branch: REPRODUCIBLE_DATABASE_TESTS_20260905.md; remote deployment not claimed |
| API-01a | P1 | Align points filtering/extraction whitespace handling; preserve supplied scores and invoker security | SEC-01a | Complete: PR_POINTS_WHITESPACE_20260905.md; live view hardened, zero measured current extraction differences |
| API-01b | P1 | Count distinct team athletes across stored seasons, retain every historical affiliation, verify all-team parity | MIG-01e1, MODEL-01 team/affiliation review | Complete: TEAM_SUMMARY_COUNTS_20260905.md; 1,795 team counts corrected, no rows deleted |
| PERF-01 | P2 | Measure query plans and workload before index changes; retain necessary FK and uniqueness support | API-01, ING-02 | Open |
| CLOSE-01 | P2 | Refresh catalog, reconcile every object status, run integration/API/security tests and review unresolved items; no blanket completion with hidden holds | All above | Open |

Priority is dependency-driven. An item may proceed while another is held only when its own
dependencies are satisfied. Existing implementation evidence is reused, not silently relabeled
as current verification. ING-01 was already implemented before this queue was consolidated.

## Per-object tracking

The JSON register contains 2,279 individually addressable entries. The original classes cover 76 tables, seven views,
977 columns, 271 constraints (foreign keys tracked as relationships), 246 indexes, 22 policies,
114 functions and 12 user-defined triggers. Internal FK triggers are represented by their parent
constraints. Each entry has purpose, problems, proposed improvement, priority, dependencies,
ownership, status, evidence, verification, rollback, live-application state and catalog metadata.
The source-evidence migration adds 15 verified entries in `source_evidence_objects_20260905.json`
without rewriting the earlier baseline catalog or marking unrelated entries complete.
`source_link_objects_20260905.json` adds the separately verified target-kind constraint.
The extended catalog adds 27 sequences, 243 defaults/identity definitions, 11 schema grant sets,
110 relation grant sets, 114 function grant sets, 25 default-privilege sets, 12 enums, five extensions,
one publication and six event triggers. An ACL set preserves each grant in its catalog metadata.

An explicit pending purpose is an unanswered review item, not a finding that the object is
unnecessary. Previously completed audit packets must be reconciled into these entries individually.
Archive data and platform functions remain included; neither is automatically marked complete.
Database settings, external schedulers and remaining type/dependency catalog classes still need
coverage under MODEL-01/SEC-01 before CLOSE-01. PostgreSQL cron is absent at this checkpoint; this
does not prove no GitHub, host or provider scheduler exists. Captured objects are not semantic signoff.

## Completion and commit rules

Statuses: captured → reviewed → ready → implemented → verified → complete; held requires an
explicit reason and next evidence/decision. For no-change items: reviewed → verified → complete
with a preservation rationale. Never use a commit alone as proof of deployment.

Before a checkpoint commit: scope its files, run relevant tests, record actual results, assess
historical impact, verify recovery requirements, and update this queue and affected object entries.
Database mutations need targeted before-images, a tested rollback and post-change queries.
Code-only safeguards can explicitly record that no data migration or backup is necessary.
ING-01 is code-only: no public rows or schema changed; no backup/backfill is required for the
measured zero-collision case. Rollback is reverting its isolated code checkpoint. PostgreSQL
transaction/concurrency integration remains a separate ING-02 gate, not certified by mock tests.
Unit tests with mocked connections do not establish PostgreSQL concurrency or API correctness.
Preserve unrelated working-tree changes. Continue to the next ready checkpoint after committing.

## Evidence and maintenance

- Baseline and restore: `BASELINE-20260902.md`, `RESTORE-VERIFICATION-20260902.md`.
- Historical implementation evidence: `WORKSTREAM_STATUS_20260904.md`.
- Catalog: `schema_catalog_20260905.json`, `schema_objects_20260905.json`; scans alongside them.
- Migration evidence: `MIGRATION_HISTORY_RECONCILIATION_20260902.md` (refresh required).
- Run `node --test docs/database-audit/master_checklist.test.js` to verify register coverage.
- `build_master_checklist.js` seeds the register; do not overwrite reviewed entries by rerunning
  it. Refresh by stable ID, retaining review evidence and flagging changed/removed definitions.
