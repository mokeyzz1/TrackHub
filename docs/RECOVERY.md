# Recovery — every destructive change, and how to undo it

**Why this file exists.** On 2026-08-10 the owner said plainly: *"I'm not checking. I'm letting
you just cook."* That is a reasonable way to work **only if every change is reversible and the
reversal is written down somewhere other than a chat log.** This is that place.

Nothing here is theoretical. Several of these operations were wrong on the first attempt and were
corrected before running — but the assumption behind this file is that one of them is still wrong
and nobody has noticed yet.

### Athlete-status public summary — applied 2026-09-08

Migration `20260908190000_publish_athlete_status_summary.sql` added the invoker-security
`public.v_athlete_status_summary` view and granted read access to the app roles. It exposes only
collegiate-history booleans and confirmed current career/professional periods; private evidence,
provisional periods, resolution methods, and source payloads are not columns in the view. Existing
athlete/profile endpoints and fact rows were not changed. To reverse it, run
`docs/database-audit/rollback_athlete_status_summary.sql`, which drops the view and removes the
grant that this migration added to `v_athlete_collegiate_history`.

### Placeholder athlete identity guard — applied 2026-09-08

Three empty `[Name Withheld]` rows (`154055`, `156767`, `182220`) were copied exactly once to
`archive.athletes_empty_backup` and removed after every declared athlete foreign key was verified
at zero references. Migration `20260908202312_reject_placeholder_athlete_names.sql` prevents an
unknown/privacy label from becoming a new public athlete; source observations remain eligible for
private quarantine and review. The schema guard can be removed with
`docs/database-audit/rollback_placeholder_athlete_name_guard.sql`. Restoring the three archived
shells is intentionally not part of migration rollback because they contain no athlete facts and
would violate the corrected identity contract.

### Competition hierarchy normalization — applied 2026-09-07

Migration `20260907195650_normalize_collegiate_competition_hierarchy.sql` is primarily additive. It creates
governing-organization, organization-scoped level, and school-membership tables while leaving the
legacy `schools.division` and `schools.division_id` values available to current readers. It does
not write athletes, results, relays, meets, or other fact tables. The migration also corrects school
2134 (University of The Bahamas) from the previously mapped `NAIA` value to `INDEPENDENT`, based
on the current NAIA membership listing; the school and all related facts are preserved.

Two rollback-only runs of `node docs/database-audit/test_competition_hierarchy_migration.js`
passed before deployment. The exact migration was then committed and version `20260907195650`
recorded once in the migration ledger. Post-deployment verification found 12 organizations, six
organization-scoped levels, and 1,844 current primary memberships for exactly 1,844 classified
collegiate schools, with zero organization/level mismatches and zero invalid null organizations.
All three new tables have RLS/read policies and the public profile view uses invoker security.
If recovery is required after deployment, first confirm no reader depends on the new objects; then
restore school 2134 to `division = 'NAIA'` and the `division_id` selected by code `NAIA`, which is
the exact pre-migration state asserted by the migration. Remove only the new membership rows/tables
in one reviewed transaction. Do not use `CASCADE` or delete fact rows.

### Athlete status evidence foundation — applied 2026-09-08

Migration `20260908045520_add_athlete_status_evidence_model.sql` added three initially empty
tables and `v_athlete_current_status`. It installed `btree_gist` to enforce non-overlapping
confirmed periods for the same athlete/status axis. Raw evidence and the evidence bridge have no
public policy; only confirmed resolved periods are publicly readable, and the view uses invoker
security. A live negative-policy test proved provisional review rows are hidden. The
migration does not update athletes, results, relays, rosters, schools, or teams and performs no
classification backfill.

The first live deployment runner mistakenly committed its tagged synthetic verification fixture:
one evidence row, two period rows, and one bridge row for athlete 89. The issue was detected
immediately. All four rows were deleted by their exact `migration_test` and
`independent_axis_test` tags in one asserted transaction. Final live verification found zero rows
in all three new tables and 151,537 view rows for 151,537 athletes. The runner now commits directly
after the schema SQL when `--commit` is supplied, so test fixtures run only in rollback rehearsals.

To retire this unused foundation before writers adopt it, first verify all three tables remain
empty and no reader depends on the view. Drop the view, bridge, periods, then evidence table in one
reviewed transaction without `CASCADE`. Keep `btree_gist` if any other object uses it; remove the
extension only after a dependency check. After writers begin storing evidence, do not drop these
objects—restore or migrate their rows through a separate before-imaged recovery plan.

### Legacy collegiate status evidence backfill — applied 2026-09-08

