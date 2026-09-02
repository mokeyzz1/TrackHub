# School identity review — 2026-09-02

## Decision

Do not merge all equal normalized school names. The restored database contains 83 two-row
normalized-name collision groups, but normalized text is only a candidate generator, not an
institution identifier.

The preservation-safe classification is:

| Classification | Groups | Action now |
|---|---:|---|
| Confirmed same institution, both rows carry data | 17 | Guarded proposal prepared and locally validated |
| Confirmed distinct institutions | 2 | Keep both; improve identity keys later |
| Confirmed same institution, one row is empty or canonical is empty | 64 | Second guarded proposal prepared and locally validated |
| **Total** | **83** | No live changes |

The complete reproducible inventory is `school_identity_scan.sql`. It emits every column used for
classification and every one of the 166 school rows, rather than hiding rows behind a summary
count. Its normalization lowercases before removing non-alphanumeric characters. The earlier
strip-before-lower expression was rejected because it erased uppercase initials and falsely
collided institutions such as Jacksonville with FCC Jacksonville and Oakland with Oakland CC.

## Confirmed same-institution pairs

The older canonical rows have the state, governing division, region/conference relationships, and
TFRRS team URLs. The newer rows are state-less imports with either a default `NJCAA` classification
or `Other`. TFRRS team/profile slugs and the underlying performances identify the following pairs
as the same institutions:

| Canonical school | Duplicate school | Preferred display name |
|---:|---:|---|
| 1178 Bethany Wv | 1775 Bethany (W.V.) | Bethany (W.V.) |
| 973 Coffeyville CC | 1589 Coffeyville CC | Coffeyville CC |
| 726 Columbia Intl | 1782 Columbia Int'l | Columbia Int'l |
| 727 Columbia SC | 1726 Columbia (S.C.) | Columbia (S.C.) |
| 1000 Fort Scott CC | 1590 Fort Scott CC | Fort Scott CC |
| 1315 Johnson & Wales (RI) | 1780 Johnson & Wales (R.I.) | Johnson & Wales (R.I.) |
| 1067 Neosho County CC | 1588 Neosho County CC | Neosho County CC |
| 1096 Richard Bland | 1625 Richard Bland | Richard Bland |
| 857 SCADAtlanta | 1807 SCAD Atlanta | SCAD Atlanta |
| 1121 Southwestern CC | 1592 Southwestern CC | Southwestern CC |
| 1509 Stevens | 1697 Stevens | Stevens |
| 1496 Stjohnfisher | 1707 St. John Fisher | St. John Fisher |
| 1500 St Josephs Me | 1728 St. Joseph's (Me.) | St. Joseph's (Me.) |
| 1503 St Marys Md | 1744 St. Mary's (Md.) | St. Mary's (Md.) |
| 897 The Masters | 1777 The Master's | The Master's |
| 1532 Union Ny | 1753 Union (N.Y.) | Union (N.Y.) |
| 1585 York Ny | 1822 York (N.Y.) | York (N.Y.) |

The intended merge direction keeps the canonical ID and relational metadata, adopts the clearer
display spelling where useful, and preserves all dependent facts.

## Dependency proof

Across the 17 duplicate rows, a consolidation must preserve and rewire:

| Relation | Rows |
|---|---:|
| Schools | 17 duplicate + 17 canonical pre-change rows |
| Teams | 33 duplicate teams |
| Athletes whose current school is the duplicate | 677 |
| Individual results on duplicate teams | 9,724 |
| Relay results on duplicate teams | 441 |
| Ingestion observations on duplicate teams | 653 |
| Athlete-team seasons | 0 |
| Live results | 0 |
| Team aliases | 0 |
| School/team external IDs | 0 |
| Conference memberships on duplicate schools | 0 |

Each duplicate team has a same-gender canonical target. Remapping all 441 relay rows produces zero
conflicts against either relay uniqueness index. Individual-result uniqueness does not include
`team_id`, so the team remap does not collapse individual performances. Athlete IDs and result IDs
remain unchanged.

The St. Joseph's pair contains Isaac Keresey and Olivia Bean twice because TFRRS assigned separate
cross-country and track profile IDs. That is an athlete-identity issue, not evidence for two
schools. School consolidation can preserve both athlete rows and all of their event history; an
athlete merge should wait for a model that can retain multiple source profile IDs.

Twelve other athletes initially looked inconsistent because their profile URL slug names a prior
school. Their dated results show transfers into Coffeyville, Columbia (S.C.), or Southwestern CC in
2026. Their historical result-level team IDs are valid and must stay tied to the school represented
at each performance. The athlete's current `school_id` can move from the duplicate school row to
the canonical row without rewriting that transfer history.

## Confirmed distinct pairs

- School 791 Lewis-Clark State College (Idaho, NAIA) and school 1337 Lewis & Clark College
  (Oregon, NCAA Division III) normalize to the same letters but are different institutions.
