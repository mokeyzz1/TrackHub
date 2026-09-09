# MODEL-01 semantic model review — 2026-09-05

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md). This report
> closes the semantic-review evidence gate for MODEL-01; it is not a new work queue.

## Outcome

MODEL-01 is complete for its defined review scope: every application table and view, every
application column, every touching application foreign key, and every view dependency has a
recorded purpose, preserve/improve/retire disposition, observed value-shape evidence, and
repository reader/writer mapping. No table or column was deleted, renamed, rewritten, or
migrated during this review.

The result is a decision record, not a claim that every downstream improvement is already
implemented. Identity constraints, API relationship behavior, ingestion corrections, security
policy review, and performance work remain in their dependent checklist items.

## Scope and verification

| Area | Evidence | Result |
|---|---|---|
| Relations | Live catalog plus `model_review_20260905.json` | 31 public/ingest tables and four public views |
| Columns | Live catalog plus `model_review_20260905.json` | 404 application columns (359 table, 45 view) |
| Relationships | Live catalog plus `model_review_20260905.json` | 52 declared FK edges, 58 view-column dependencies; the broader FK recheck covered 75 and found no dangling references |
| Actual values | `column_profile_20260905.json` plus live `pg_stats` | Exact row/null/empty counts for all 359 table columns; bounded domain observations recorded below |
| Readers/writers | Static scan of 593 source files under `frontend/`, `backend/`, `scrapers/`, `migrations/`, and `lib/`, followed by spot checks of canonical readers/writers | Every relation has a recorded consumer classification, including intentional no-direct-writer/reference and archive cases |
| Safety | Read-only SQL and repository inspection | No live DDL, DML, queue execution, or public-result change |

The static scan is evidence of repository references, not proof of every dynamically generated SQL
consumer or external client. Such unknowns are explicitly retained as downstream verification
work rather than silently treated as “no consumer.”

## Observed table value shapes

Counts below are exact per-table totals from the aggregate profile. “All-null” and “empty” are
review signals, not deletion recommendations. Views are counted separately after the table scan.

| Relation | Rows | Columns | All-null columns | Empty-string columns |
|---|---:|---:|---|---|
| `ingest.athlete_aliases` | 1339 | 12 | — | — |
| `ingest.event_recovery_queue` | 10608 | 25 | — | — |
| `ingest.fact_cleanup_archive` | 140209 | 6 | — | — |
| `ingest.observations` | 156385 | 28 | `source_snapshot_hash` | — |
| `ingest.quarantine` | 9648 | 7 | — | — |
| `ingest.recovery_queue` | 2573 | 24 | — | — |
| `ingest.runs` | 1497 | 12 | `code_revision` | — |
| `ingest.source_links` | 41214 | 7 | — | — |
| `ingest.source_record_versions` | 0 | 7 | — | — |
| `ingest.source_records` | 54518 | 10 | `payload_hash` | — |
| `ingest.team_aliases` | 114 | 14 | — | — |
| `public.athlete_prs` | 475523 | 11 | — | — |
| `public.athlete_team_seasons` | 127357 | 9 | `jersey_number` | `year_in_school:11920` |
| `public.athletes` | 151537 | 19 | `bio`, `grad_year`, `high_school`, `hometown`, `primary_events`, `profile_image_url` | `class_year:11746` |
| `public.conference_memberships` | 0 | 6 | — | — |
| `public.conferences` | 118 | 9 | — | — |
| `public.divisions` | 11 | 5 | — | — |
| `public.event_aliases` | 1329 | 2 | — | — |
| `public.event_types` | 67 | 5 | — | — |
| `public.external_ids` | 356 | 12 | `conference_id`, `school_id`, `team_id` | — |
| `public.live_results` | 48 | 21 | `athlete_id`, `meet_id`, `team_id`, `team_name` | — |
| `public.meets` | 12978 | 22 | `wa_results_url` | `location:1` |
| `public.push_tokens` | 1 | 5 | — | — |
| `public.regions` | 27 | 4 | — | — |
| `public.relay_athletes` | 450685 | 7 | — | — |
| `public.relay_results` | 200736 | 13 | — | — |
| `public.results` | 3419178 | 23 | `season_code`, `total_competitors` | — |
| `public.schools` | 1786 | 16 | `ncaa_region` | — |
| `public.teams` | 3516 | 11 | `athletic_net_url`, `coach_name` | — |
| `public.unmapped_events` | 46 | 3 | — | — |
| `public.waitlist` | 1 | 4 | — | — |
| `public.schools_full` (view) | 1786 | — | — | — |
| `public.teams_summary` (view) | 3516 | — | — | — |
| `public.v_athlete_prs` (view) | 849385 | — | — | — |
| `public.unprocessed_live_results` (view) | 48 | — | — | — |

