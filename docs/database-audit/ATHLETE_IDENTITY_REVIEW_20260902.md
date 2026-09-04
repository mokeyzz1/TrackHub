# Athlete identity review

Date: 2026-09-02

Status: audit complete; importer hardening, secondary identity preservation, and guarded
consolidation implemented, locally verified, and applied to production on 2026-09-02

## Why this follows the meet repair

The August 18 TFRRS edition repair exposed two Ohio Christian records for Faith Yancey. After the
meet facts are returned to their correct 2026 meets, athlete IDs 32807 and 203305 still describe the
same person and hold duplicate performances. That is part of a wider identity pattern rather than
an isolated school problem.

The project model already states that one internal `athlete_id` represents one person. It also
states that different TFRRS IDs do not prove different people: transfers and source re-scrapes can
issue a second profile. `athlete_team_seasons` is the existing affiliation-history bridge, and
`external_ids` is the existing multi-source identity table. No new persistent table is needed.

## Method

The repeatable detector is `docs/database-audit/athlete_identity_scan.sql`. It was run against a
temporary PostgreSQL 17 clone after applying the three prepared cleanup migrations.

A candidate pair must have:

1. the same normalized name;
2. the same gender;
3. the same meet and canonical event;
4. the same place;
5. a normalized Final/Finals or Prelim/Preliminaries round; and
6. the same precision-normalized numeric mark.

Relay-as-individual rows and nonnumeric statuses are excluded. A pair is held if the two identities
also appear at different meets on the same date, which the project treats as definitive
different-person evidence.

## Results

| Classification | Count |
|---|---:|
| Evidence-backed pairs | 671 |
| High-confidence pairs | 667 |
| Contradictory pairs held | 4 |
| Athlete rows in high-confidence components | 1,332 |
| Actual people represented | 665 |
| Duplicate athlete rows eligible for consolidation | 667 |

The graph contains 663 ordinary two-row components and two three-row components. There is no large
name-based cluster being collapsed.

### Dependent-row plan

If the oldest internal ID is used as the temporary component representative, the 667 duplicate
rows own:

| Dependency | Reviewed action | Count |
|---|---|---:|
| `results` | delete confirmed duplicate facts | 1,255 |
| `results` | move unique facts | 689 |
| `relay_athletes` | move lineup references | 134 |
| `athlete_prs` | delete 4 exact tied copies; move 5 unique rows | 9 |
| `athlete_team_seasons` | move (no conflict) | 1 |
| `ingest.observations` | rewire | 151 |
| `ingest.athlete_aliases` | rewire | 2 |
| `ingest.source_links` | rewire from deleted fact to surviving fact | 9 |
| `external_ids` | existing duplicate-owned rows | 0 |
| `live_results` | existing duplicate-owned rows | 0 |

Four PR keys contain two rows each. Each pair is an exact performance tie, so the older canonical
row is retained. The other five duplicate-owned PR rows have no canonical key conflict and move.

### Source identities that must not be lost

The duplicate athlete rows contain 283 TFRRS IDs and 58 Athletic.net profile URLs. Those are valid
source identities even when two IDs describe one person. They must be recorded against the merged
person in existing `external_ids` and in the controlled-ingestion alias resolver before a duplicate
athlete row can be removed.

Today, `external_ids` contains only 15 DirectAthletics mappings. `ingest.athlete_aliases` is active
and contains 664 TFRRS, 217 Athletic.net, and 117 TrackScoreboard aliases, but legacy TFRRS and
Athletic.net lookup paths still query the single ID columns on `athletes` directly. Deleting an old
profile row before those lookups understand secondary IDs could cause that athlete to be recreated.

## Creation cohorts

The high-confidence pairs are concentrated in a few batches:

| Older row created | Newer row created | Pairs | Includes Unattached |
|---|---:|---:|---:|
| 2026-07-18 | 2026-08-06 | 294 | 294 |
| 2026-07-19 | 2026-08-06 | 85 | 85 |
| 2025-11-25 | 2026-08-18 | 157 | 0 |
| 2025-11-25 | 2026-08-09 | 77 | 0 |
| 2025-11-25 | 2026-08-14 | 18 | 0 |
| 2026-01-21 | 2026-08-18 | 18 | 0 |

The August 6 cohort is the Unattached identity limitation: source-profile changes created another
person row instead of another source identity. The August 9/14/18 cohorts are predominantly new
TFRRS profile IDs resolving separately from existing people.

## Held pairs

These four pairs share performances but also appear at different meets on the same date. No merge
is authorized without source-by-source review:

| Athlete IDs | Name | School | TFRRS IDs |
|---|---|---|---|
| 5805 / 194426 | Dylan Doss | Wis Oshkosh | 8670507 / 9260799 |
| 12680 / 202721 | Sarah May | Dordt | 7365229 / 9170209 |
| 36282 / 201440 | Brei Christoffer | South Dakota | 8678047 / 9237672 |
| 57069 / 192964 | William Thomas | Kalamazoo | 8277497 / 8520774 |