- School 661 West Chester University of Pennsylvania (NCAA Division II) and school 1144 SUNY
  Westchester Community College (NJCAA) are different institutions.

Stevens was specifically checked rather than inferred from its short name. School 1697's Chelsea
Baxter profile and performances belong to Stevens Institute of Technology in New Jersey, the same
institution as canonical school 1509. It is not Thaddeus Stevens College of Technology, which is a
separate NJCAA school already represented by school 1130.

## Root cause

The duplicate batches came from two old one-off loaders:

- `add-missing-schools.js` treated a missing source `team_state` as proof that the school was absent,
  inserted the name without checking the existing normalized school set, and assigned every new
  row `division: 'NJCAA'`. Sixty-nine state-less collision rows share its 2026-02-05 14:18:54 EST
  creation timestamp.
- `add-new-schools.js` did check a space-preserving normalized name, but that normalization treats
  `Stjohnfisher` and `St. John Fisher` as different strings. It inserted unknown divisions as
  `Other`. Twelve punctuation/display variants share its 2026-02-05 14:34:18 EST timestamp.

Both scripts require a prevention fix before they are ever used again: compact-name lookup must
only identify candidates, and state/division/source identity must decide whether an insert is safe.

## First guarded proposal and validation

`supabase/migrations/20260902120000_consolidate_reviewed_school_duplicates.sql` is a guarded,
replay-safe proposal for only the 17 confirmed pairs. It has not been applied to the live database.
It:

1. Refuses to run if the exact school/team mapping or reviewed row counts drift.
2. Archives every changed school, team, athlete, result, relay, and observation row in the existing
   private `ingest.fact_cleanup_archive` table.
3. Rewires dependencies, retains canonical IDs and governing metadata, and adopts reviewed display
   names.
4. Deletes only the 33 duplicate team rows and 17 duplicate school rows after all foreign-key
   references are gone.
5. Includes `rollback_reviewed_school_duplicates.sql`, which restores every archived identity
   reference and the exact deleted school/team rows.

The migration and rollback were exercised against the isolated PostgreSQL 17 restore. Every test
was enclosed in an outer transaction and rolled back:

| Check | Result |
|---|---:|
| Archived pre-change rows | 11,562 |
| Duplicate schools absent after proposal | 17 of 17 |
| Duplicate teams absent after proposal | 33 of 33 |
| Duplicate schools restored by rollback | 17 of 17 |
| Duplicate teams restored by rollback | 33 of 33 |
| Archived result team IDs restored | 9,724 of 9,724 |
| Proposal replay | Safe no-op |
| Rollback replay | Safe no-op |
| Final local totals after rollback | 1,867 schools; 3,677 teams; 152,204 athletes; 3,507,218 results; 203,826 relays; 156,385 observations |

## Second guarded proposal: remaining 64 pairs

The corrected detector and loader provenance resolved the remaining 64 pairs without relying on
name equality alone:

- Sixty-three duplicate rows are state-less shells created at exactly
  `2026-02-05 14:18:54.764904-05` by `add-missing-schools.js`. Each has two empty teams and no
  athlete, result, relay, observation, alias, external-ID, membership, live-result, or season
  dependency. Its canonical counterpart predates the loader, has the state and governing division,
  and owns the TFRRS team identity.
- School 1818 `Ohio Christian` is the one data-bearing exception. It is the display-name variant of
  canonical school 831 `OhioChristian`: the canonical men's and women's team rows own the exact
  TFRRS `OH_college_*_OhioChristian` URLs, while the later row owns 9 athletes, 152 individual
  results, and 1 relay. Official athletics and TFRRS both identify the current program as Ohio
  Christian University.

`supabase/migrations/20260902130000_remove_reviewed_empty_school_duplicates.sql` archives 355
pre-change rows, removes the 63 empty shells, consolidates Ohio Christian into school 831, adopts
the readable `Ohio Christian` display name, and retains every athlete and performance ID. Its
companion `rollback_reviewed_empty_school_duplicates.sql` restores all 64 schools, 128 teams, 9
athletes' school assignments, 152 result team assignments, and the relay team assignment.

The two school migrations were tested both separately and together, in migration order, with
rollbacks in reverse order. Replay tests for both proposals and both rollbacks passed. After both
proposals, the corrected detector reports exactly two collision groups—the confirmed-distinct
Lewis-Clark/Lewis & Clark and West Chester/Westchester pairs. Final restored row totals remain
byte-for-byte at the reviewed counts after rollback.

Ohio Christian exposes a separate affiliation-model issue that this identity cleanup deliberately
does not guess at. The university announced a transition from NAIA to NCCAA beginning in fall 2024,
while `public.divisions` has no NCCAA value. The canonical row's existing NAIA classification is
preserved until governing-body history/current affiliation is modeled explicitly.

Several Ohio Christian athlete rows also contain older results that deserve a separate
athlete-history audit. This proposal changes only school/team identity references; it does not
reinterpret or delete those performances.