Notable observed shapes requiring preservation or explicit follow-up:

- `results` contains 3,419,178 rows; 562,033 have no `meet_id` and 401,563 have no
  `team_id`. Those are unresolved historical attribution cases, not permission to guess or
  delete rows.
- `observations.source_snapshot_hash` is NULL for all 156,385 observations, and
  `source_record_versions` is empty. Unknown legacy evidence stays unknown; it is not backfilled
  from a newer payload.
- `runs.code_revision` is NULL for all 1,497 runs. Preserve the run history and improve future
  provenance capture.
- `athletes` has six entirely NULL profile fields, `teams` has two entirely NULL optional
  fields, and `meets.wa_results_url` is entirely NULL. These are optional/deferred or
  provider-specific fields, not automatic retirement candidates.
- `conference_memberships` and `source_record_versions` are currently empty but structurally
  referenced; emptiness does not make either table redundant.

## Observed domain values

These are bounded, non-sensitive domain observations from live statistics and catalog checks.
They confirm the shape used by the recorded column decisions; they are not exhaustive value dumps.

| Column | Observed values |
|---|---|
| `event_types.measure` | time, distance, points |
| `event_types.environment_scope` | both, indoor_only, outdoor_only, xc |
| `results.environment` | indoor, outdoor, xc |
| `results.is_pr` | true, false |
| `results.is_season_best` | false only in sampled stats |
| `meets.status` | completed, upcoming |
| `meets.results_status` | pending, missing_tfrrs_url, imported, no_results_at_source, tfrrs_available |
| `observations.entity_type` | individual_result, relay_leg, relay_result |
| `observations.decision` | quarantine, pending, skip_duplicate, insert, claim |
| `observations.measure` | time, distance, points, unknown |
| `observations.round` | Finals, Preliminaries, Semifinals |
| `runs.status` | succeeded, partial, failed, running |
| `runs.mode` | dry_run, commit |
| `recovery_queue.coverage_status` | covered, individual_only, empty, relay_only |
| `recovery_queue.relay_coverage_status` | present, unknown, absent |
| `event_recovery_queue.status` | blocked, queued, needs_review, complete, not_found, exhausted, in_progress |
| `athlete_team_seasons.season_code` | 2024-2025, 2025-2026 |
| `athlete_team_seasons.year_in_school` | FR, SO, JR, SR, RS, empty string |
| `athletes.gender` | M, F |
| `teams.gender` | M, F |
| `relay_athletes.leg_order` | 1–4 |
| `relay_results.round` | Finals, Preliminaries, Heat 1–8 |
| `athlete_prs.season` | all, indoor, outdoor, xc |
| `external_ids.source` | tfrrs, athletic_net, directathletics |

The existing check constraints remain the authoritative allowed-domain boundary. In particular,
status codes (DNS, DNF, DQ, FS, SCR, NT), relay leg order, multi-event points, and unknown
affiliation states remain valid source facts and are not cleanup targets.

## Reader and writer coverage

The table below records the source-reference inventory. Counts are files containing a relation
reference after excluding documentation, dependencies, generated builds, and logs. Example paths
are representative, not an exhaustive call graph.

