# Canonical fact semantics review — 2026-09-03

## Current fact posture

The live canonical tables currently contain:

| Table | Rows | Key nullable signals |
| --- | ---: | --- |
| `public.results` | 3,419,178 | 562,033 without `meet_id`; 401,563 without `team_id`; 422,761 without `date`; 258,521 without `environment` |
| `public.relay_results` | 200,736 | 22,865 without `meet_id`; 31,344 without `team_id`; 11,153 without `date` |
| `public.relay_athletes` | 450,685 | 3,359 without `athlete_id` |

All canonical fact rows have a valid `event_type_id` when populated, and the live FK constraints
for athlete, team, meet, event type, relay parent, and relay legs are validated. The remaining
problem is semantic interpretation of nullable links and legacy copied text fields.

## Event and measure model

`event_types` currently contains 67 canonical types and `event_aliases` contains 1,329 source-label
mappings. This is the right direction, but the fact tables still carry raw `event_name` text and
legacy `event_id` values. The target model should:

- use `event_type_id` as the authoritative event identity;
- retain raw event text only as source provenance/display fallback;
- define measure (`time`, `distance`, `points`) and environment consistently for results and relays;
- make unknown aliases enter an explicit review path rather than silently creating new semantics;
- model multi-event components separately from aggregate points before PR/ranking logic is trusted.

## Linkage states that must remain explicit

`meet_id`, `team_id`, `date`, and `environment` cannot all be made required immediately. Their NULL
states include legitimate history, unattached performances, source limitations, and unresolved
identity. The cleanup plan must partition these states by source and provenance, repair only
deterministic cases, and quarantine ambiguity.

## Legacy and derived fields

- `results.season_code`, `results.meet_location`, and `results.total_competitors` are effectively
  unused and should be retired only after code readers move.
- `results.event_id` and `relay_results.event_id` are legacy/superseded by `event_type_id`; they
  still have readers and require a compatibility migration.
- `results.mark_seconds`, `mark_meters`, `mark_feet`, `wind`, and `mark_raw` represent different
  source/measure layers. Their relationship must be documented before tightening nullability or
  deriving values.
- `v_athlete_prs` is derived from canonical results, but its points logic extracts digits from
  `mark_raw`; component-like marks can be misinterpreted as aggregate points.
- `athlete_prs` remains a separate large scraped table and should not be deleted until all readers
  use a validated derived view/materialized strategy.

## Relay-specific semantics

Relay parents and legs are separate canonical facts. A relay parent may have no resolved team, and a
leg may have no resolved athlete, without being safe to delete. The target model must preserve raw
source labels and lineup evidence while distinguishing:

- a legitimate open/unattached relay;
- an unresolved team or athlete identity;
- a malformed or incomplete source row;
- a duplicate parent/leg already represented canonically.

## Required target-model decisions

1. Define explicit season and environment dimensions.
2. Define a round policy for cross-source identity and duplicate detection.
3. Define source-aware meet/result identity keys that do not rely on copied text alone.
4. Define how unattached, club, scholastic, international, and collegiate identities coexist.
5. Define multi-event component instances and scoring context.
6. Define when derived PR/ranking data is recomputed and how historical results are versioned.

No fact rows were modified by this review.

## Canonical-fact invariant checkpoint — 2026-09-04

The post-cleanup recheck confirms the nullable-link populations are still present and the
canonical event links remain complete:

- `results` remains 3,419,178 rows: 0 NULL `event_type_id`, 562,033 NULL `meet_id`, and 401,563
  NULL `team_id`.
- `relay_results` remains 200,736 rows: 0 NULL `event_type_id`, 22,865 NULL `meet_id`, 31,344
  NULL `team_id`, and 327 NULL `mark_raw`.
- `relay_athletes` remains 450,685 rows: 0 NULL `relay_result_id` and 3,359 NULL `athlete_id`.

The NULL links are not converted to `NOT NULL`: they still represent history, open/unattached
participation, or unresolved source identity. The exact event-type invariant is safe, while the
meet/team/athlete populations remain semantic review queues. The derived PR-view points parser was
corrected separately to use supplied aggregate tokens; this checkpoint does not rewrite fact rows.
