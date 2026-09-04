# Database cleanup workstream status — 2026-09-04

This is the branch-level checkpoint for the preservation-first database cleanup. It is a status
map, not a claim that the database is finished. The detailed evidence packets and migration files
remain the source of truth for each item.

## Safety contract

- Preserve before-images and rollback paths before any destructive write.
- Treat source values as authoritative; do not manufacture scores or identities.
- Keep the 4×100 reconciliation workflow paused while the broader schema audit runs.
- Do not add a table, column, index, policy, or migration merely to hold temporary audit state.
- Separate live database changes, committed application code, and read-only evidence in status
  reporting.

## Applied and verified

These workstreams have evidence of a live change or a completed verification gate:

| Workstream | What changed or was verified | Evidence / commit |
| --- | --- | --- |
| Preservation baseline | Full and owner-schema PostgreSQL archives, hashes, restore TOC, schema SQL, and isolated restore verification captured. | `BASELINE-20260902.md`, `RESTORE-VERIFICATION-20260902.md` |
| Private recovery boundary | Historical backup tables moved behind the private `archive` schema; public roles cannot read them; restore access is service-role-only. | `BACKUP_ARCHIVE_SECURITY_EVIDENCE_20260903.md`, commit `548e69c` |
| Affiliation foundation | Additive explicit team-affiliation fields, dual-read rollout, deterministic lookup precedence, and reviewed backfill evidence were applied without overwriting historical relationships. | `AFFILIATION_*` packets, commits `d0eb29d`–`1ac4946` |
| Classification/conference cleanup | Reviewed `Other` classifications and exact conference identity/URL repairs were migrated with rollback files; bulk reinterpretation was intentionally avoided. | `OTHER_DIVISION_RESEARCH_20260904.md`, `TABLE_DISPOSITION_MATRIX_20260903.md`, commits `16085e4`–`bb894bf` |
| Fact lookup indexes | Canonical fact lookup indexes were added after FK review; superseded/unhelpful indexes were removed with rollback SQL. | `FOREIGN_KEY_INDEX_REVIEW_20260904.md`, `UNUSED_INDEX_REVIEW_20260904.md`, commits `e62ad22`, `8122cf3` |
| Canonical fact invariants | Results and relay rows retain complete event-type links; nullable meet/team/athlete links remain measured semantic states, not forced NULL-cleanup targets. | `FACT_SEMANTICS_REVIEW_20260903.md` (2026-09-04 checkpoint) |
| Empty legacy events model | The empty `events` table was retired only after dependency/type/frontend checks and an exact rollback test. | `EVENTS_RETIREMENT_EVIDENCE_20260903.md`, commit `37e17ea` |
| Current catalog baseline | Recounted all non-system schemas after cleanup: 74 tables, 7 views, 27 sequences; nine backup tables are private in `archive`, and the live ledger has 83 records. | `FULL_DATABASE_INVENTORY_20260903.md`, `TABLE_STRUCTURE_REVIEW_20260903.md` |
| PR view source semantics | The derived PR view now uses supplied leading aggregate points and excludes typed multi-event component rows; no canonical rows were changed. | `ATHLETE_PRS_DISPOSITION_EVIDENCE_20260903.md`, migration `20260904195352_fix_v_athlete_prs_points_source.sql`, rollback file |

## Committed application/read fixes (not a live-data change)

These are in the branch source and require the app bundle to reload/rebuild before they appear in
the running app:

| Area | Current behavior | Commit |
| --- | --- | --- |
| Athlete activity | Individual and relay activity is unified by meet; unlinked relay activity remains visible. | `e722e78`, `f1738c7` |
| School activity | Relay-only meets and relay-only athletes are included in school reads; event-aware school performance reads were added. | `fe73725`, `e8ed73e`, `e8cbe5e` |
| Multi-event results | Existing aggregate/component rows are grouped by athlete/event instance; supplied Finals aggregate score is displayed, duplicate supplied Finals scores select the highest source value, and component marks remain expandable. No score calculation or data write occurs. | `7db9626`, `3a6e1c4` |

