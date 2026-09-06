# Recovery — every destructive change, and how to undo it

**Why this file exists.** On 2026-08-10 the owner said plainly: *"I'm not checking. I'm letting
you just cook."* That is a reasonable way to work **only if every change is reversible and the
reversal is written down somewhere other than a chat log.** This is that place.

Nothing here is theoretical. Several of these operations were wrong on the first attempt and were
corrected before running — but the assumption behind this file is that one of them is still wrong
and nobody has noticed yet.

---

## Backups currently in the database (verified 2026-09-04)

### USSU affiliation repair — 2026-09-06

Operation `20260906_ussu_affiliation_repair` uses the existing private
`ingest.fact_cleanup_archive`: 16 athlete before-images, 174 result before-images,
5 relay before-images, and 4 legs of duplicate relay 240861 (199 rows).
Exact source verification is in `database-audit/ussu_verified_results_20260906.json`.
The runner defaults to a rollback rehearsal; `--commit` applies the checked set.
It creates USSU's school and men's team plus its reviewed TFRRS alias. The current
school classification is NAIA (effective July 2026); 2025–26 source competition
history remains USCAA. No performance marks or dates change.

To undo the affiliation changes, restore only `athletes.school_id`,
`results.team_id`, and `relay_results.team_id` from this operation's archived
JSON, joined by primary key. Restore relay 240861 using
`jsonb_populate_record(NULL::public.relay_results,row_data)` and then its four
archived `relay_athletes` rows. Restore the survivor's original NULL team first
to avoid a duplicate-key collision. Perform restoration in one transaction and
verify the archived counts and all post-repair values before updating.
Keep the new school/team entities if subsequent ingestion has referenced them.
No other archive operation should be replayed for this repair.

The companion operation `20260906_ussu_women_affiliation_repair` added the
women's team and its reviewed TFRRS alias, linked four verified athletes and 27
verified results, and retained 31 before-images in the same private archive.
Undo by restoring the four `athletes.school_id` and 27 `results.team_id` values
from that operation's JSON before-images in one transaction. Keep the USSU
school; remove the women's team/alias only when no later rows reference them.

All rollback tables are preserved in the private `archive` schema. They are no longer part of the
public API surface; `service_role` has read-only access and database-owner access is required to
append or restore rows.

| backup table | rows | holds |
|---|---|---|
| `archive.results_d2_backup` | **453,737** | DUP-2 round duplicates + DUP-5 athlete-history duplicates + 1 event-type collision + 9 M8 doubled-code collisions |
| `archive.results_d1_backup` | **23,766** | DUP-1 results deleted from meets that were copies of other meets |
| `archive.relay_results_d3_backup` | **40,935** | all DUP-3 passes + NCAA DII 4x100 rollback + 7 later duplicate relays; breakdown below |
| `archive.relay_athletes_d3_backup` | **89,085** | the legs of those relays (saved BEFORE the parent, because of the cascade) |
| `archive.athletes_empty_backup` | **12,518** | DUP-4 empty duplicate athlete records |
| `archive.results_accidental_import_20260819_backup` | **31** | rows the legacy `scrape-and-import.js` wrote into MAAC Indoor Championships by accident — see below |
| `archive.results_xsource_20260819_backup` | **1,252** | cross-source individual-result copies removed after field merge |
| `archive.relay_results_20260819_backup` | **1** | cross-source relay copy removed after event resolution |
| `archive.results_athlete_merge_backup` | **11** | duplicate result rows removed by reviewed athlete merges; merge-specific reversal evidence lives with each review plan |

Per-run audit JSONs of the exact ids live in `scrapers/*.json` (16 files as of 2026-08-10), plus
`scrapers/backfill-mark-seconds-2026-08-19T04-16-01-505Z.jsonl.gz` for M9 (below).

### 2026-09-02 archive reconciliation

Every backup table above was counted exactly. Each table has one unique archived primary-key value
per row, and **zero archived IDs overlap the current canonical table**. All 89,085 archived relay
legs resolve to one of the 40,935 archived relay parents.

The relay archive is the sum of five reviewed operations, not the 674-row first pass alone:

