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

Per-run audit JSONs of the exact ids live in `scrapers/*.json` (16 files as of 2026-08-10).

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
```

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

1. **A wrongly-deleted copied meet (DUP-1).** If the "copy" was actually the real meet, those
   athletes silently lose a competition. Detection: an athlete's history has a gap. Nobody will
   notice for months. **This is the highest-risk thing done today** — the attribution rule failed
   four times before the location test worked, and it was only validated on ~20 hand-checked pairs
   out of 33 meets cleared.
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
