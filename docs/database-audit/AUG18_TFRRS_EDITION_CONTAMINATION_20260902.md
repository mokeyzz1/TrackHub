# August 18 TFRRS annual-edition contamination audit

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

Date: 2026-09-02
Status: repair prepared and locally verified; live database unchanged

## Executive finding

Commit `7ad3f7e` added `scrapers/match-tfrrs-index.js` and reported 313 recovered TFRRS links.
Its page verifier required the expected month and day within a three-day window, but did not require
the expected year. Annual invitationals commonly occur on the same weekend, so current 2026 result
pages passed verification for older editions. A later stored-link import copied the current page's
facts into those old meet shells.

This is not an Ohio-Christian-only problem. It is one deterministic batch affecting 160 old meet
rows. Two additional same-source pairs are only two or three days apart and are deliberately held
for manual meet-identity review:

- meet 12149 versus 12290, SNHU Spring Invitational, TFRRS 95531;
- meet 12562 versus 12632, Bauer Open, TFRRS 96401.

## Reviewed scope

The detector requires all of the following:

1. the old meet has no primary `meet_url`;
2. its TFRRS result ID is also attached to a meet that does have a primary `meet_url`;
3. the old meet was updated on 2026-08-18;
4. the meet dates differ by more than three days; and
5. only facts created on 2026-08-18 are treated as batch facts.

That yields one canonical target for every affected meet:

| Reviewed object | Count |
|---|---:|
| Incorrect old meet links | 160 |
| Canonical current meets | 108 |
| Batch individual rows | 106,219 |
| Batch relay parents | 3,246 |
| Batch relay legs | 12,626 |
| Total rows archived, including meet metadata | 122,251 |

The affected facts have zero `ingest.source_links` and zero `ingest.observations`. The repair refuses
to run if that changes.

## Preservation classification

The repair compares a fact only with the correct meet for the same TFRRS result ID. It uses internal
athlete/team identity, event type, place, normalized round, and a precision-normalized mark. It also
mirrors the live duplicate indexes so floating-point representations such as `202.67000000000002`
and `202.67` cannot create relocation conflicts.

### Individuals

| Action | Rows/facts |
|---|---:|
| Remove copies whose correct-meet fact already exists | 77,040 rows |
| Preserve one missing fact on the correct meet | 19,434 facts |
| Remove repeated old-shell copies of those preserved facts | 9,745 rows |

### Relays

| Action | Rows/facts |
|---|---:|
| Remove copies whose correct-meet fact already exists | 3,015 rows |
| Preserve one missing fact on the correct meet | 156 facts |
| Remove repeated old-shell copies of those preserved facts | 75 rows |
| Relay legs retained with preserved parents | 583 rows |

The 156 preserved relay groups have no name-roster or identity-roster variation between their old
annual copies. The chosen representative maximizes resolved athlete IDs and lineup completeness.
No individual or relay representative conflicts with an existing or another relocated unique key.

The old shells also contain 143 individual facts and 2,544 relay facts created outside this batch.
Those rows are not changed. After clearing the false TFRRS URL, affected shells are marked
`missing_tfrrs_url`; the false import timestamps/source are cleared.

## Reversibility and verification

Migration:
`supabase/migrations/20260902140000_repair_aug18_tfrrs_edition_contamination.sql`

Emergency rollback:
`docs/database-audit/rollback_aug18_tfrrs_edition_contamination.sql`

The migration reuses private `ingest.fact_cleanup_archive`; it creates no new persistent table and
no public API. It archives all original meet, result, relay-parent, and relay-leg rows before any
mutation.

Verified against the isolated PostgreSQL 17 restore:

- full migration inside an outer rollback transaction;
- exact archive counts by source table;
- all postconditions and live uniqueness indexes;
- migration order after both reviewed school-consolidation migrations;
- full emergency rollback;
- byte-for-byte JSON equality for all 122,251 restored rows;
- year-aware matcher regression tests (6 passing).

## Ohio Christian and NCCAA

Ohio Christian is currently listed by the NCCAA as a Division I, Mideast Region member sponsoring
men's and women's indoor/outdoor track and field. The university states that it transitioned from
NAIA participation in 2023-24 to NCCAA competition beginning fall 2024.

Authoritative sources:

- Ohio Christian transition statement:
  https://www.ohiochristian.edu/our-hope-for-a-renewed-witness/
- NCCAA Ohio Christian member page:
  https://thenccaa.org/sports/2016/6/7/Ohio_Christian_University.aspx
- NCCAA current member listing:
  https://thenccaa.org/sports/2017/6/14/Member_Schools_17-18.aspx

The current database has six `divisions` rows (NCAA DI/DII/DIII, NAIA, NJCAA, CCCAA), an existing
`conferences` row named NCCAA (`conference_id=66`), and an empty temporal
`conference_memberships` table. The schema cannot accurately express a school's simultaneous or
historical governing-body affiliations: `schools.division_id` is one current value, while
`conference_memberships` represents conferences, not governing bodies.

Decision for this cleanup:

- do not create another table;
- do not relabel all historical Ohio Christian results as NCCAA;
- do not misuse the existing NCCAA conference row without a project-wide affiliation rule;
- preserve the canonical school's current NAIA classification during identity consolidation;
- handle temporal governing-body affiliation as a separate reviewed schema decision.

This keeps the verified fact repair independent from an unresolved taxonomy change.
