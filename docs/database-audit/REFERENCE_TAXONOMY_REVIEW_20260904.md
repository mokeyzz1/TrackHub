# Reference and taxonomy review — 2026-09-04

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

## Scope

This is a read-only production review of the reference layer used by schools, teams, meets, and
source identity links: `divisions`, `regions`, `conferences`, `conference_memberships`, and
`external_ids`. The reproducible query set is `docs/database-audit/reference_taxonomy_scan.sql`.
No rows, tables, columns, policies, grants, or constraints were changed.

## Live evidence

| Surface | Rows / finding |
| --- | ---: |
| `divisions` | 11 |
| `regions` | 27 |
| `conferences` | 118 |
| `conference_memberships` | 0 |
| `external_ids` | 356 |

The canonical division catalog is used by 1,786 schools, 118 conferences, and 27 regions without
orphan foreign keys. Division coverage is uneven by design: NCAA DI/DII/DIII, NAIA, NJCAA, CCCAA,
USPORTS, USCAA, NCCAA-I/II, and LAI are represented. `schools.division` agrees with the canonical
division code wherever it is populated except for two NULL rows and one intentional `Other`
placeholder row (Dawgs). The legacy `schools.ncaa_region` column is NULL on all 1,786 rows, while
the canonical `region_id` is populated on 1,120 rows; the canonical relationship has no orphans.
There is no reason to backfill or drop the legacy text field in this wave.

## Conference relationships

The live relationship is `schools.current_conference_id -> conferences.conference_id`: 117 of the
118 conferences have at least one current school, and one catalog row (Allegheny Mountain
Collegiate Conference, ID 851) has no current school reference. That empty row is retained as a
valid reference/history record; it is not safe to delete from a name-only scan.

`conference_memberships` is a historical bridge with `school_id`, `conference_id`, `start_year`,
and `end_year`, a unique `(school_id, conference_id, start_year)` key, and cascading school/
conference foreign keys. It currently has zero rows. This is a historical-membership data gap,
not evidence that the table is redundant or that another membership table should be created. The
current-school foreign key and the empty bridge have different semantics and should stay distinct
until source-backed historical affiliations are available.

There are 44 conferences without an abbreviation and 68 without a website. These are enrichment
gaps, not identity defects: conference names are unique after trim/lower normalization and every
conference has a canonical `division_id`.

## External identity map

`external_ids` is one shared portability map: all 356 rows are verified and point to an athlete
(353 distinct athletes); school, team, and conference link columns are currently unused. The
`UNIQUE (source, external_key)` constraint has zero duplicate groups, and all required source/key
values are present. Three athletes have two verified source IDs each and remain source-review
candidates (including one athlete with two TFRRS IDs). Keep the
nullable entity columns in this table rather than splitting an empty school/team/conference map or
creating another crosswalk; add a reviewed link only when provenance supports it.

## Constraints and access boundary

- `divisions.code` is unique and `division_id` is the primary key.
- `regions.region_name` is unique and `region_id` is the primary key; `division_id` references
  `divisions` with `NO ACTION` deletion.
- `conferences` has a normalized-name unique index, a primary key, and a `division_id` foreign key
  with `NO ACTION` deletion.
- `conference_memberships` has a primary key, the historical uniqueness key, and cascading FKs to
  schools and conferences.
- `external_ids` has a primary key, the `(source, external_key)` unique key, and nullable
  cascading FKs to athletes, schools, teams, and conferences.
- All five public tables expose SELECT-only policies to `anon` and `authenticated`. Writes are
  limited to the existing service-role/postgres paths; no public write policy was added.

## Design conclusion

The reference layer is not missing a replacement organization schema. It has a small canonical
division/region/conference catalog, an intentionally empty historical bridge, and a verified
athlete-focused external-ID map. The safest cleanup is to preserve these semantics, enrich missing
metadata only from authoritative sources, and populate historical memberships only through a
reviewed source-backed import. Do not delete the unused conference row, bulk-fill legacy text
columns, split `external_ids`, or add a second taxonomy/membership table.

## Next gate

Move to the private ingest/provenance schemas and their grants/RLS. Any future conference-history
backfill must prove source lineage, temporal boundaries, conflict handling, and rollback before
touching `conference_memberships`.
