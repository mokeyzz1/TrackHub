# Database engineering master checklist

## Current focus and how to use this checklist

Current focus: **MODEL-01 — review the entire application data model and its connections**.
This remains open; completed sub-checkpoints do not mean the whole database is finished.
Follow the checkpoint IDs below, with the owner's direction controlling progression. Do not
substitute an ad hoc list or start unrelated feature work.

This Markdown file controls work order and checkpoint status. [MASTER_CHECKLIST.json](MASTER_CHECKLIST.json)
is the detailed object register, not a second work queue. Dated audit documents preserve evidence;
their old “next steps” and proposed migration waves do not set current priorities. Update this
checklist when verified work changes status; link supporting evidence here rather than creating
another plan. Documentation organization alone does not advance any engineering checkpoint.

Owner decision (2026-09-05): preserve the current Unattached representation and school/roster
structure. Competition affiliation and roster membership can differ. Do not infer school
representation from roster membership. A nullable-school redesign is not authorized as the next
change; earlier proposals remain deferred. See [owner decisions](../OWNER_DECISIONS.md).

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
| TRACK-03 | P0 | Prove aggregate column profiling handles wide tables and state its measured scope accurately | TRACK-02 | Complete: WIDE_COLUMN_PROFILER_20260905.md; isolated 70-column regression, no claim of new full live profiling |
| TRACK-04 | P0 | Refresh aggregate profiles for every public/ingest ordinary-table column and prove coverage against the object register | TRACK-03 | Complete: COLUMN_PROFILE_RECHECK_20260905.md; 359 columns / 31 tables; semantic decisions and other schemas remain open |
| TRACK-05 | P0 | Expand aggregate profiles to archive/platform and partitioned tables; prove combined register coverage | TRACK-04 | Complete: ALL_TABLE_COLUMN_COVERAGE_20260905.md; all 872 table columns / 76 tables; view columns and semantic signoff remain open |
| TRACK-06 | P0 | Check every declared foreign key for orphan and invalid partial-null references with explicit coverage/error accounting | TRACK-05 | Complete: FOREIGN_KEY_RECHECK_20260905.md; all 75 checked, zero dangling references; identity correctness remains separate |
| TRACK-07 | P0 | Inventory visible database settings and persistent role/database override scopes without exporting secret values | TRACK-06 | Complete: SETTINGS_COVERAGE_20260905.md; 478 settings + nine override scopes captured; effective-role and semantic review remain open |
| SAFE-01 | P0 | Recheck backup availability/hashes; identify restore-tested scope and managed-platform limitations; require fresh before-images for each mutation | TRACK-01 | Complete: PRESERVATION_RECHECK_20260905.md |
| MIG-01 | P0 | Reconcile local and live migration versions/statements; classify every unmatched entry; prove a safe deployment path without replaying applied SQL | SAFE-01 | Complete 2026-09-08: local/live history reconciled, deployment boundary verified, and hosted CI green on PR #2 |
| MIG-01a | P0 | Align the two recent local filenames after full SQL comparison with recorded live versions; no SQL replay | SAFE-01 | Complete: MIGRATION_ALIGNMENT_20260905.md |
| MIG-01b | P0 | Compare all migration SQL, align 27 verified filenames, and restore the original quarantine-refresh migration history with regression tests | MIG-01a | Complete: MIGRATION_RECONCILIATION_CHECKPOINT_20260905.md |
| MIG-01c | P0 | Respect ledger statement boundaries, restore four rewritten historical migrations and one missing local migration; preserve later fixes | MIG-01b | Complete: MIGRATION_STATEMENT_REVIEW_20260905.md; 13 tests pass |
| MIG-01d | P0 | Preserve 39 non-deployable files outside automatic discovery; enforce reviewed history and report untracked SQL | MIG-01c | Complete: MIGRATION_DEPLOYMENT_BOUNDARY_20260905.md; 18 tests pass |
| MIG-01e | P0 | Prove isolated schema/test baseline and deployment behavior; resolve unreviewed active SQL before any production push | MIG-01d | Complete 2026-09-08 for current worktree: 103 active files match 103 live ledger entries, zero errors; direct-applied LAI history reconciled; two timestamp mismatches aligned; rewritten policy history restored with a separate correction migration; 24 history tests and three rollback-only live object checks pass. MIG-01e3 remains the next separate hosted-CI confirmation. |
| MIG-01e1 | P0 | Capture and strictly restore current application schema; rerun PostgreSQL contracts against it | SAFE-01, MIG-01d | Complete: CURRENT_SCHEMA_TEST_BASELINE_20260905.md; no live changes |
| MIG-01e2 | P0 | Make the PostgreSQL regression fixture reproducible without private backups or production credentials | MIG-01e1 | Complete: REPRODUCIBLE_DATABASE_TESTS_20260905.md; fresh-cluster local run passes |
| MIG-01e3 | P0 | Confirm the configured PostgreSQL job on hosted CI after branch publication | MIG-01e2 | Complete 2026-09-08: PR #2 hosted `postgres-contracts` and `validate` jobs passed on run `34292527660` |
| ING-01 | P1 | Provider-qualified replay keys; whole-call duplicate/provenance validation; regression tests; measure existing cross-provider key collisions | TRACK-01 | Complete: 233 ingestion / 65 shared tests pass; zero live cross-provider key groups |
| MODEL-01 | P1 | Review each application table/column purpose, actual values, readers/writers and reference relationships; decide preserve, improve or retire | SAFE-01 for read-only review; MIG-01 for deployment | Complete: MODEL_SEMANTIC_REVIEW_20260905.md; 35 relations, 404 columns, 52 FK edges, 58 view dependencies, value-shape and source-reader/writer evidence |
| ID-01 | P1 | Review canonical identity constraints, reviewed aliases and uncertainty handling; verify prior repairs against alias history | MODEL-01 | Complete 2026-09-08: `ID01_CANONICAL_IDENTITY_AUDIT_20260908.md`; 151,534 athletes, zero duplicate TFRRS IDs, 356 verified external IDs, 1,339 active aliases, zero alias/external orphans or active-key collisions. 209 shared Athletic.net URL groups remain explicitly held (151 same-shape, 58 mixed-shape); no bulk merge or global URL constraint authorized. |
| ID-01c | P1 | Prevent privacy/unknown source labels from becoming canonical public athlete identities | ID-01, SAFE-01 | Complete/applied 2026-09-08: three unreferenced `[Name Withheld]` shells were copied to `archive.athletes_empty_backup` and removed. Shared ingestion rejects placeholder creation, reviewed source-native promotion keeps it quarantined, and validated database constraint `athletes_full_name_not_placeholder` prevents bypasses. Focused, shared-suite, rollback-only live, and post-deployment checks passed; ledger version `20260908202312` recorded once. |
| ID-01a | P1 | Reject explicit TFRRS source/database year conflicts before event scraping; retain same-year/multi-day identity review | MODEL-01 meet-source inspection | Complete in branch: MEET_SOURCE_YEAR_GUARD_20260905.md; 12 repeated source-ID groups remain unmerged |
| ID-01b | P1 | Order event catalog pages, reject conflicting normalized aliases and fail closed on incomplete reloads | MODEL-01 event-catalog inspection | Complete in branch: EVENT_CATALOG_LOAD_20260905.md; catalog semantics and unmapped persistence remain open |
| MODEL-01a | P1 | Enforce supported event measurement kinds without rewriting catalog rows | MODEL-01 event-catalog inspection, SAFE-01 | Complete: EVENT_MEASURE_DOMAIN_20260905.md; validated check and NOT NULL live; broader taxonomy remains open |
| MODEL-01b | P1 | Attribute performance reads to the represented result team rather than current athlete school | MODEL-01, API-01 | Complete: RESULT_AFFILIATION_READS_20260905.md; both live performance functions corrected and rollback-tested |
| MODEL-01c | P1 | Normalize collegiate governing organizations, organization-scoped divisions/sectors, and time-aware school memberships without rewriting facts or removing legacy compatibility fields | MODEL-01, SAFE-01, MIG-01e1 | Complete/applied 2026-09-07: 12 organizations, 6 organization-scoped levels, and 1,844 current primary school memberships; every classified collegiate school is covered. Two rollback rehearsals passed; post-deployment checks found zero level/organization mismatches and zero invalid null organizations. Three public tables have RLS/read policies, the invoker-security profile view is live, legacy fields remain, and fact tables were not written. University of The Bahamas corrected from NAIA to source-verified Independent. Migration ledger version `20260907195650` recorded once. |
| MODEL-01d | P1 | Separate dated athlete career-stage/professional evidence from per-performance representation; do not infer eligibility or post-collegiate status from Unattached | MODEL-01c, ID-01 | Evidence audit complete: `ATHLETE_CLASSIFICATION_EVIDENCE_20260908.md` and reproducible SQL. Live data supports 106,724 collegiate-history classifications, including 1,931 currently routed to Unattached, but does not support current/post-collegiate/professional classification. Implementation remains open: add dated evidence model, dual-write ingestion, compatible API, deterministic backfill, RLS and rollback tests. |
| MODEL-01e | P1 | Add the dated athlete-status evidence/resolution foundation without reclassifying athletes or mixing status with result representation | MODEL-01d, SAFE-01 | Complete/applied 2026-09-08: private `athlete_status_evidence`, confirmed-only public `athlete_status_periods`, private provenance bridge, and invoker-security `v_athlete_current_status`. Confirmed same-axis periods cannot overlap; career and professional axes remain independent. Two rollback rehearsals and a live negative-policy test passed. Live tables verified empty, view parity is 151,537/151,537 athletes, three tables have RLS, and ledger version `20260908045520` exists once. The deployment-runner fixture leak was caught immediately: exactly four tagged synthetic rows for athlete 89 were removed and zero remain; runner now commits schema only. Ingestion dual-write, deterministic backfill, and API adoption remain open under MODEL-01d/API-01. |
| MODEL-01f | P1 | Record source-observed collegiate roster evidence atomically with season membership; hold identity and classification ambiguity | MODEL-01e, ID-01 | Complete in branch 2026-09-08: the TFRRS roster scraper now retains the team URL and the dry-run-first importer requires one exact provider-qualified identity (honoring reviewed aliases/external IDs), canonical team, and season-covering collegiate membership. Eligible rows write `athlete_team_seasons` and private evidence in one transaction; clubs, missing/duplicate athletes or teams, unresolved memberships, conflicting input, and changed payloads are held. Exact replay is a no-op; no athlete/current-school/status-period inference occurs. Eight focused tests and the 92-test shared suite pass. A live rollback-only success/failure test confirmed atomicity and zero retained test rows. No roster data was imported. Deterministic historical backfill and API adoption remain open under MODEL-01d/API-01. |
| MODEL-01g | P1 | Preserve legacy collegiate team-season history as private evidence without fabricating source verification or current status | MODEL-01f, SAFE-01 | Complete/applied 2026-09-08: 127,334 structurally consistent legacy relationships map to 126,925 athlete-season periods and 127,334 provenance links. They remain private `unresolved` evidence and `provisional` periods because the original roster snapshots were not retained. Twenty-one Cheyney rows without normalized governing membership and two gender-conflicted rows are held. Full live-schema forward and recovery rollback rehearsals passed with exact restoration; deployment preserved zero public current-status rows and ledger version `20260908173000` exists once. No original athlete/team/result/relay/team-season row changed. |
| API-01c | P1 | Publish one athlete-status API contract that separates collegiate history from confirmed current career/pro status | MODEL-01g, API-01 | Complete/applied 2026-09-08: additive invoker-security `v_athlete_status_summary` exposes one row per athlete with collegiate-history signals and confirmed-only current career/pro status. Provisional periods, private evidence, resolution internals, and source payloads are excluded. Anonymous/authenticated reads, row parity, unique athlete IDs, private-table denial, rollback, and ledger version `20260908190000` were verified. Existing endpoints remain compatible; UI adoption stays deferred. |
| ING-02i | P1 | Preserve unmapped-event review counts after explicit lookup/write failures and partial flushes | ID-01b | Complete in branch: UNMAPPED_EVENT_ERRORS_20260905.md; atomic cross-worker counters remain open |
| ING-02 | P1 | Prove replay, concurrency, payload changes, source-link consistency and rollback using isolated PostgreSQL integration tests | MIG-01, ID-01, ING-01 | Complete 2026-09-08: hosted PostgreSQL 17 job passed 25 ingestion, 5 affiliation, 4 collegiate-history, and 1 roster-evidence tests on run `34292527660`; local PostgreSQL 17 fixture prerequisites and CI dependency isolation are committed. |
| ING-02a | P1 | Reproduce and fix shared promotion race; verify seven synthetic PostgreSQL scenarios without production writes | SAFE-01, ING-01; isolated tests only | Complete: INGESTION_POSTGRES_CONCURRENCY_20260905.md |
| ING-02b | P1 | Reject conflicting normalized restages within a run; preserve exact-retry decisions; prove transaction rollback | ING-02a | Complete: INGESTION_RESTAGE_CONTRACT_20260905.md |
| ING-02c | P1 | Model immutable per-run source payloads and explicit source corrections; measure historical ambiguity without fabricating payload versions | MODEL-01, ING-02b | Complete 2026-09-08: immutable versions, direct-writer inventory/guards, snapshot-backed correction apply workflow, and live eligibility audit complete; no eligible live correction existed; legacy no-snapshot evidence and 918 historical observation/meet discrepancies are explicitly held and handed to ING-02h (no fabricated versions) |
| ING-02c1 | P1 | Add versioned raw evidence, bind staged observations, reject payload-only restages, hold unknown legacy evidence, verify migration and permissions | ING-02b, MIG-01e1; targeted additive deployment only | Complete: SOURCE_EVIDENCE_VERSIONS_20260905.md; private migration live, no public repairs |
| ING-02d | P1 | Enforce individual/relay-parent source-link target kinds while preserving legacy relay-leg compatibility; test parent replay and rollback | ING-02c1 | Complete: SOURCE_LINK_TARGET_KIND_20260905.md; constraint live, no rows rewritten |
| ING-02c2 | P1 | Hold changed linked-source performances for correction review without overwriting canonical facts; preserve retry reasons | ING-02c1, ING-02d | Complete: SOURCE_CORRECTION_GUARD_20260905.md; shared worker code tested, no live ingestion run |
| ING-02e | P1 | Reproduce and eliminate reversed-batch source-staging deadlocks with whole-call deterministic lock order | ING-02c2 | Complete: SOURCE_STAGING_LOCK_ORDER_20260905.md; code-only, isolated regression verified |
| ING-02f | P1 | Pin promotion isolation required by lock-wait candidate rereads; do not inherit arbitrary session defaults | ING-02e | Complete: PROMOTION_ISOLATION_20260905.md; code-only, alternate-default regression verified |
| ING-02g | P1 | Preserve primary failures, close owned stores after run creation failure, and distinguish successful work from failed status reporting | ING-02f | Complete: RUN_ERROR_REPORTING_20260905.md; orchestrator code only, crash reconciliation remains open |
| ING-02h | P1 | Reconcile interrupted-run semantics and historical observed-meet/canonical-meet discrepancies without rewriting evidence | MODEL-01, ING-02g | Complete 2026-09-09: the two explicitly reviewed zero-observation PT Timing dry runs were marked `aborted` with finish times and reconciliation metadata through the existing `ingest.runs` table; all-or-none guards, before-image, rollback path and postconditions passed. The 918 historical discrepancies remain explicitly held because legacy observations lack immutable source versions. Evidence: INTERRUPTED_RUN_RECONCILIATION_20260908.md and RUN_RELATIONSHIPS_20260905.md |
| DATA-01 | P1 | Apply source-backed repairs with exact before-images, affected-ID assertions and postconditions; ambiguous groups explicitly held | ID-01, ING-02 | Open |
| DATA-01-USSU | P1 | Restore verified USSU school and competition affiliations | DATA-01 | Applied 2026-09-06: 16 athletes, 174 results, 4 relay parents; one exact duplicate relay archived with its 4 legs; 199 before-images retained. Rollback rehearsal and live checks passed. Source-key alias verified through shared resolver. Evidence: ussu_verified_results_20260906.json. Wider missing-school search remains open. |
| DATA-01-USSU-W | P1 | Restore verified USSU women's affiliations | DATA-01-USSU | Applied 2026-09-06: women's team and reviewed source alias created; 4 athletes and 27 exact-source-verified results linked; 31 before-images retained. Rollback rehearsal and live checks passed. Evidence: ussu_women_verified_results_20260906.json. |
| DATA-01-SCHOOL-DISCOVERY | P1 | Find other Unattached records whose source school/team is missing or unmapped | DATA-01-USSU | Discovery complete for all 3,403 Unattached records with TFRRS IDs: zero fetch errors. 1,426 athletes link to 112 unresolved college/junior-college-namespace team URLs and hold 9,413 results, 9,361 teamless. Another 813 athletes link to 241 scholastic/other URLs. These are review candidates; profile association alone does not prove per-result affiliation, and clubs can use TFRRS's college namespace. Evidence: missing_school_profile_audit_20260906.json. |
| DATA-01-COLLEGIATE-CATALOG | P1 | Onboard association-confirmed collegiate schools/teams without folding similarly named institutions together | DATA-01-SCHOOL-DISCOVERY | Applied 2026-09-06: all 50 confirmed schools and 88 gender-specific TFRRS teams now resolve; 49 schools and 87 teams added, USSU reused, NWAC added as an association. Four bad Clark/Lane aliases corrected after exact old-target assertions. Rollback rehearsal and idempotent live replay passed. No athlete/result/relay/meet fact changed. Evidence: collegiate_source_team_review_20260906.json and collegiate_school_onboarding_20260906.json. |
| DATA-01-COLLEGIATE-PROFILES | P1 | Move the 1,184 still-Unattached confirmed collegiate athlete profiles to their reviewed schools, retaining Unattached per-result affiliations | DATA-01-COLLEGIATE-CATALOG | Complete/applied 2026-09-06: all 1,188 source-confirmed collegiate profiles now resolve to their reviewed schools (4 were already repaired; 1,184 changed). Exactly 1,184 before-images retained. Rollback rehearsal passed. Result coverage stayed 8,566 total/8,487 teamless; no result or club row changed. |
| DATA-01-COLLEGIATE-REMAINDER | P1 | Resolve the 192 association-unclassified TFRRS college-namespace athletes without including clubs or prep schools | DATA-01-COLLEGIATE-PROFILES | Complete/applied 2026-09-07: 178 athletes across 14 verified collegiate institutions repaired; 11 schools added and UQAM, Community Christian, and Penn State reused; 20 source aliases resolve. UQAM corrected from NJCAA to U SPORTS. Four honest classification rows added (Independent, NSAC, CONADEIP, RSEQ Collegiate). Exactly 178 before-images retained and rollback rehearsed. All 14 USMAPS prep athletes remain Unattached. Of 626 cohort results, 620 lack exact stored result provenance and remain held; the six linked rows are relay legs and were not pursued because relays are paused. No result or club row changed. |
| DATA-01-COLLEGIATE-RESULTS | P1 | Repair source-proven competition affiliations for the confirmed collegiate cohort, including 52 Clark/Lane rows already routed to the wrong schools | DATA-01-COLLEGIATE-CATALOG | Partial/applied: 52 TFRRS-linked Clark/Lane 4x100 result legs and 13 relay parents corrected (65 before-images), plus 18 exact Sacramento City College individual results corrected from teamless to team `4066` (18 before-images). Rollback rehearsals and live postconditions passed; no relay/athlete/observation rows changed in the Sacramento repair. Remaining teamless results stay held without exact source-team evidence. Evidence: clark_lane_collegiate_result_repair_20260906.json, SACRAMENTO_CITY_COLLEGE_RESULT_REPAIR_20260909.md |
| API-01 | P1 | Verify all views/RPCs and application reads against meet/team/athlete/relay/multi-event contracts; fix measured relationship/count defects | MODEL-01 | Complete 2026-09-09: all eight public views, five public RPCs and frontend consumers audited; public/private role boundaries, athlete/view parity, represented-team reads, supplied multi-event points and distinct team counts verified. No new API table/RPC or data rewrite was needed. Evidence: API_CONTRACT_AUDIT_20260909.md |
| SEC-01 | P1 | Object-level grants/RLS/policies/functions/triggers review with positive and negative role tests | SAFE-01, MIG-01 | Open |
| SEC-01a | P0 | Restore PR-view caller-policy boundary without altering base permissions or result selection | SAFE-01, MIG-01e1; targeted metadata-only migration | Complete: PR_VIEW_SECURITY_20260905.md; live option/advisor and role tests verified |
| SEC-01b | P1 | Pass manual scheduler inputs as quoted data; validate lookback integers; capture scheduler entry points | TRACK-02 | Complete in branch: REPRODUCIBLE_DATABASE_TESTS_20260905.md; remote deployment not claimed |
| SEC-01c | P0 | Verify both public roles across application tables and restore the existing waitlist's missing sequence dependency | SAFE-01, MIG-01e1 | Complete: WAITLIST_SEQUENCE_ACCESS_20260905.md; narrow grant live, positive/negative/rollback tests verified |
| API-01a | P1 | Align points filtering/extraction whitespace handling; preserve supplied scores and invoker security | SEC-01a | Complete: PR_POINTS_WHITESPACE_20260905.md; live view hardened, zero measured current extraction differences |
| API-01b | P1 | Count distinct team athletes across stored seasons, retain every historical affiliation, verify all-team parity | MIG-01e1, MODEL-01 team/affiliation review | Complete: TEAM_SUMMARY_COUNTS_20260905.md; 1,795 team counts corrected, no rows deleted |
| PERF-01 | P2 | Measure query plans and workload before index changes; retain necessary FK and uniqueness support | API-01, ING-02 | Open |
| CLOSE-01 | P2 | Refresh catalog, reconcile every object status, run integration/API/security tests and review unresolved items; no blanket completion with hidden holds | All above | Open |

