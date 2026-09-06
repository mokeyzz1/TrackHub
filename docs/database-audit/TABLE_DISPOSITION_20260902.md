# Table disposition report — 2026-09-02

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

This is a planning classification, not a deletion list. Every row remains in place until a
separate dry-run and an explicitly approved, reversible migration exists.

## `public` tables

| Table | Exact rows | Disposition | Evidence / next gate |
|---|---:|---|---|
| `results` | 3,507,218 | **Canonical / active** | Main individual-result fact table. Keep. Repair/link nullable meet/team rows by source batch; do not delete in place. |
| `relay_results` | 203,826 | **Canonical / active** | Main relay fact table. Keep. Review 22,865 null-meet and 31,407 null-team rows. |
| `relay_athletes` | 462,728 | **Canonical / active** | Relay-leg fact table with cascade FK. Keep. Resolve 3,359 null-athlete legs through provenance or explicitly retain as unknown. |
| `athletes` | 152,204 | **Canonical / active** | Identity dimension. Keep. Profile fields are intentionally reserved; identity collision work must be mapping-based. |
| `schools` | 1,867 | **Canonical / active** | School dimension. Keep. Review 83 normalized-name collision groups; never merge by name alone. |
| `teams` | 3,677 | **Canonical / active** | `(school_id, gender)` uniqueness guard exists. Keep; empty coach/athletic.net fields are reserved/legacy. |
| `meets` | 12,878 | **Canonical / active** | Meet dimension. Keep. Review 10 date mismatches and future/upcoming rows separately. |
| `event_types` | 67 | **Canonical / active** | Canonical event catalog and FK target. Keep. |
| `event_aliases` | 1,329 | **Canonical / active** | Import normalization map. Keep; 46 `unmapped_events` are its review feed. |
| `athlete_team_seasons` | 127,357 | **Canonical / active** | Roster/history bridge. Keep. `jersey_number` is currently unused/null but not safe to drop while code/types read it. |
| `divisions` | 6 | **Canonical dimension** | Populated reference dimension. Keep and use for migration away from text division fields. |
| `conferences` | 1,114 | **Canonical dimension** | Populated; region text is mostly null/semantically wrong, but the dimension is useful. Keep and normalize. |
| `regions` | 27 | **Canonical dimension** | Populated reference dimension. Keep; reconcile NCAA region coverage before expanding. |
| `conference_memberships` | 0 | **Reserved / inactive** | Empty M:N realignment history. Keep for now because the target model calls for it; populate only when the feature is real. |
| `external_ids` | 15 | **Active but underused** | Correct home for multi-source IDs, currently sparse. Keep; future imports should adopt it instead of scattering IDs. |
| `athlete_prs` | 475,527 | **Transitional legacy** | Scraped/incomplete PR facts; 467,001 `set_at` and 466,969 `meet_name` values null. Keep until all readers use computed PRs, then retire through a gated migration. |
| `events` | 0 | **Retirement candidate** | Empty per-meet schedule table; frontend still reads it. Remove only after code reader migration and generated-type update. |
| `live_results` | 48 | **Operational but stale** | All 48 are unprocessed and dated 2025-12-02. Isolate/document first; do not assume empty or delete. |
| `unmapped_events` | 46 | **Active review log** | Service-role-only import exception log. Keep until rows are resolved or explicitly rejected. |
| `push_tokens` | 1 | **Active service table** | Service-role-only storage used by push registration. Keep. |
| `waitlist` | 1 | **Active feature table** | Public insert policy has input validation. Keep. |
| `athletes_empty_backup` | 12,518 | **Intentional archive** | DUP-4 rollback archive; service-role-only and no PK by design. Retain until archive-retention decision. |
| `relay_results_d3_backup` | 40,935 | **Intentional archive — reconciled** | Five operations now documented in `RECOVERY.md`: 674 + 13,716 + 26,494 + 44 + 7 relay parents. Zero canonical overlap. |
| `relay_athletes_d3_backup` | 89,085 | **Intentional archive — reconciled** | Complete legs for the five relay archive operations; every leg has an archived parent and zero canonical overlap. |
| `relay_results_20260819_backup` | 1 | **Intentional archive** | Cross-source duplicate relay rollback row. Retain with its recovery note. |
| `results_d1_backup` | 23,766 | **Intentional archive** | DUP-1 copied-meet rollback archive. Retain until the copied-meet decision is closed. |
| `results_d2_backup` | 453,737 | **Intentional archive** | DUP-2/DUP-5 rollback archive. Retain; it is the main historical safety net. |
| `results_xsource_20260819_backup` | 1,252 | **Intentional archive** | Cross-source deleted-copy rollback archive. Retain with source-link audit. |
| `results_accidental_import_20260819_backup` | 31 | **Intentional archive** | Known accidental-import rollback archive. Retain with the existing recovery instructions. |
| `results_athlete_merge_backup` | 11 | **Intentional archive / security exception** | Merge rollback archive. It is the only app table with RLS disabled, but ACLs are service-role-only. Review whether to enable RLS for consistency. |