| operation | relay parents | relay legs | evidence |
|---|---:|---:|---|
| 2026-08-12 first lineup-keyed DUP-3 pass | 674 | 2,387 | `dedup-relay-results-2026-08-12T15-28-35-677Z.json` |
| 2026-08-18 normalized-lineup pass | 13,716 | part of 86,499 | `dedup-relay-results-2026-08-18T04-41-50-697Z.json` |
| 2026-08-18 real-mark pass | 26,494 | part of 86,499 | `dedup-relay-realmarks-2026-08-18T04-48-32-678Z.json` |
| NCAA DII meet 13142 Athletic.net rollback | 44 | 172 | documented under M1 in `DATA_ISSUES_TRACKER.md`; TFRRS replacements retained |
| later duplicate cleanup at meets 12756 and 12291 | 7 | 27 | all seven have a canonical same-meet/team/event/status survivor; no standalone audit JSON was retained |
| **total** | **40,935** | **89,085** | live exact counts |

The final seven rows are a documentation/audit-file gap, not missing recovery data: their complete
parents and legs are present in the backup tables and their canonical survivors remain live. The
read-only reconciliation is reproducible with `docs/database-audit/reconcile_backup_archives.js`.

## Rollback commands

```sql
-- DUP-2 + DUP-5: within-meet round duplicates and athlete-history duplicates
INSERT INTO results SELECT * FROM archive.results_d2_backup;

-- DUP-1: results deleted from copied meets
INSERT INTO results SELECT * FROM archive.results_d1_backup;

-- DUP-3: duplicate relays — PARENTS FIRST, then legs (FK order matters)
INSERT INTO relay_results  SELECT * FROM archive.relay_results_d3_backup;
INSERT INTO relay_athletes SELECT * FROM archive.relay_athletes_d3_backup;

-- DUP-4: empty duplicate athlete records
INSERT INTO athletes SELECT * FROM archive.athletes_empty_backup;

-- Accidental legacy import, 2026-08-19 (only if you want the bad rows BACK, which you don't —
-- they carry NULL event_type_id and Preliminaries+"Heat N" duplicates)
INSERT INTO results SELECT * FROM archive.results_accidental_import_20260819_backup;
```

## 14 meets IMPORTED (2026-08-19) — 11,651 results, 827 new athletes

Additive, not destructive, but recorded because it is the largest write of the day and because
an import is only "safe" while it can be undone. Meet ids:

`13053, 11825, 11837, 11778, 11794, 12079, 12300, 12731, 12705, 12670, 12789, 12857, 12894, 13048`

```sql
-- undo the import (results only; relay_athletes cascades from relay_results)
DELETE FROM relay_results WHERE meet_id IN (13053,11825,11837,11778,11794,12079,12300,12731,
                                            12705,12670,12789,12857,12894,13048);
DELETE FROM results       WHERE meet_id IN (13053,11825,11837,11778,11794,12079,12300,12731,
                                            12705,12670,12789,12857,12894,13048);
UPDATE meets SET results_status = 'pending'
 WHERE meet_id IN (13053,11825,11837,11778,11794,12079,12300,12731,12705,12670,12789,12857,12894,13048);
```

⚠️ **The 827 athletes created by this run are NOT removed by the above**, and should not be —
they may since have picked up results at other meets. `athlete_team_seasons` and `athlete_prs`
cascade from `athletes`, so never bulk-delete them to "finish" a rollback (DEDUP_METHOD §2).

Verified after writing: 0 NULL `event_type_id`, and 0 duplicate groups with identical round AND
place across all 14 meets.

## Cross-source duplicates (2026-08-19) — 1,252 rows DELETED, found by the owner in the app

The NCAA DII Outdoor 4x100 showed FOUR times on an athlete profile: `45.15a`/`45.34a`
(athletic.net) beside `45.15 F`/`45.34 P` (TFRRS). Same two races, two sources — the trailing `a`
is all-weather-track notation, not part of the time. 1,252 such rows across 243 meets.

The athletic.net copies were the ones removed, because TFRRS carries the round label. **Their
extra fields were merged onto the surviving row first** — wind (345 rows) and `team_id` — so
athletic.net's richer data was not lost.

```sql
-- restore the deleted athletic.net copies (they will reappear as duplicates)
INSERT INTO results SELECT * FROM archive.results_xsource_20260819_backup;
```

⚠️ The merge is **not** reversed by that statement: wind/team_id copied onto surviving TFRRS rows
stay. That is deliberate — the values are correct regardless of which row holds them — but it
means the restore is not a bit-exact rollback.

Prevention: `scrapers/shared/result_fingerprint.js`, now used by both importers. Detection: two
new checks in `verify-data-invariants.js`.

## Sibling-table gaps (2026-08-19) — found by asking whether verification covered the whole DB

The owner asked whether the checks really covered the entire database. They did not. Three fixes:

