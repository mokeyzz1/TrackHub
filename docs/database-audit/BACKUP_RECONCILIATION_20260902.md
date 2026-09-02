# Backup/archive reconciliation — 2026-09-02

## Outcome

The nine live rollback tables are internally consistent and preserve 532,251 archived parent/fact
rows plus 89,085 archived relay legs (621,336 total rows). No archived primary-key value is duplicated inside its
archive, and no archived key currently overlaps its canonical table.

| Archive | Rows | Distinct archived IDs | Canonical overlap |
|---|---:|---:|---:|
| `athletes_empty_backup` | 12,518 | 12,518 | 0 |
| `relay_athletes_d3_backup` | 89,085 | 89,085 | 0 |
| `relay_results_20260819_backup` | 1 | 1 | 0 |
| `relay_results_d3_backup` | 40,935 | 40,935 | 0 |
| `results_accidental_import_20260819_backup` | 31 | 31 | 0 |
| `results_athlete_merge_backup` | 11 | 11 | 0 |
| `results_d1_backup` | 23,766 | 23,766 | 0 |
| `results_d2_backup` | 453,737 | 453,737 | 0 |
| `results_xsource_20260819_backup` | 1,252 | 1,252 | 0 |

All 89,085 archived relay legs have an archived parent.

## Reconciled differences

- `results_d2_backup` increased from the old documented 453,728 to 453,737 because nine M8
  doubled-code rows would have collided with existing canonical rows when normalized; they were
  archived and removed instead of updated.
- The relay archive documentation described only the initial 674-parent/2,387-leg pass. Live data
  also contains the 13,716-parent normalized-lineup pass, the 26,494-parent real-mark pass, the
  44-parent NCAA DII Athletic.net rollback, and seven later status-duplicate parents.
- The three committed DUP-3 audit JSONs account for 40,884 parent IDs. All 40,884 are present.
- The remaining 51 parents are exactly the 44-row NCAA DII rollback plus seven later duplicate
  rows at the UW-La Crosse Phil Esten Challenge and Masked Rider Open. Those 51 preserve 199 legs.
- The seven later rows lack a standalone audit JSON, but each has a same-meet/team/event/status
  canonical survivor and complete archived row/leg data. This is a documentation gap, not data loss.

## Risk assessment

- Archive integrity: **pass, high confidence**.
- Bit-for-bit rollback coverage for archived rows: **pass, high confidence**.
- Operation-level provenance for the final seven relay rows: **medium-quality evidence** because
  there is no standalone audit JSON; the live archive and canonical survivor evidence are complete.
- Safe to delete archives: **no**. They remain the rollback source for historical destructive work.

The evidence query is reproducible with `docs/database-audit/reconcile_backup_archives.js`.