## Required implementation order

1. **Complete locally:** TFRRS and Athletic.net identity lookup now resolve existing verified
   `external_ids` and active reviewed aliases before the legacy one-ID athlete columns. Conflicting
   reviewed mappings are held unresolved and cannot create a replacement athlete.
2. **Complete locally:** regression tests prove a secondary profile ID resolves to the canonical
   athlete and is excluded from creation. A disposable PostgreSQL clone also verified Faith
   Yancey's IDs `8995421` and `9261451` both resolve to athlete `32807` after the reviewed mappings
   are present, while the old athlete row still exists.
3. **Complete locally:** migration
   `20260902144458_preserve_reviewed_secondary_athlete_identities.sql` inserts the 341 reviewed
   source identities into both existing identity systems: 283 TFRRS and 58 Athletic.net rows in
   `external_ids`, plus the same 341 active private aliases. It creates no table and does not move
   or delete athletes or facts. Exact fingerprints pin the 667 duplicate mapping, the 341 source
   identity mapping, and the four held pairs. Apply, replay, rollback, and reapply all passed on a
   disposable PostgreSQL 17 clone after migrations 1200, 1300, and 1400. An ordering test against
   the untouched pre-cleanup backup failed closed at the fingerprint gate and inserted zero rows.
4. **Complete locally:** migration
   `20260902170615_consolidate_reviewed_athlete_duplicates.sql` consolidates the 667 duplicate
   rows only after all reviewed counts and action fingerprints match. It archives 2,921 original
   rows in the existing private `ingest.fact_cleanup_archive`, including 9 source links and 20
   observation references that would otherwise have blocked deletion of redundant results. It
   moves 689 unique results, removes 1,255 duplicate facts, moves 134 relay legs, consolidates 9
   PR rows, and rewires all private provenance. Four canonical current-school/profile rows are
   refreshed from the combined dated history while never promoting Unattached. Apply, replay,
   exact rollback, and reapply passed on the disposable PostgreSQL 17 clone. The four contradictory
   pairs remain untouched. A second clone without the identity-preservation migration failed closed
   before archiving or changing any row. The live database is unchanged.
5. **Complete locally:** post-apply checks found zero orphaned athlete/result references, zero bad
   moves, all 2,921 archive rows present, and all 341 secondary source identities still resolving to
   canonical athletes. The exact rollback restored the original athlete, result, relay-leg, and PR
   counts before a successful reapply. A fresh compressed snapshot of production was then restored
   into a disposable PostgreSQL 17 database; all four reviewed migrations passed there in order,
   including replay, exact rollback, and reapply. The restored final state had 151,537 athletes,
   3,419,178 results, 450,685 relay legs, and zero orphaned references.
6. **Complete:** after the fresh production snapshot passed, the four migrations were applied to
   production in order. The identity and consolidation migrations initially hit the hosted
   statement timeout during their broad contradiction scans; both were optimized with candidate
   date/meet indexes, retested locally, and then completed successfully live. Final production
   checks found zero duplicate references or orphaned facts.

## Historical production preflight

The pre-cleanup live snapshot had 152,204 athletes, 3,507,218 results, 462,728 relay legs, and
156,385 ingestion observations. Those figures are retained here as the before-state for the
reviewed migrations; they are not the current production counts.

## Current production state — 2026-09-04

The live database now has 151,537 athletes, 3,419,178 results, and 450,685 relay legs. It contains
341 verified secondary source identities and 341 active aliases, plus the 2,921-row athlete
consolidation archive. All eight athlete rows in the four contradictory same-performance pairs
remain present and held. The new 209 shared Athletic.net URL collisions are not included in any
merge; they require a separate reviewed source map.

This order preserves every source identity and prevents the cleanup from immediately recreating the
same duplicates.

## Live post-cleanup identity checkpoint — 2026-09-04

The broad normalized-name-plus-school scan currently reports 7,037 candidate groups / 10,649
extra rows. That is a collision population, not a merge list. A stronger source-identity signal
also surfaced **209 shared Athletic.net profile URLs** (209 extra athlete rows): 151 groups have
the same name/school/gender shape, while 58 groups contain a different name, school, or gender.
None of the 209 URL keys is represented in `public.external_ids`; the existing 58 Athletic.net
external-ID rows cover different reviewed keys. There are currently zero duplicate TFRRS ID groups.

The mixed URL groups are explicit evidence that a URL cannot become a table-wide unique constraint
without source validation. The same-shape groups are review candidates for promotion into the
existing `external_ids`/`ingest.athlete_aliases` identity surfaces, but no athlete merge is safe
from this scan alone. The reusable read-only detector is
`docs/database-audit/athletic_net_url_collision_scan.sql`.

The final production counts remain 151,537 athletes, 3,419,178 results, and 450,685 relay legs;
the four contradictory same-performance athlete pairs remain present and held.
