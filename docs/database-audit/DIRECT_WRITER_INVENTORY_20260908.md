# ING-02c: canonical direct-writer inventory — 2026-09-08

> Read-only evidence for the [database master checklist](MASTER_CHECKLIST.md). This checkpoint
> maps code paths; it does not approve a historical repair or change the database.

## Result

The current write boundary is partially consolidated:

- `scrapers/shared/canonical_fact_writer.js` is the controlled writer for new `results`,
  `relay_results`, and `relay_athletes` facts.
- The TFRRS weekend, Athletic.net, TrackScoreboard, and timing-adapter paths stage source evidence
  through `ControlledIngestion`. The retained TFRRS and Athletic.net adapters no longer expose a
  direct-write CLI bypass; every commit reaches the canonical writer.
- The roster evidence writer is a separate atomic transaction for `athlete_team_seasons` plus
  private evidence. It does not write result facts.
- Explicit one-off repair/identity scripts still write public tables directly. They are not part of
  unattended ingestion and remain operator-only with their existing review/rollback contracts.

The reproducible scanner is `direct_writer_inventory.js`. It scans tracked scraper source text
only and prints operation, line, guard, and classification; it never connects to Supabase. Ignored
local scratch files do not make clean-clone/CI results vary by workstation.

The 2026-09-09 scan finds 35 tracked writer files: 1 controlled canonical writer, 2 controlled
source adapters, 1 controlled roster transaction, 4 guarded repair writers, 26 explicitly manual
repair/identity writers, and 1 dormant shared legacy library with no active production callers.
There are no unguarded tracked writer files.

## Classified paths

| Classification | Paths | Decision |
|---|---|---|
| Controlled canonical writer | `scrapers/shared/canonical_fact_writer.js` | Keep as the only normal fact-promotion writer. It reads exact source versions and holds changed linked facts for correction review. |
| Controlled source adapters | `scrapers/tfrrs/meet-scraper/sync-weekend-results.js`, `scrapers/athletic-net/import_meet_results.js` | Every commit requires `--control-plane`; neither CLI accepts a direct-write bypass. |
| Controlled adapter | `scrapers/trackscoreboard/import_meet_results.js`, `scrapers/recovery/import_timing_adapter.js` | Keep on the private control plane; no public-fact direct branch. |
| Controlled roster transaction | `scrapers/shared/collegiate_roster_evidence.js` | Keep separate from result facts; atomic membership/evidence behavior is covered by MODEL-01f. |
| Guarded repair writer | Narrow relay migration, mapping, PR, and normalization programs | These require explicit legacy approval, remain operator-only, and are not general result-ingestion engines. |
| Explicit manual repair/identity writer | Backfills, deduplication, archive/apply tools, and reviewed athlete merge/split/promotion scripts under `scrapers/` | Preserve as owner-approved repair tooling. They are not ingestion and must use their existing before-image/rollback procedures. |
| Dormant legacy helper | `scrapers/shared/athlete_resolver.js` | Retained for compatibility; no non-test production caller was found. Its direct `athletes` flush is not used by the controlled adapters. |

## Important findings

1. A CLI-only guard is insufficient. Both exported source adapters enforce controlled commits at
   their callable boundary, and their CLIs expose no direct-write bypass.
2. The superseded Athletic.net batch runner, TFRRS file-based meet pipeline, and athlete-result
   importers were retired. Their exact source remains recoverable from Git history.
3. The remaining direct writers are intentionally not bulk-rewritten in this checkpoint. They are
   heterogeneous historical tools (identity repair, deduplication, backfill, and old importers);
   converting them without preserving their exact input and rollback semantics would be riskier
   than holding them.
4. `normalize-events.js`, the old relay migration, the mapping updater, and the PR updater now
   also fail closed unless an operator explicitly supplies `--commit --legacy-direct-write`.
5. Static inventory cannot prove runtime reachability or prevent a privileged SQL client from
   writing. Runtime promotion, database role permissions, and historical facts remain separate
   review items.

## Verification and next step

- Workflow safety proves the one scheduled coordinator, retired paths, controlled retained
  adapters, reproducible tracked-file inventory, and zero unguarded tracked writers.
- Verification passed: 267 ingestion tests, 7 workflow-safety tests, and 8 master-checklist
  coverage tests.
- No Supabase connection was opened and no live row changed.

Next under `ING-02c`: define an explicit correction-review/apply contract using the existing
private observations, source versions, source links, and quarantine records; then rehearse it on
isolated PostgreSQL data before any historical recovery. Legacy observations without snapshots and
the 918 observed-meet discrepancies remain held; they must not be reconstructed from mutable latest
payloads.
