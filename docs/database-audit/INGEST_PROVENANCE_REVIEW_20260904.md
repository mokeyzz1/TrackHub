# Private ingest and provenance review — 2026-09-04

## Scope

This is a read-only production review of all ten tables in the private `ingest` schema. It covers
source staging, normalized observations, canonical links, queues, aliases, quarantine, run
lifecycle, and before-image cleanup archives. The reproducible query set is
`docs/database-audit/ingest_provenance_scan.sql`. No rows, tables, columns, policies, grants, or
constraints were changed.

## Live table inventory

| Table | Exact rows | Role |
| --- | ---: | --- |
| `source_records` | 54,518 | Raw source records and payloads |
| `observations` | 156,385 | Normalized candidate facts and decisions |
| `source_links` | 41,214 | One source-record-to-canonical-fact link |
| `quarantine` | 9,648 | Review state for ambiguous observations |
| `runs` | 1,497 | Ingestion run lifecycle and metrics |
| `fact_cleanup_archive` | 140,207 | Before-images for reviewed cleanup writes |
| `recovery_queue` | 2,573 | Meet-level coverage/recovery inventory |
| `event_recovery_queue` | 10,608 | Paused meet+event 4x100 control-plane queue |
| `athlete_aliases` | 1,339 | Verified source-athlete aliases |
| `team_aliases` | 114 | Verified source-team aliases |

These are not duplicate copies of one fact table. Each has a distinct grain and lifecycle:
`source_records` preserves what a source emitted; `observations` records the normalized candidate
and decision; `source_links` records which canonical result or relay was actually linked;
`quarantine` holds unresolved rows; and `fact_cleanup_archive` preserves before-images. Aliases,
run metadata, and queues are control-plane state rather than public results.

## Source and observation evidence

The source-record table contains 54,518 unique `(source, source_record_key)` rows:

| Source | Records | Meet keys | Event keys | Missing source URL |
| --- | ---: | ---: | ---: | ---: |
| athletic.net | 27,734 | 182 | 134 | 27,734 |
| leonetiming | 357 | 5 | 7 | 0 |
| milesplit | 300 | 5 | 9 | 0 |
| pt_timing | 173 | 3 | 4 | 0 |
| tfrrs | 24,318 | 267 | 693 | 2,947 |
| trackscoreboard | 1,636 | 2 | 17 | 0 |

`payload_hash` is currently NULL for all source records. The writer contract already accepts it,
so this is an instrumentation/enrichment gap, not a reason to drop the column or create a second
deduplication table. Source keys remain unique and source payloads remain preserved.

There are 13,304 source records without a `source_links` row and zero orphan link rows. This is a
coverage/promotion gap (raw evidence not yet linked), not referential corruption. Existing links
are either `linked` (41,197 rows) or `quarantined` (17 rows); no link is both an individual and a
relay target.

Observations retain complete run and source-record references: all 156,385 rows have both foreign
keys, 44,514 are still `pending`, and 111,871 have a terminal/intermediate decision. Inserted
individual and relay observations have their corresponding canonical target populated. The
remaining quarantine workload is 4,912 open rows and 4,736 resolved rows; `missing_athlete` is the
largest reason family and is intentionally retained for review.

## Aliases and identity controls

All 1,339 athlete aliases and 114 team aliases are active, verified aliases. They have zero orphan
targets and zero duplicate source-key groups. Their check constraints limit sources, gender, match
method, and status; target foreign keys use `ON DELETE RESTRICT`. These tables complement the
public `external_ids` portability map: the private aliases are reviewed resolver inputs, while the
public map is the cross-source identity surface. Do not merge or split them by name.

## Queue and run contracts

`recovery_queue` is the general meet-level queue (2,573 rows; statuses include 1,509 complete, 99
partial, 941 blocked, and 24 queued). It tracks whether individual and relay coverage exists.
`event_recovery_queue` is a different grain with a required `event_type_id` and a check that
`event_code = '4x100m'`; it is the paused 4x100 workstream and currently contains 508 complete,
8,578 blocked, 98 exhausted, 437 needs-review, 217 not-found, 768 queued, and 2 in-progress rows.
Keeping these queues separate is correct: combining them would lose the event-level identity and
would blur the paused product scope with general meet recovery. No queue rows were changed.

The run ledger has 1,497 rows: 1,316 succeeded, 176 partial, 3 failed, and 2 still marked
`running`. Both running rows are old `pt_timing` dry runs for the paused 4x100 scope (started
2026-08-31). They are recorded as an operator follow-up, not silently marked complete or failed.

The cleanup archive contains 140,207 before-images across the reviewed identity, affiliation,
conference, timing-platform, and relay operations. Its unique `(operation_key, source_table,
source_pk)` key prevents duplicate archive entries and preserves rollback evidence.

## Access boundary and constraints

- All ten ingest tables have RLS enabled and no public policies. `anon` and `authenticated` have no
  `USAGE` on the schema, so the empty policy set is default-deny rather than an accidental public
  surface.
- `service_role` has schema usage and explicit operational table/function grants; `postgres` is
  the owner/operator. The ingest writers are not browser DML paths.
- Foreign keys use restrictive deletes for evidence and canonical links; queue run pointers use
  `SET NULL` so run-history cleanup cannot strand queue rows. Queue, observation, alias, and source
  keys are protected by primary/unique/check constraints.
- The trigger helper `clear_recovery_queue_error_on_complete()` has no explicit ACL (therefore
  PostgreSQL's default PUBLIC EXECUTE), while the schema itself is inaccessible to public roles and
  all operational functions are explicitly limited to `service_role`/`postgres`. This has no
  reachable browser write path, but it is a small ACL-hygiene item to review in the next security
  wave; no privilege was changed during this audit.

## Design conclusion

The private ingest layer is coherent and already provides the missing preservation boundary. The
two queues, source/observation/link stages, aliases, quarantine, run ledger, and cleanup archive
should remain separate because they represent different grains and responsibilities. Do not add a
replacement provenance table, merge the queues, delete unlinked source records, or purge open
quarantine/history rows. Future cleanup should address the 13,304 unlinked evidence rows,
payload-hash instrumentation, stale paused run state, and the trigger-helper ACL only through
source-backed, reversible changes.

## Next gate

Move to the bounded meet/source identity review already listed in the decision register. After that,
perform the separate ACL/function-boundary hardening review; neither step requires a new table or
public schema exposure.
