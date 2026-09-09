# ING-02c: canonical direct-writer inventory — 2026-09-08

> Read-only evidence for the [database master checklist](MASTER_CHECKLIST.md). This checkpoint
> maps code paths; it does not approve a historical repair or change the database.

## Result

The current write boundary is partially consolidated:

- `scrapers/shared/canonical_fact_writer.js` is the controlled writer for new `results`,
  `relay_results`, and `relay_athletes` facts.
- The TFRRS weekend, Athletic.net, TrackScoreboard, and timing-adapter paths stage source evidence
  through `ControlledIngestion`. Their normal commit mode reaches the canonical writer; the TFRRS
  and Athletic.net adapters retain an explicitly named `--legacy-direct-write` bridge for approved
  forensic work.
- The roster evidence writer is a separate atomic transaction for `athlete_team_seasons` plus
  private evidence. It does not write result facts.
- Several older importers and one-off repair/identity scripts still write public tables directly.
  They are not part of the controlled evidence/version transaction and remain outside unattended
  production use until migrated or retired.

The reproducible scanner is `direct_writer_inventory.js`. It scans scraper source text only and
prints operation, line, guard, and classification; it never connects to Supabase.

The current scan finds 41 writer files: 1 controlled canonical writer, 2 controlled adapters with
legacy bridges, 1 controlled roster transaction, 10 guarded legacy/repair writers, 26 explicitly
manual repair/identity writers, and 1 dormant shared legacy library with no active production
callers. There are no remaining unguarded executable writer files in the scan.

## Classified paths

| Classification | Paths | Decision |
|---|---|---|
| Controlled canonical writer | `scrapers/shared/canonical_fact_writer.js` | Keep as the only normal fact-promotion writer. It reads exact source versions and holds changed linked facts for correction review. |
| Controlled adapters with a legacy bridge | `scrapers/tfrrs/meet-scraper/sync-weekend-results.js`, `scrapers/athletic-net/import_meet_results.js` | Normal commits require `--control-plane`; direct bridge requires the explicit `--legacy-direct-write` flag. The imported function and CLI now enforce the same guard. |
| Controlled adapter | `scrapers/trackscoreboard/import_meet_results.js`, `scrapers/recovery/import_timing_adapter.js` | Keep on the private control plane; no public-fact direct branch. |
| Controlled roster transaction | `scrapers/shared/collegiate_roster_evidence.js` | Keep separate from result facts; atomic membership/evidence behavior is covered by MODEL-01f. |
| Guarded legacy importer | `scrapers/tfrrs/meet-scraper/import-meet-results.js`, `import-new-athletes.js`, `scrapers/tfrrs/athlete-scraper/import-results-to-db.js`, `import-retry-data.js`, plus reviewed Athletic.net/TrackScoreboard identity tools | These require explicit legacy approval but still bypass immutable source versions. Migrate only after each input contract has a controlled adapter or retire the script. |
| Explicit manual repair/identity writer | Backfills, deduplication, archive/apply tools, and reviewed athlete merge/split/promotion scripts under `scrapers/` | Preserve as owner-approved repair tooling. They are not ingestion and must use their existing before-image/rollback procedures. |
| Previously unguarded legacy relay importer | `scrapers/tfrrs/meet-scraper/import-relay-results.js` | Fixed in this checkpoint: commit now requires `--legacy-direct-write`. No data was run or changed. |
| Dormant legacy helper | `scrapers/shared/athlete_resolver.js` | Retained for compatibility; no non-test production caller was found. Its direct `athletes` flush is not used by the controlled adapters. |

## Important findings

1. A CLI-only guard is insufficient. `sync-weekend-results.js` exports `importResults`; callers could
   have passed `commit=true` without executing `main()`. The function now enforces the guard itself,
   and the CLI passes the explicit legacy flag through.
2. `import-relay-results.js` had no write guard. It now fails closed unless an operator passes the
   explicit forensic flag. Its default dry run remains unchanged.
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

- `node --check` passed for both modified importers.
- `node --check` passed for all five modified legacy/adapter scripts.
- The new write-guard tests and the TFRRS sync tests pass (18 tests total).
- No Supabase connection was opened and no live row changed.

Next under `ING-02c`: define an explicit correction-review/apply contract using the existing
private observations, source versions, source links, and quarantine records; then rehearse it on
isolated PostgreSQL data before any historical recovery. Legacy observations without snapshots and
the 918 observed-meet discrepancies remain held; they must not be reconstructed from mutable latest
payloads.