These UI/read changes do not alter canonical rows, tables, policies, or migrations.

## Evidence captured; migration deliberately held

| Area | Current finding | Status / gate |
| --- | --- | --- |
| Multi-event semantics | Aggregate points and typed component marks share the same `event_type_id`; 70,764 rows carry a typed time/distance under a points event type. | Immediate source-value display fix is committed. A normalized parent/component schema is allowed later, but only after deterministic mapping, provenance, and rollback are proven. See `MULTI_EVENT_SEMANTICS_REVIEW_20260904.md`. |
| `live_results` lifecycle | Exactly 48 stale 2025 rows remain unprocessed, unfinalized, and unlinked. Manual writers/readers remain, and the compatibility view omits newer lifecycle fields. | Deferred because live tracking is not currently in use. Preserve rows/view/permissions unchanged; no replacement table or retirement write now. Reopen when the feature becomes active. See `LIVE_RESULTS_DISPOSITION_EVIDENCE_20260903.md`. |
| Identity collisions | School, athlete, meet, team, and relay collision populations have been measured; names alone are not safe merge keys. | Held for source-backed evidence and per-group reviewed maps. |
| Canonical facts/duplicates | Duplicate and missing-link populations have been quantified, with rollback lessons documented. | Held where survivor identity or source ownership is ambiguous. |
| Seasons/environments/rounds/events | Live vocabulary and NULL/ambiguous populations are inventoried; `results.season_code` is NULL for all 3,419,178 rows, environment has 258,521 NULLs, and round has preserved spelling/heat variants. | Deterministic mappings only; raw values and ambiguous rows remain held. See `season_environment_round_dry_run.sql`. |
| PR/ranking authority | Scraped `athlete_prs` and computed `v_athlete_prs` differ in coverage and provenance. The points-view parsing defect is fixed without rewriting source rows. | Keep the cache; reconciliation and reader migration remain held until full-season parity is demonstrated. |
| Ingest queues and provenance | Meet-level and event-level queues have different contracts; observations, quarantine, source links, runs, and cleanup archives are active evidence surfaces. | Keep separate; do not merge by name. |
| Unmapped event telemetry | All 46 stored raw labels (1,484 sightings) now exact-match the canonical `event_aliases` map; no unresolved labels remain. | Keep the raw review history. The alias join is authoritative; no duplicate link column or deletion is needed now. |
| External identity map | 356 verified source IDs cover 353 athletes; no duplicate `(source, external_key)` groups; nullable school/team/conference fields are unused. | Keep as one shared portability map. Review the three multi-row athlete identities individually; do not bulk-backfill or split the table. |
| Ingest queues | Meet-level (`2,573`) and event-level (`10,608`) queues have different required keys, counts, leases, and outcome contracts; access is private. | Keep separate. Do not merge by table name or add a compatibility layer until lifecycle tests require it. |
| Migration history | Live ledger has 82 records; the repository has 120 tracked SQL files / 103 unique prefixes, with 80 shared names, 26 timestamp-drifted names, 40 local-only names, and two production-only names. | Read-only reconciliation recorded. Do not replay or repair uncertain history; classify local-only files and prove exact equivalence before any metadata change. See `MIGRATION_HISTORY_RECONCILIATION_20260902.md`. |

## What is not finished

The database is not being declared clean. Open work remains in the living tracker, including cross-
meet copies, relay duplicates/unlinked relays, athlete identity conflicts, missing team links,
season/environment/round normalization, unmapped events, legacy live-results retirement, PR parity,
and measured index/workload validation.

The full decision list is in `OPEN_DECISIONS_REGISTER_20260903.md`; issue sizes and historical fixes
are in `docs/DATA_ISSUES_TRACKER.md`.

## Current next gate

The next safe action is to finish the `live_results` lifecycle contract and dependency inventory,
not to delete the 48 stale rows. Any replacement table or migration must wait for that contract,
the whole-schema audit, an exact before-image archive, and a rollback/invariant test.

## Worktree note

The branch contains unrelated scraper edits and generated local artifacts that remain unstaged and
were intentionally preserved. This status record does not include or stage them.
