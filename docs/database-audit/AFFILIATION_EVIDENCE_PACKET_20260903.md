# Affiliation evidence packet — 2026-09-03

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

This is a read-only evidence capture for the proposed affiliation review. It records how the
current `Unattached` placeholder is used before any nullable-FK or team-type migration is designed.

## Exact live counts

### Placeholder school

`public.schools.school_id = 1835`:

| Field | Value |
| --- | --- |
| official_name | `Unattached` |
| city / state | NULL / NULL |
| division | NULL |
| active | true |
| teams | 2 |
| athletes | 48,124 |

The two dependent teams are `team_id = 3611` (`M`) and `team_id = 3612` (`F`). Both are active and
have no source URL. There are currently **zero** `public.athlete_team_seasons` rows linked to either
team, so this placeholder population is not represented by the time-aware affiliation bridge.

### People and source identity data

Among the 48,124 athletes with `school_id = 1835`:

- gender: 10,501 M; 6,495 F; 31,128 NULL;
- 3,419 have a TFRRS athlete ID;
- 1 has a TFRRS profile URL;
- 14,624 have an Athletic.net URL;
- 48,119 are active.

The gender distribution and source links show that this is a mixed source-resolved population, not a
single team roster that can safely be collapsed or deleted.

### Fact usage

Individual results whose athlete belongs to school 1835:

| Measure | Count |
| --- | ---: |
| `public.results` rows | 56,046 |
| distinct meets | 621 |
| distinct athletes with a result | 17,097 |
| distinct event types | 54 |

Environment breakdown for those results: 27,535 outdoor; 18,049 indoor; 10,462 NULL. The current
`results.season_code` is NULL for all 56,046 rows, so a future season/affiliation migration cannot
assume that field is sufficient to reconstruct history.

Across the whole live `athlete_team_seasons` bridge, 7,357 rows (5,655 distinct athletes) have a
historical team whose `teams.school_id` differs from the athlete’s current `school_id`; 120,000 rows
(87,002 athletes) agree. This is evidence that the bridge is already carrying historical affiliation
information that must not be overwritten when a person’s current school changes.

Relay usage for the two placeholder teams:

| Measure | Count |
| --- | ---: |
| `public.relay_results` rows | 21 |
| distinct meets | 19 |
| distinct teams | 2 |
| `public.relay_athletes` member rows | 38 |
| distinct relay athletes | 2 |
| distinct relay meets | 9 |

## What this proves

1. The mandatory `school_id` currently forces a very large and heterogeneous set of people into a
   fake organization.
2. The placeholder is referenced by tens of thousands of individual facts and relay facts; deleting
   the school or bulk-reassigning its athletes would be destructive.
3. The existing `athlete_team_seasons` bridge is not carrying this population, so simply “using the
   bridge” without a backfill would lose affiliation context rather than preserve it.
4. A safe change must preserve every athlete, result, relay result, relay member, source ID, and raw
   source label while introducing nullable/typed competition affiliations in parallel.
5. `season_code` cannot be the only historical key for this population because it is NULL on every
   observed individual result.

## Required next checks before implementation

- Trace other placeholder-like school/team labels (club, scholastic, international, and source
  unattached labels) with bounded, reviewed cohorts; do not classify by `division = 'Other'`.
- Identify all application writers/readers that assume `school_id` is mandatory.
- Add replacement team display/type fields and dual-read/dual-write behavior before relaxing the
  existing foreign-key nullability.
- Create an append-only before-image archive and a row-count/checksum validation plan for every
  deterministic move.
- Retire the `Unattached` school only after dependent facts have explicit replacement semantics and
  a rollback test confirms the original rows can be restored.

No production schema or data was changed for this packet.