| Relation | Referenced source files | Reader examples | Writer examples |
|---|---:|---|---|
| `public.regions` | 10 | `backend/server/src/routes.ts`, `backend/supabase/migrations/20241201000000_initial_schema.sql` | `backend/supabase/migrations/20241201000000_initial_schema.sql` |
| `public.conferences` | 12 | `backend/server/src/routes.ts`, `backend/supabase/migrations/20241201000000_initial_schema.sql` | `backend/supabase/migrations/20241201000000_initial_schema.sql` |
| `public.schools` | 68 | `frontend/app/search.tsx`, `frontend/hooks/useSchoolSearch.ts`, `frontend/hooks/useSchools.ts` | `backend/supabase/migrations/20241201000000_initial_schema.sql`, `scrapers/athletic-net/analyze-school-variations.js`, `scrapers/shared/ingestion_postgres.integration.test.js` |
| `public.conference_memberships` | 5 | `backend/supabase/migrations/20241201000000_initial_schema.sql` | `backend/supabase/migrations/20241201000000_initial_schema.sql` |
| `public.teams` | 84 | `frontend/services/database-supabase.ts`, `backend/scripts/create-test-data.js`, `backend/scripts/scrape_meet_details.js` | `backend/scripts/create_live_results_table.js`, `backend/supabase/migrations/20241201000000_initial_schema.sql`, `backend/supabase/migrations/20241202000000_live_results.sql` |
| `public.athletes` | 175 | `frontend/app/(tabs)/athletes.tsx`, `frontend/app/athlete/[id].tsx`, `frontend/app/compare-athletes.tsx` | `backend/scripts/create-test-data.js`, `backend/scripts/create_live_results_table.js`, `backend/supabase/migrations/20241201000000_initial_schema.sql` |
| `public.athlete_team_seasons` | 14 | `backend/supabase/migrations/20241201000000_initial_schema.sql`, `scrapers/athletic-net/merge_reviewed_athlete.js`, `scrapers/athletic-net/promote_reviewed_directathletics_identity.js` | `backend/supabase/migrations/20241201000000_initial_schema.sql`, `scrapers/athletic-net/split_reviewed_athlete.js`, `scrapers/shared/ingestion_postgres.integration.test.js` |
| `public.results` | 262 | `frontend/app/(tabs)/index.tsx`, `frontend/app/(tabs)/meets.tsx`, `frontend/app/event-results.tsx` | `backend/scripts/create-test-data.js`, `backend/scripts/create_live_results_table.js`, `backend/scripts/scrape_meet_details.js` |
| `public.external_ids` | 15 | `backend/supabase/migrations/20241201000000_initial_schema.sql`, `scrapers/athletic-net/merge_reviewed_athlete.js`, `scrapers/athletic-net/promote_reviewed_directathletics_history_identity.js` | `backend/supabase/migrations/20241201000000_initial_schema.sql`, `scrapers/athletic-net/promote_reviewed_directathletics_history_identity.js`, `scrapers/athletic-net/promote_reviewed_directathletics_identity.js` |
| `public.live_results` | 34 | `frontend/hooks/useLiveResults.ts`, `frontend/services/database-supabase.ts`, `backend/scripts/check_live_results.js` | `backend/scripts/create_live_results_table.js`, `backend/scripts/scrape_meet_details.js`, `backend/supabase/migrations/20241202000000_live_results.sql` |
| `public.meets` | 170 | `frontend/app/(tabs)/community.tsx`, `frontend/app/(tabs)/index.tsx`, `frontend/app/(tabs)/meets.tsx` | `frontend/components/ui/SportsUIExamples.tsx`, `backend/scripts/create_meets_tables_simple.js`, `backend/scripts/create_test_meet.js` |
| `public.waitlist` | 4 | `frontend/app/(tabs)/community.tsx`, `frontend/services/database-supabase.ts`, `scrapers/shared/ingestion_postgres.integration.test.js` | `scrapers/shared/ingestion_postgres.integration.test.js` |
| `public.athlete_prs` | 21 | `frontend/services/database-supabase.ts`, `scrapers/athletic-net/backfill_reviewed_athlete_prs.js`, `scrapers/athletic-net/merge_reviewed_athlete.js` | `scrapers/athletic-net/backfill_reviewed_athlete_prs.js`, `scrapers/tfrrs/setup-prs-table.sql`, `migrations/20260819_sibling_table_gaps.sql` |
| `public.relay_results` | 34 | `frontend/services/database-supabase.ts`, `scrapers/athletic-net/backfill_relays.js`, `scrapers/athletic-net/import_meet_results.js` | `scrapers/athletic-net/import_meet_results.js`, `scrapers/backfill-relay-meet-id-nodate.js`, `scrapers/backfill-relay-meet-id.js` |
| `public.relay_athletes` | 38 | `frontend/services/database-supabase.ts`, `scrapers/athletic-net/import_meet_results.js`, `scrapers/athletic-net/merge_reviewed_athlete.js` | `scrapers/athletic-net/import_meet_results.js`, `scrapers/athletic-net/merge_reviewed_athlete.js`, `scrapers/athletic-net/split_reviewed_athlete.js` |
| `public.push_tokens` | 3 | `scrapers/shared/ingestion_postgres.integration.test.js`, `scrapers/tools/send-notification.js` | `scrapers/shared/ingestion_postgres.integration.test.js` |
| `public.event_types` | 17 | `frontend/services/database-supabase.ts`, `scrapers/backfill-athlete-gender.js`, `scrapers/match-tfrrs-index.js` | `scrapers/shared/ingestion_postgres.integration.test.js` |
| `public.event_aliases` | 11 | `scrapers/backfill-null-event-types.js`, `scrapers/shared/event_resolver.js`, `scrapers/shared/event_resolver.test.js` | `migrations/20260819_sibling_table_gaps.sql` |
| `public.unmapped_events` | 6 | `scrapers/shared/event_resolver.js` | none found |
| `public.divisions` | 8 | none found | none found |
| `ingest.runs` | 24 | `frontend/components/modals/AthleteStatsModal.tsx`, `scrapers/recovery/promote_ingest_run.js`, `scrapers/recovery/run_4x100_background.js` | `scrapers/recovery/promote_ingest_run.js`, `scrapers/shared/collapse_duplicate_rounds.js`, `scrapers/shared/ingestion_postgres.integration.test.js` |
| `ingest.source_records` | 8 | `scrapers/athletic-net/review_athlete_candidates.js`, `scrapers/shared/canonical_fact_writer.js`, `scrapers/shared/ingestion_postgres.integration.test.js` | `scrapers/shared/ingestion_postgres.integration.test.js`, `scrapers/shared/ingestion_store.js` |
| `ingest.observations` | 36 | `scrapers/athletic-net/review_athlete_candidates.js`, `scrapers/recovery/promote_ingest_run.js`, `scrapers/recovery/run_4x100_recovery_batch.js` | `scrapers/athletic-net/merge_reviewed_athlete.js`, `scrapers/shared/canonical_fact_writer.js`, `scrapers/shared/ingestion_postgres.integration.test.js` |
| `ingest.source_links` | 4 | `scrapers/athletic-net/merge_reviewed_athlete.js`, `scrapers/recovery/promote_ingest_run.js`, `scrapers/shared/canonical_fact_writer.js` | `scrapers/athletic-net/merge_reviewed_athlete.js`, `scrapers/shared/canonical_fact_writer.js`, `scrapers/shared/ingestion_postgres.integration.test.js` |
| `ingest.quarantine` | 28 | `scrapers/recovery/promote_ingest_run.js`, `scrapers/shared/ingestion_postgres.integration.test.js`, `scrapers/trackscoreboard/promote_source_native_athletes.js` | `scrapers/recovery/promote_ingest_run.js`, `scrapers/shared/canonical_fact_writer.js`, `scrapers/trackscoreboard/promote_source_native_athletes.js` |
| `ingest.recovery_queue` | 11 | `scrapers/meets/backfill_result_links.js`, `scrapers/reconciliation/outdoor-2026-4x100/source_discovery.js`, `scrapers/recovery/discover_4x100_sources.js` | `scrapers/reconciliation/outdoor-2026-4x100/source_discovery.js`, `scrapers/recovery/discover_4x100_sources.js`, `scrapers/recovery/discover_tfrrs_candidates.js` |
| `ingest.team_aliases` | 1 | `scrapers/shared/team_alias_resolver.js` | none found |
| `ingest.athlete_aliases` | 22 | `scrapers/athletic-net/create_reviewed_athlete.js`, `scrapers/athletic-net/merge_reviewed_athlete.js`, `scrapers/athletic-net/promote_athlete_aliases.js` | `scrapers/athletic-net/create_reviewed_athlete.js`, `scrapers/athletic-net/merge_reviewed_athlete.js`, `scrapers/athletic-net/promote_athlete_aliases.js` |
| `ingest.fact_cleanup_archive` | 0 | none found | none found |
| `ingest.event_recovery_queue` | 6 | `scrapers/reconciliation/outdoor-2026-4x100/source_discovery.js`, `scrapers/recovery/discover_4x100_sources.js`, `scrapers/recovery/promote_ingest_run.js` | `scrapers/reconciliation/outdoor-2026-4x100/source_discovery.js`, `scrapers/recovery/discover_4x100_sources.js`, `scrapers/recovery/promote_ingest_run.js` |
| `ingest.source_record_versions` | 3 | `scrapers/shared/canonical_fact_writer.js`, `scrapers/shared/ingestion_postgres.integration.test.js` | `scrapers/shared/ingestion_postgres.integration.test.js`, `scrapers/shared/ingestion_store.js` |
| `public.schools_full` (view) | catalog/type references | `frontend/types/database.ts`, `backend/supabase/migrations/20241201000000_initial_schema.sql` | view definition only; no direct writer |
| `public.teams_summary` (view) | catalog/type references | `frontend/types/database.ts`, `scrapers/shared/ingestion_postgres.integration.test.js` | view definition only; no direct writer |
| `public.v_athlete_prs` (view) | catalog/type references | `frontend/types/database.ts`, `scrapers/shared/ingestion_postgres.integration.test.js` | view definition only; no direct writer |
| `public.unprocessed_live_results` (view) | catalog/type references | `frontend/types/database.ts`, `scrapers/athletic-net/merge_reviewed_athlete.js` | view definition only; no direct writer |

