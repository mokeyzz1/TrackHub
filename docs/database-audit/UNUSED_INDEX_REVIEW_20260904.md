# Unused-index review — 2026-09-04

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

## Observation window and rule

The live PostgreSQL server started on 2026-09-01 at 19:26 UTC, so its index counters covered less
than three days when this review began. A zero `idx_scan` value in that short window is not enough
to prove an index is obsolete. Each of the 22 Supabase `unused_index` notices was therefore checked
against its definition, overlapping indexes, table lifecycle, current code, and `pg_stat_statements`.

## Removed concurrently

| Index | Prior size | Why removal is safe | Verified replacement plan |
| --- | ---: | --- | --- |
| `idx_results_meet_name (meet_name)` | 77 MB | Exact left-prefix duplicate of retained `idx_results_meet_name_date (meet_name, date)` | Both meet-name-only and meet-name-plus-date queries use `idx_results_meet_name_date`. |
| `idx_results_athlete_event (athlete_id, event_name)` | 80 MB | Zero observed scans and no current reader filters by athlete plus raw event name. Canonical event lookups use `event_type_id`. | Canonical lookups use `idx_results_event_type_athlete_meet`; athlete-only and legacy raw-event fallback retain `idx_results_athlete_id`. |
| `idx_external_ids_source (source)` | 16 KB | Left-prefix duplicate of the authoritative unique `(source, external_key)` identity index. | Source-only queries use `external_ids_source_external_key_key`. |
| `idx_external_ids_key (external_key)` | 16 KB | Source-free external keys are not valid identities; every repository lookup supplies the source. | Source-plus-key queries use `external_ids_source_external_key_key` with both keys as index conditions. |

The removed relations represented about 157 MB of index files before removal. Database-wide size is
not used as the reclamation assertion because concurrent application activity can grow other
relations during the comparison window.

## Retained after review

| Indexes | Reason retained |
| --- | --- |
| `ingest_team_aliases_name_idx`, `ingest_team_aliases_team_idx`, `ingest_athlete_aliases_target_idx` | Small, recently introduced identity-resolution indexes. The three-day window is not representative of periodic imports or identity reviews. |
| `ingest_observations_canonical_key_idx` | Supports canonical-key reconciliation on a growing 156k-row audit table; periodic recovery work is not continuous. |
| `idx_meets_tfrrs_id` | A selective source-identity lookup for ingestion. Rare use is expected and loss would force a 13k-row meet scan. |
| `idx_schools_state`, `idx_schools_region`, `idx_schools_active` | Small filtering/relationship indexes on a 1,786-row dimension. Keep through the frontend affiliation migration and reassess with a longer window. |
| `idx_teams_active`, `idx_athletes_active` | Partial active-entity indexes. Their selectivity needs a longer representative read window before removal. |
| `idx_push_tokens_active` | Supports the periodic notification send path; a three-day no-send window does not prove it is obsolete. |
| `idx_live_results_final`, `idx_live_results_date`, `idx_live_results_scraped_at`, `idx_live_results_processed` | Belong to the paused/legacy live-results subsystem. Keep or remove with the table's lifecycle decision, not piecemeal. |
| `idx_events_meet_id`, `idx_events_status` | The `events` table is empty and pending retirement or redesign. Remove these only when the table decision is executed. |
| `idx_conference_memberships_conference_id` | The membership table is empty but retained for historical conference membership; this is its reverse conference lookup and FK-support index. |

## Result

- Supabase unused-index notices: 22 before, 18 after.
- Invalid or not-ready indexes after cleanup: 0.
- Security-advisor findings: unchanged; no new exposure was introduced.
- Migration `20260904135909_remove_superseded_lookup_indexes` is recorded in production history.
- The emergency rollback recreates all four indexes concurrently.
