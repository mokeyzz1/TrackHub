# Target model reconciliation — 2026-09-03

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

## Why this exists

`docs/reference/TARGET_SCHEMA_BLUEPRINT.md` is a useful north-star draft, but it was written
against an older database snapshot. This document reconciles that proposal with the current live
catalog so future cleanup decisions are based on facts rather than stale counts.

## Blueprint statements corrected by live evidence

| Older draft assumption | Current live evidence | Consequence |
| --- | --- | --- |
| Application model is 19 tables | `public` currently has 30 tables and 4 views; `ingest` has 10 tables | disposition must include archives, queues, and operational tables, not only the canonical dimensions |
| `conferences`, `regions`, and `external_ids` are empty | They contain 1,114, 27, and 356 rows respectively | preserve and evaluate their semantics; do not classify them as ghost tables |
| Result/relay meet FKs are absent | `results.meet_id`, `relay_results.meet_id`, and related FKs are validated | focus on nullable/linkage quality and identity policy, not re-adding already-present FKs |
| Relay RLS is missing | `relay_results` and `relay_athletes` have RLS and public-read policies | verify policy intent; do not duplicate security migrations |
| Only a small number of rows need reconciliation | canonical facts now exceed 3.4M results, 200K relay parents, and 450K relay legs | use bounded, resumable batches and archive before-images |

## Proposed target layers

### 1. Public canonical model

Keep `meets`, `schools`, `teams`, `athletes`, `athlete_team_seasons`, `event_types`,
`event_aliases`, `results`, `relay_results`, and `relay_athletes` as the canonical public data
model. Improve them by:

- treating numeric IDs and foreign keys as authoritative;
- retaining source/raw text only for provenance and display fallback;
- separating optional domain states (history, unattached, club, unresolved) from missing-by-error;
- adding uniqueness only after identity collisions are classified;
- aligning event, season, environment, round, and mark semantics across individual and relay facts;
- moving derived PR/ranking logic away from independently scraped fact rows.

### 2. Reference and classification model

Keep and clarify `divisions`, `regions`, `conferences`, `conference_memberships`, `external_ids`,
and event catalogs. These tables are not interchangeable:

- a school can have a division and region;
- a conference can span multiple regions and change over time;
- external IDs are source identity mappings, not canonical entity ownership;
- event aliases map source labels to canonical event types.

### 3. Private ingestion and evidence model

Keep `ingest.runs`, `source_records`, `observations`, `source_links`, `quarantine`, aliases,
recovery queues, and `fact_cleanup_archive` as private operational/evidence layers. Review whether
the two recovery queues can eventually share a common interface, but do not merge them merely because
their names overlap; their lifecycle and granularity differ.

### 4. Transitional and archive model

Treat `athlete_prs`, `live_results`, `events`, and the public backup tables as transitional or
archive surfaces. Their future disposition depends on code-reader migration, provenance retention,
and verified restore procedures. No retirement is safe solely because a table is empty or mostly
NULL.

## Improvements the target model must deliver

1. One authoritative meet identity and source-provenance bridge.
2. One canonical event/measure/environment model shared by results and relays.
3. Explicit season representation rather than multiple incompatible text conventions.
4. Source-aware athlete, school, and team identity with aliases instead of name-only matching.
5. Derived PRs and rankings from validated results, not a second inconsistent scraped fact store.
6. Transactional ingestion for meet provenance, facts, relay parents/legs, and status updates.
7. Private, append-only rollback evidence for every mutation.
8. Frontend reads by canonical IDs with pagination and no ignored filter arguments.
9. A migration chain that reproduces production without untracked SQL drift.
10. Security policies and grants that match the public/private layer boundaries.

## Current unresolved decisions

These are explicit owner decisions, not hidden assumptions:

- whether `events` remains a per-meet scheduling model or retires after its frontend reader is
  removed;
- when `athlete_prs` is retired in favor of the computed view;
- how to represent multi-event component performances;
- whether and how to canonicalize seasons and environments;
- how to model historical/unattached/club identities without forcing them into collegiate schools;
- whether public backup tables remain in `public` or move behind a private archive boundary;
- how to reconcile migration-history drift and out-of-band production operations.

No DDL or data mutation is proposed by this reconciliation document. It is the semantic target
against which the per-table cleanup plans will be checked.