Two intentional “no direct writer” cases are preserved as decisions: `public.divisions` is a
reference dimension currently consumed through school/conference division fields, and
`ingest.fact_cleanup_archive` is an immutable archive addressed by generic
`source_table`/`source_pk` values. Neither is inferred to be a ghost object.

## Relationship decisions

- Meet, individual performance, relay performance, relay participation, athlete, team, school,
  season membership, and source evidence remain separate grains.
- A relay result is one collective performance; `relay_athletes` supplies athlete
  participation. No four-row relay interpretation is introduced.
- Current school, historical team membership, and represented team on a performance are distinct.
  The current Unattached representation is preserved; roster membership does not rewrite meet
  affiliation.
- Source records, immutable versions, observations, source links, quarantine, and recovery
  queues remain separate ingestion stages. Queue tables do not directly write public facts.
- Archive rows remain before-images and are not made dependent on live-row deletion.
- Compatibility views remain where readers depend on them. The retired `public.events` object is
  not recreated merely to reconnect legacy `event_id` fields.

## Decisions and dependent work

All 35 relation-level dispositions and all 404 column decisions are recorded in
`model_review_20260905.json`. The decisions are intentionally conservative: preserve source
history and optional fields; improve identity, affiliation, source provenance, and relationship
contracts; retire only after consumer proof. No object is marked for immediate deletion by
MODEL-01.

The following remain separate implementation/review checkpoints and are not hidden inside this
completion:

- ID-01: canonical identity constraints and reviewed alias uncertainty.
- ING-02c and ING-02h: source-version/correction workflow and interrupted-run semantics.
- API-01: view/RPC/application relationship and count behavior.
- SEC-01: policy, grants, function, and trigger review.
- PERF-01: workload-backed index decisions.
- CLOSE-01: final whole-database reconciliation.

## Limitations

- Aggregate profiles prove coverage and missingness, not row-by-row semantic correctness.
- `pg_stats` is an analyzed-statistics signal; exact null/empty counts come from the checked-in
  aggregate profile. Sensitive raw payloads, tokens, and URLs were not exported as value samples.
- Repository scans cannot prove consumers outside this checkout or SQL assembled dynamically at
  runtime. Those cases stay explicitly flagged for dependent checkpoints.
- This report is a read-only semantic decision record. It does not authorize migration, backfill,
  cleanup, or queue execution.