| what | rows | reversal |
|---|---|---|
| `relay_results.mark_seconds` backfill | **119,148** | ids in `scrapers/backfill-mark-seconds-relay_results-*.jsonl.gz` (verified 119,148 unique) → `UPDATE relay_results SET mark_seconds = NULL WHERE relay_result_id = ANY(...)` |
| `athlete_prs.mark_seconds` backfill | **260,360** | ids in `scrapers/backfill-mark-seconds-athlete_prs-*.jsonl.gz` (verified 260,360 unique) → same pattern on `id` |
| `athlete_prs` doubled mark codes + 48 relay event types | 41 + 48 | `migrations/20260819_sibling_table_gaps.sql` — a repair, not a deletion; re-derivable from `mark_raw`/`event_name` |
| 1 cross-source duplicate relay deleted | **1** | `INSERT INTO relay_results SELECT * FROM archive.relay_results_20260819_backup;` |

The deleted relay (234919, `1:02.87a` from athletic.net) duplicated 215793 (`1:02.87` from TFRRS) —
same meet, team, place and round. It was invisible until its NULL `event_type_id` was resolved,
because the unique index keys on `event_type_id`. Both rows had 0 legs, so nothing cascaded.

## M9 — mark_seconds backfill (2026-08-19), 1,301,371 rows UPDATED

Not a deletion: it filled `mark_seconds` on rows that held a time only as text. Reversal is per-id,
and the ids are on disk — `scrapers/backfill-mark-seconds-2026-08-19T04-16-01-505Z.jsonl.gz`, one JSON
array of `result_id`s per line, written **before** each batch was applied. Verified complete:
1,301,371 unique ids across 30 batch lines, exactly matching the number of rows the run reported.
Read it with `gzcat`.

```sql
-- revert one batch (repeat per line of the audit file)
UPDATE results SET mark_seconds = NULL WHERE result_id = ANY('{...}'::bigint[]);
```

**Two exceptions where NULL is the wrong restore value:**

- Line 1 of the audit file is `{"prior_values":[...]}` — the 6 rows that already had a
  *wrong* `mark_seconds` (a 1:05:37 run stored as 65 seconds, from athletic.net's
  `split(':')` bug). Restore those to their listed old numbers, not to NULL.
- `result_id` 3847312 and 7716203 (`"0:00.0"` and `"0.00"`) were set to NULL by hand afterwards,
  because a zero time parses to a value faster than any world record. They should stay NULL.

Guarded going forward by two new checks in `scrapers/verify-data-invariants.js`.

**Restoring DUP-2 will now fail** on `results_no_exact_duplicate` for any row whose twin still
exists — that is the guard doing its job. To restore anyway, drop the index, insert, re-create it:
`migrations/20260810_results_dedup_guard.sql`.

## What is NOT reversible

- **The scraper fixes** (U8 round collapse, round-label-from-mark-cell). These change future
  ingestion, not stored data. Revert via git.
- **The unique index** `results_no_exact_duplicate`. Drop it if it blocks a legitimate import,
  but read the migration first — `round` is in the key for a reason.
- **`event_aliases` additions** (19 rows) and the `event_type_id` backfill on 462 results. Low
  risk, but not separately backed up.

---

## Where a mistake would hide

Ranked by how long it would go unnoticed:

1. ~~**A wrongly-deleted copied meet (DUP-1).**~~ **AUDITED 2026-08-12 — 33/33 correct.** Every
   cleared meet was re-tested from `archive.results_d1_backup` (schools vs host state). 31 clean; the 2
   flags were false positives caused by the post-expansion Big Ten spanning CA/OR/WA. Tool:
   `scrapers/verify-dup1-deletions.js`. This was the session's highest-risk change and it is now
   verified rather than assumed.
2. **A wrongly-merged/deleted athlete (DUP-4).** 12,518 records went. The test was strict (nothing
   in any of five tables) so the blast radius is small, but a legitimate empty roster entry that
   happened to share a name with a real athlete is gone.
3. **DUP-2 / DUP-3 / DUP-5.** Lowest risk — each required an exact match on a performance
   fingerprint, and the survivors were verified by row counts and spot checks.

## The cheapest way to catch a mistake

Not a full audit — just these, in about five minutes in the app:

- Open **3–4 athletes you know well** and check their meet count looks right for the season.
- Open a **meet you attended or remember** and see the field is complete, not half-missing.
- Search a **common name** and confirm you don't see obvious duplicate people.

That is a better detector than anything I can run, because you know what the answer should be and
the database does not.
