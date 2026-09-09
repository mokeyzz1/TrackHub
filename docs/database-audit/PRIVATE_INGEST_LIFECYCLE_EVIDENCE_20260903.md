# Private ingest lifecycle evidence — 2026-09-03

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

## Queue separation is justified by live state

### `ingest.recovery_queue` (meet-level)

- Rows: **2,573**.
- Statuses: 1,509 complete; 941 blocked; 99 partial; 24 queued.
- Coverage: 1,529 covered; 890 individual-only; 144 empty; 10 relay-only.
- Relay coverage: 1,522 present; 972 unknown; 79 absent.

### `ingest.event_recovery_queue` (event-level)

- Rows: **10,608**.
- Statuses: 8,578 blocked; 768 queued; 508 complete; 437 needs_review; 217 not_found; 98
  exhausted; 2 in_progress.
- It carries event-specific fields (`event_type_id`, `event_code`, individual/parent/leg counts,
  leases, source status, and retry state) that do not exist in the meet queue.
- Most rows have no `last_source_status` yet (8,215), while the remainder include event-specific
  outcomes such as `no_4x100_observations` and `source_no_numeric_4x100`.

These distributions and column contracts prove the queues are not duplicates. The meet queue tracks
whole-meet recovery and relay coverage; the event queue tracks a specific event and its source
attempt lifecycle. Keep them separate while the 4×100 work is paused.

## Evidence/provenance state

- `ingest.observations`: 156,385 rows; decisions are 46,600 quarantine, 44,514 pending, 35,566
  skip_duplicate, 29,675 insert, and 30 claim.
- `ingest.quarantine`: 9,648 rows; 4,912 open and 4,736 resolved.
- `ingest.source_links`: 41,214 rows; 41,197 linked and 17 quarantined.
- `ingest.source_records`: 54,518 rows; raw payload and source keys remain the provenance boundary.
- `ingest.runs`: 1,497 rows; 1,316 succeeded, 176 partial, 3 failed, and 2 running.
- `ingest.fact_cleanup_archive`: 138,911 append-only before-images keyed by operation/source row.

The private layer is therefore an active evidence system, not disposable staging. Cleanup must keep
its row data, status history, and archive keys intact.

## Safe disposition

Keep all private tables and current grants/RLS. Improve lifecycle documentation and retention before
considering any interface consolidation. Any queue migration must be a compatibility layer with
dual-read/dual-write verification, not a merge based on table names.

No private ingest row or policy was changed by this review.

## Queue contract checkpoint — 2026-09-04

The live queue schemas still demonstrate two different scopes. `ingest.recovery_queue` has 2,573
meet-level rows with required `meet_id`, coverage/relay-coverage state, whole-meet fact counts,
canonical-match evidence, and a single meet-level retry/status contract. Its current distribution
is 1,509 complete, 941 blocked, 99 partial, and 24 queued; the coverage states remain 1,529 covered,
890 individual-only, 144 empty, and 10 relay-only.

`ingest.event_recovery_queue` has 10,608 event-level rows with required `meet_id`, `event_type_id`,
canonical event code, individual/parent/numeric-parent/leg counts, leases, source candidates,
attempts, and event-specific source outcomes. Its current statuses remain 8,578 blocked, 768
queued, 508 complete, 437 needs_review, 217 not_found, 98 exhausted, and 2 in_progress. All rows
are canonically typed; 9,861 have individual work, 480 parent work, and 449 relay-leg work.

Both queue tables grant access only to `postgres` and `service_role`; no public role grants or RLS
policies expose them. The separate required keys and lifecycle fields confirm that these are not
duplicate tables and should not be merged by name. No queue row, policy, or grant was changed by
this checkpoint.
