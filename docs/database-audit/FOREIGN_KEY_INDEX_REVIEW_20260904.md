# Foreign-key index review — 2026-09-04

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

## Decision rule

The Supabase `unindexed_foreign_keys` lint is an informational candidate list, not proof that every
foreign key needs a standalone index. PostgreSQL documents why: referencing-column indexes can
accelerate parent deletes and updates, but are not created automatically because they are not always
needed and the useful key shape depends on the workload.

This review checked all 13 live notices against table size, null fraction, cardinality, existing
indexes, repository queries, `pg_stat_statements`, and representative `EXPLAIN (ANALYZE, BUFFERS)`
plans. No row data was changed.

## Kept change

| Foreign key | Decision | Evidence |
| --- | --- | --- |
| `results.event_type_id` | Add `idx_results_event_type_athlete_meet (event_type_id, athlete_id, meet_id)` | The canonical fact writer's measured results scan fell from about 1,520 ms to 124 ms and returned the same 184 rows. The full representative query fell from 1.81 s to 0.42 s. The index is valid, ready, 121 MB, used by the planner, and also covers the foreign key. |

This is intentionally not an event-type-only index. An earlier live test of a broad
`event_type_id`-leading lookup without a selective actor key made a leaderboard scan slower. The
retained key adds `athlete_id` and `meet_id`, matching the canonical writer's lookup shape.
The timing comparison was observed on successive production reads and therefore includes cache
effects; the plan evidence is the stronger result: the new index was selected and reduced rows
discarded by the fact scan from 11,123 to 999.

## Reviewed notices intentionally left without new indexes

| Foreign key | Live shape / workload | Decision |
| --- | --- | --- |
| `relay_results.event_type_id` | About 200,736 rows and only 10 event IDs. The tested three-column candidate was 5 MB, but PostgreSQL continued to use the existing `meet_id` and `team_id` indexes. | Candidate removed concurrently; do not pay write cost for an index the measured query plan rejected. |
| `event_recovery_queue.event_type_id` | 10,608 rows, one distinct value. Operational queries scope by `scope_key`, status, meet, or job ID; existing composite indexes cover those access paths. | No index: a one-value key is non-selective. |
| `event_recovery_queue.meet_id` | 10,608 rows, 8,844 meets. Normal joins also constrain `scope_key` and use the existing unique `(scope_key, meet_id, event_type_id)` or claim index. | No redundant standalone index while current plans use the existing composites. |
| `event_recovery_queue.last_run_id` | 861 non-null values; most rows are null. Current reconciliation queries pair it with meet/status/scope predicates or use observation run indexes. | Hold until an actual plan shows this column is the bottleneck. |
| `recovery_queue.relay_probe_run_id` | 127 non-null values; 95% null. The reconcile function writes this value but selects queue rows by `meet_id` and status. | No index for a write-only audit link. |
| `event_aliases.event_type_id` | 1,329 rows. Runtime resolution uses the `raw_name` primary key; catalog loads read the tiny table. | No reverse-lookup index without a reverse-lookup workload. |
| `external_ids.athlete_id` | 356 populated rows. Parent-delete cascade checks are currently trivial, and runtime identity lookup uses `(source, external_key)`. | Revisit as `external_ids` adoption grows; no current plan benefit. |
| `external_ids.school_id` | Zero populated values. | Do not index an empty linkage. |
| `external_ids.team_id` | Zero populated values. | Do not index an empty linkage. |
| `live_results.athlete_id` | Zero populated values across 48 legacy live rows. | Do not index an empty linkage before the live-results lifecycle is redesigned. |
| `live_results.team_id` | Zero populated values across 48 legacy live rows. | Same as `live_results.athlete_id`. |
| `regions.division_id` | 26 populated values across 27 rows and three divisions. | A sequential scan of this tiny dimension is cheaper and simpler. |

## Production application and rollback

- `20260904094906_add_canonical_fact_lookup_indexes.sql` built both measured candidates with
  `CREATE INDEX CONCURRENTLY` so production writes remained available.
- `20260904095259_drop_unhelpful_relay_fact_lookup_index.sql` removed the relay candidate after its
  validation plan did not use it.
- Both versions are recorded in `supabase_migrations.schema_migrations`.
- Emergency rollback scripts are stored beside this report.

Post-application verification found zero invalid indexes, zero active index builds, unchanged fact
counts (`results` 3,419,178; `relay_results` 200,736), and no new security-advisor findings.