Migration `20260908173000_backfill_legacy_collegiate_status_evidence.sql` copied 127,334 existing,
structurally consistent `athlete_team_seasons` relationships into private evidence and linked them
to 126,925 provisional athlete-season periods. It does not claim an original roster snapshot:
every copied row is tagged `source = 'legacy_database'`, `evidence_type = 'legacy_relationship'`,
and `verification_status = 'unresolved'`; every period uses
`resolution_method = 'legacy_team_season_unresolved'`. The public current-status view did not
change because provisional periods are not public and both stored seasons end before the current
date. Twenty-one Cheyney rows lacking normalized governing membership and two gender-conflicted
relationships were deliberately excluded. No athlete, result, relay, team, school, or original
team-season row was updated or deleted. Migration ledger version `20260908173000` is recorded once.

The exact rollback is
`docs/database-audit/rollback_legacy_collegiate_status_backfill.sql`. It removes only bridges,
periods, and evidence with the migration's exact source/method tags, then restores the two prior
constraints. A live rollback-only rehearsal removed all tagged rows and restored the exact
127,334/126,925/127,334 applied counts when its transaction rolled back. Verify no newer process
has linked or promoted these rows before committing a recovery. Do not delete the original
`athlete_team_seasons` rows.

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

### Confirmed collegiate catalog onboarding — 2026-09-06

Migration `20260906170106_onboard_confirmed_collegiate_schools.sql` is additive catalog work:
49 schools, 87 gender-specific teams, and the NWAC association were added; the existing USSU
school/team was reused. It did not update or delete any athlete, result, relay, meet, or other fact
row. The exact 50-school plan and all 88 reviewed TFRRS team URLs are retained in
`database-audit/collegiate_school_onboarding_20260906.json` and
`database-audit/collegiate_source_team_review_20260906.json`.

Four pre-existing aliases were corrected: the men's and women's `Clark_College` aliases no longer
point to Clark University (Massachusetts), and the men's and women's `Lane_CC` aliases no longer
point to Lane College (Tennessee). The migration asserts those exact old targets before changing
them. Do not restore those known-wrong mappings during ordinary recovery.

If this catalog must be removed, first reverse every later profile or result repair that references
these schools or teams. In one transaction, delete only aliases whose reviewed source URLs are in
the retained evidence file, then delete only now-unreferenced teams from those URLs, followed by
the 49 newly added schools. Remove `NWAC` only if no school still references it. Preserve USSU and
any row that has acquired a later reference. Foreign keys are expected to block an unsafe removal;
never use `CASCADE`. A rollback-only replay of the forward migration and a post-apply idempotence
replay both passed, proving the catalog can be reconstructed without touching fact data.

### Confirmed collegiate profile repair — 2026-09-06

Operation `20260906_confirmed_collegiate_profile_repair` changed only `athletes.school_id` for
1,184 source-confirmed college athletes; four USSU women in the 1,188-athlete cohort were already
correct. The existing athlete update trigger also advanced `updated_at`. All 1,184 complete athlete
before-images are retained in `ingest.fact_cleanup_archive`. No result or club row changed; result
coverage remained 8,566 total rows and 8,487 rows with no team affiliation.

Run `node docs/database-audit/rollback_confirmed_collegiate_profiles.js` for a transactionally
rolled-back rehearsal. Add `--commit` only to restore all 1,184 archived `school_id` values and
remove this operation's archive rows. The runner refuses partial, duplicate, or diverged state.

### Clark/Lane collegiate result-affiliation repair — 2026-09-06

Operation `20260906_clark_lane_collegiate_result_affiliation_repair` corrected 52 TFRRS-linked
4x100 result legs and 13 relay parents from four known-wrong legacy teams (Clark University MA and
Lane College TN) to the reviewed Clark College and Lane Community College teams. The four meets and
all source result URLs, result IDs, relay IDs, and old/new team URLs are retained in
`database-audit/clark_lane_collegiate_result_repair_20260906.json`. No marks, places, dates, event
fields, relay legs, or source links changed. Exactly 65 complete before-images are in
`ingest.fact_cleanup_archive` under the operation key.

Run `node docs/database-audit/rollback_clark_lane_collegiate_results.js` for a transactionally
rolled-back rehearsal. Add `--commit` only when intentionally restoring the old team assignments;
the runner refuses a partial or diverged current state and removes the operation archive after a
successful committed rollback. The known-wrong aliases should not be restored during normal use.

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

## Remaining verified collegiate profiles (2026-09-07) — 178 rows updated

Operation key: `20260907_remaining_collegiate_profile_repair`.

- The 178 exact pre-change athlete rows are retained in `ingest.fact_cleanup_archive`.
- `node docs/database-audit/rollback_remaining_collegiate_profiles.js` rehearses the restore and rolls it back.
- Add `--commit` only to intentionally restore all 178 profiles to their exact prior school and timestamp; the archive is removed only after that committed restore.
- The catalog migration is `20260907183959_onboard_remaining_verified_collegiate_schools.sql` and its remote ledger version is marked applied.
- Fourteen USMAPS prep-school athletes, all club athletes, and all result rows were unchanged.

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
