# Recovery — every destructive change, and how to undo it

**Why this file exists.** On 2026-08-10 the owner said plainly: *"I'm not checking. I'm letting
you just cook."* That is a reasonable way to work **only if every change is reversible and the
reversal is written down somewhere other than a chat log.** This is that place.

Nothing here is theoretical. Several of these operations were wrong on the first attempt and were
corrected before running — but the assumption behind this file is that one of them is still wrong
and nobody has noticed yet.

---

## Backups currently in the database (verified 2026-08-10)

| backup table | rows | holds |
|---|---|---|
| `results_d2_backup` | **453,728** | DUP-2 round duplicates + DUP-5 athlete-history duplicates + 1 event-type collision |
| `results_d1_backup` | **23,766** | DUP-1 results deleted from meets that were copies of other meets |
| `relay_results_d3_backup` | **674** | DUP-3 duplicate relay rows |
| `relay_athletes_d3_backup` | **2,387** | the legs of those relays (saved BEFORE the parent, because of the cascade) |
| `athletes_empty_backup` | **12,518** | DUP-4 empty duplicate athlete records |
| `results_accidental_import_20260819_backup` | **31** | rows the legacy `scrape-and-import.js` wrote into MAAC Indoor Championships by accident — see below |

Per-run audit JSONs of the exact ids live in `scrapers/*.json` (16 files as of 2026-08-10), plus
`scrapers/backfill-mark-seconds-2026-08-19T04-16-01-505Z.jsonl.gz` for M9 (below).

## Rollback commands

```sql
-- DUP-2 + DUP-5: within-meet round duplicates and athlete-history duplicates
INSERT INTO results SELECT * FROM results_d2_backup;

-- DUP-1: results deleted from copied meets
INSERT INTO results SELECT * FROM results_d1_backup;

-- DUP-3: duplicate relays — PARENTS FIRST, then legs (FK order matters)
INSERT INTO relay_results  SELECT * FROM relay_results_d3_backup;
INSERT INTO relay_athletes SELECT * FROM relay_athletes_d3_backup;

-- DUP-4: empty duplicate athlete records
INSERT INTO athletes SELECT * FROM athletes_empty_backup;

-- Accidental legacy import, 2026-08-19 (only if you want the bad rows BACK, which you don't —
-- they carry NULL event_type_id and Preliminaries+"Heat N" duplicates)
INSERT INTO results SELECT * FROM results_accidental_import_20260819_backup;
```

## Cross-source duplicates (2026-08-19) — 1,252 rows DELETED, found by the owner in the app

The NCAA DII Outdoor 4x100 showed FOUR times on an athlete profile: `45.15a`/`45.34a`
(athletic.net) beside `45.15 F`/`45.34 P` (TFRRS). Same two races, two sources — the trailing `a`
is all-weather-track notation, not part of the time. 1,252 such rows across 243 meets.

The athletic.net copies were the ones removed, because TFRRS carries the round label. **Their
extra fields were merged onto the surviving row first** — wind (345 rows) and `team_id` — so
athletic.net's richer data was not lost.

```sql
-- restore the deleted athletic.net copies (they will reappear as duplicates)
INSERT INTO results SELECT * FROM results_xsource_20260819_backup;
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
| 1 cross-source duplicate relay deleted | **1** | `INSERT INTO relay_results SELECT * FROM relay_results_20260819_backup;` |

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
   cleared meet was re-tested from `results_d1_backup` (schools vs host state). 31 clean; the 2
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