## `ingest` tables

| Table | Exact rows | Disposition | Evidence / next gate |
|---|---:|---|---|
| `source_records` | 54,518 | **Active provenance** | Immutable source payload records. Keep. `payload_hash` is null in all rows; decide whether to populate or retire the unused field. |
| `source_links` | 41,214 | **Active provenance** | Source-to-canonical links. Keep; reconcile 87.63% null `relay_result_id` against entity type (many are individual-result links). |
| `observations` | 156,385 | **Active provenance/review** | Normalized observations and decisions. Keep. 91,114 have no canonical target; reconcile with quarantine/decision status before retention. |
| `quarantine` | 9,648 | **Active review queue** | 4,895 open and 4,753 resolved rows by current status distribution. Keep as an audit trail; resolve/reject open items explicitly. |
| `runs` | 1,497 | **Active audit trail** | Ingestion run history. Keep. `code_revision` is null in every row; either populate going forward or document as reserved. |
| `event_recovery_queue` | 10,533 | **Active recovery queue** | Canonical event-level queue and current 4x100 reconciliation home. Keep; pause/retire individual scopes, not the table. |
| `recovery_queue` | 2,573 | **Legacy but active** | Older meet-level recovery queue with partial/complete states and relay coverage metadata. Keep until all consumers migrate to the event queue. |
| `fact_cleanup_archive` | 344 | **Append-only cleanup archive** | Existing reversible mutation ledger. Reuse for future approved repairs; do not create parallel cleanup tables. |
| `athlete_aliases` | 998 | **Active identity mapping** | Source athlete aliases with validated methods/status. Keep. |
| `team_aliases` | 114 | **Active identity mapping** | Source team aliases with validated methods/status. Keep. |

## Views and security surface

| Object | Disposition |
|---|---|
| `public.v_athlete_prs` | Preferred computed-PR interface; keep and migrate readers from scraped `athlete_prs`. |
| `public.schools_full` / `public.teams_summary` | Useful read models; keep. Both use `security_invoker` and are not publicly granted in the current ACL surface. |
| `public.unprocessed_live_results` | Keep while `live_results` exists; its stale 48-row population needs an operational decision. |
| Public RLS | 23 explicit policies; app reads are anon/authenticated, writes are service-role-only except validated waitlist inserts. |
| Ingest RLS/ACL | All 10 ingest tables have RLS enabled, zero policies, and no anon/authenticated/PUBLIC table grants; service-role access is intentional. |
| Security-definer routines | Only `public.register_push_token(text,text)` is security-definer. It fixes `search_path` and validates inputs; retain, but include it in future security regression tests. |

## Recommended disposition order

1. Produce dry-run mappings for the 10 date mismatches, school collision groups, and unlinked result batches.
2. Migrate application readers from `athlete_prs`/legacy text columns to canonical IDs or computed views.
3. Move the old `recovery_queue` consumers to `event_recovery_queue` and prove scope equivalence.
4. Only after code and data proofs exist, retire empty/legacy objects in separate reversible migrations.

No table is marked “safe to drop now.”