Priority is dependency-driven. An item may proceed while another is held only when its own
dependencies are satisfied. Existing implementation evidence is reused, not silently relabeled
as current verification. ING-01 was already implemented before this queue was consolidated.

## Per-object tracking

MODEL-01 semantic review: [MODEL_SEMANTIC_REVIEW_20260905.md](MODEL_SEMANTIC_REVIEW_20260905.md)
closes the decision record for all 31 application tables, four views, 404 columns, 52 touching
foreign keys and 58 view dependencies. [model_review_20260905.json](model_review_20260905.json)
retains the structural register and now points to the semantic-review closure. The review records
observed value shapes and repository readers/writers without claiming that dependent identity,
ingestion, API, security or performance changes are complete. No unrelated product fixes are
authorized by this review.

The JSON register contains 2,767 individually addressable entries. The original classes cover 76 tables, seven views,
977 columns, 271 constraints (foreign keys tracked as relationships), 246 indexes, 22 policies,
114 functions and 12 user-defined triggers. Internal FK triggers are represented by their parent
constraints. Each entry has purpose, problems, proposed improvement, priority, dependencies,
ownership, status, evidence, verification, rollback, live-application state and catalog metadata.
The source-evidence migration adds 15 verified entries in `source_evidence_objects_20260905.json`
without rewriting the earlier baseline catalog or marking unrelated entries complete.
`source_link_objects_20260905.json` adds the separately verified target-kind constraint.
`event_measure_objects_20260905.json` adds the validated measurement-domain constraint.
The extended catalog adds 27 sequences, 243 defaults/identity definitions, 11 schema grant sets,
110 relation grant sets, 114 function grant sets, 25 default-privilege sets, 12 enums, five extensions,
one publication and six event triggers. An ACL set preserves each grant in its catalog metadata.

An explicit pending purpose is an unanswered review item, not a finding that the object is
unnecessary. Previously completed audit packets must be reconciled into these entries individually.
Every one of the 872 table-column entries and 75 foreign-key entries now links to its measured
aggregate profile. These 947 evidence links do not advance semantic review statuses; coverage tests
verify both the profile membership and the individual register links.
Archive data and platform functions remain included; neither is automatically marked complete.
The settings catalog adds 478 settings and nine override scopes with secret values redacted.
External scheduler state and remaining type/dependency catalog classes still need coverage;
effective settings and semantic review remain under MODEL-01/SEC-01 before CLOSE-01. PostgreSQL cron is absent at this checkpoint; this
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
