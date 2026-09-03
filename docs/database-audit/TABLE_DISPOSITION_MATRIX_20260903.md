# Complete table disposition matrix — 2026-09-03

This matrix assigns an initial status to every live table identified in the complete-instance
catalog. It is a review artifact, not a deletion list. “Managed/leave untouched” means the object
is owned by Supabase and must be documented rather than redesigned by the application cleanup.

## Application-owned `public` tables and views

| Table | Initial disposition | Why / next question |
| --- | --- | --- |
| `athletes` | keep + improve | canonical athlete dimension; review source IDs, nullable profile fields, identity rules |
| `athlete_team_seasons` | keep + improve | historical athlete/team bridge; validate season semantics and empty fields |
| `schools` | keep + improve | canonical institution dimension; resolve collisions before uniqueness |
| `teams` | keep + improve | school/gender team dimension; clarify non-collegiate and inactive identities |
| `meets` | keep + improve | canonical meet identity; reconcile source URLs, seasons, environments, and duplicates |
| `results` | keep + improve | canonical individual facts; classify nullable links and retire legacy fields only after readers move |
| `relay_results` | keep + improve | canonical relay-parent facts; define identity/round semantics consistently |
| `relay_athletes` | keep + improve | canonical relay-leg bridge; resolve the small unresolved-athlete population |
| `event_types` | keep + improve | canonical event catalog; validate measure/category/environment semantics |
| `event_aliases` | keep + improve | source-label mapping; enforce review workflow for unmapped labels |
| `divisions` | keep + improve | reference dimension used by schools/conferences |
| `regions` | keep + improve | reference dimension; validate division coverage and naming |
| `conferences` | keep + improve | populated reference dimension; model temporal membership rather than one current pointer only |
| `conference_memberships` | keep + validate | empty but structurally meaningful historical M:N model; confirm future use |
| `external_ids` | keep + adopt | populated multi-source identity table; audit why entity-specific columns are mostly unused |
| `athlete_prs` | keep temporarily + reconcile, then retire | scraped cache still contains source evidence not reproducible from imported results; computed view is the eventual authority only after gap closure |
| `v_athlete_prs` | keep + improve | derived PR view; fix multi-event/component semantics before treating as authoritative |
| `events` | retire after reader migration | empty per-meet scheduling model; one frontend reader remains and has an explicit retirement gate |
| `live_results` | isolate + retire after lifecycle migration | 48 stale unlinked rows; active readers/writers remain, so archive and migrate lifecycle first |
| `unprocessed_live_results` | keep temporarily | compatibility view over `live_results`; retire with the live-results reader |
| `schools_full` | keep + improve | convenience view; migrate legacy text division dependency |
| `teams_summary` | keep + improve | convenience view; verify aggregation and canonical dimension joins |
| `unmapped_events` | keep + improve | review telemetry; enforce private write boundary and retention policy |
| `waitlist` | keep | active public insert surface with validation policy |
| `push_tokens` | keep + restrict | validated RPC write surface; confirm retention and user ownership model |

## Application-owned `public` archives

| Table | Initial disposition | Why / next question |
| --- | --- | --- |
| `athletes_empty_backup` | archive + restrict | before-image archive; no PK/index by design; verify service-role-only ACL |
| `relay_athletes_d3_backup` | archive + restrict | before-image archive; preserve until retention policy is approved |
| `relay_results_d3_backup` | archive + restrict | before-image archive; preserve until retention policy is approved |
| `relay_results_20260819_backup` | archive + restrict | historical rollback archive |
| `results_d1_backup` | archive + restrict | historical rollback archive |
| `results_d2_backup` | archive + restrict | large historical rollback archive |
| `results_xsource_20260819_backup` | archive + restrict | historical rollback archive |
| `results_accidental_import_20260819_backup` | archive + restrict | incident rollback archive |
| `results_athlete_merge_backup` | archive + move/restrict | only public archive with RLS disabled; verify ACL and consider private archive boundary |

## Private `ingest` tables

| Table | Initial disposition | Why / next question |
| --- | --- | --- |
| `athlete_aliases` | keep + improve | reviewed source-identity bridge |
| `team_aliases` | keep + improve | reviewed source-team identity bridge |
| `source_records` | keep + improve | stable source identity; decide lifecycle of unused `payload_hash` |
| `source_links` | keep + improve | provenance bridge to canonical facts; reconcile result/relay exclusivity |
| `observations` | keep + improve | reviewable pre-canonical boundary; reconcile unresolved targets |
| `quarantine` | keep + improve | ambiguity/invalidity boundary; define retention and resolution states |
| `runs` | keep + improve | execution audit trail; populate or retire unused `code_revision` |
| `recovery_queue` | keep + review | meet-level recovery workflow; compare lifecycle with event queue |
| `event_recovery_queue` | keep + pause | event-level recovery workflow; 4x100 work is paused, but rows remain private evidence |
| `fact_cleanup_archive` | keep immutable | append-only rollback ledger for applied repairs |

## Supabase-managed and platform tables

These are cataloged for completeness but are not application cleanup targets.

| Schema | Tables | Initial disposition |
| --- | --- | --- |
| `auth` | `audit_log_entries`, `custom_oauth_providers`, `flow_state`, `identities`, `instances`, `mfa_amr_claims`, `mfa_challenges`, `mfa_factors`, `oauth_authorizations`, `oauth_client_states`, `oauth_clients`, `oauth_consents`, `one_time_tokens`, `refresh_tokens`, `saml_providers`, `saml_relay_states`, `schema_migrations`, `sessions`, `sso_domains`, `sso_providers`, `users`, `webauthn_challenges`, `webauthn_credentials` | managed / leave untouched |
| `realtime` | `messages`, `schema_migrations`, `subscription` | managed / leave untouched |
| `storage` | `buckets`, `buckets_analytics`, `buckets_vectors`, `migrations`, `objects`, `s3_multipart_uploads`, `s3_multipart_uploads_parts`, `vector_indexes` | managed / leave untouched |
| `supabase_migrations` | `schema_migrations` | managed metadata; reconcile with repository history, do not rewrite casually |
| `vault` | `secrets` | managed / leave untouched |

The `extensions` views (`pg_stat_statements`, `pg_stat_statements_info`) and GraphQL relations are
also managed surfaces. They are documented in the full inventory but are not candidates for
application-level consolidation.

## Completion rule

Every table now has an initial disposition. Before any mutation, each “keep + improve,” “replace,”
“isolate,” “archive + restrict,” and “decision required” item must receive an evidence packet with
code readers, dependencies, row counts, proposed target, dry-run output, and rollback SQL. Managed
objects require a platform-safe explanation if they are ever changed.
