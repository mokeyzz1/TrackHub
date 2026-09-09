# PERF-01: workload-backed index and query-plan checkpoint

Status: complete on 2026-09-09. This is a read-only performance review; no index, table, or row
change was needed.

## Live catalog verification

- Application indexes: 110 in `public` and 42 in `ingest`; every one is `indisvalid=true` and
  `indisready=true`. Historical `archive` tables intentionally have no indexes because they are
  recovery before-images, not query surfaces.
- The retained canonical fact lookup index
  `public.idx_results_event_type_athlete_meet(event_type_id, athlete_id, meet_id)` is valid and
  ready (121 MB) and has been selected by the planner. The two linked-result uniqueness indexes
  are also valid and ready.
- The index counters are diagnostic only. They are not used as a deletion gate because the live
  server's observation window and reset history are not a proof of workload absence.

## Representative plans

The canonical result lookup for `(event_type_id, athlete_id, meet_id)` uses
`idx_results_event_type_athlete_meet` with all three values as index conditions. The
`teams_summary` read uses `teams_pkey`, dimension primary keys, and
`idx_athlete_team_seasons_team` before its distinct-athlete aggregate. No representative plan
showed a missing supporting index or an invalid index build.

## Reconciled prior workload decisions

`FOREIGN_KEY_INDEX_REVIEW_20260904.md` remains the authoritative workload packet for the 13
unindexed-FK notices: one measured result lookup index was retained, an unhelpful relay candidate
was removed, and the remaining candidates were held because they are tiny, non-selective,
write-only, empty, or already covered by a composite index. `UNUSED_INDEX_REVIEW_20260904.md`
records four safe concurrent removals and 18 candidates intentionally retained for a longer,
representative workload window. `RESULT_IDENTITY_REVIEW_20260904.md` records the two partial
unique result guards; no broader uniqueness index is safe until meet/source identity is resolved.

Those decisions remain consistent with today's catalog and plans. In particular, no standalone
`event_type_id` index or duplicate results/relay table is justified. Adding one would increase
write and storage cost without a measured read benefit.

## Preservation and rollback

No production rows, index definitions, constraints, or policies changed in this checkpoint.
Existing concurrent-index rollback scripts remain the recovery path for the earlier measured
index migrations. The next performance review should use a longer workload window after the
application's collegiate and source-reconciliation reads are stable.
