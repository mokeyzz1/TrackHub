# Track Meet Tracker — Backend & Database Audit

Audit date: 19 August 2026  
Scope: live Supabase/Postgres project, repository schema/migrations, scraper writers, duplicate logic, workflows, and frontend database reads.  
Mode: read-only baseline capture. No production fact rows were modified during the baseline audit; the
remediation status below records the verified changes applied afterward.

## Remediation status verified after the baseline

The audit findings were used to install the first safety boundary:

- `ingest.runs`, `ingest.source_records`, `ingest.observations`, `ingest.source_links`, and
  `ingest.quarantine` now exist in a private schema with transactional staging and provenance.
- `canonical_fact_writer.js` is the controlled writer for individual facts, relay parents, relay
  legs, and source links. TFRRS and athletic.net adapters now emit the same contract.
- All public base tables and backup tables have RLS enabled. Browser roles can read published data,
  but cannot write result facts or diagnostics. The push-token write is a validated RPC rather than
  direct table DML.
- `meets_meet_id_seq` was reconciled to the live maximum (`94,959`), so the next default ID is
  `94,960`.
- The scheduled TFRRS writer is fail-closed unless `INGEST_DATABASE_URL` is configured, and it now
  invokes controlled mode. A dry run must be completed before enabling production commits.
- The active TFRRS and athletic.net importer commit paths also fail closed unless `--control-plane`
  is supplied; the old direct path requires the explicit `--legacy-direct-write` escape hatch.

These changes are additive and do not deduplicate, delete, or rewrite the existing fact rows. The
remaining recovery work is deliberately separate: verify source availability, run the 2025–26
reconciliation queue in dry-run mode, then commit only unambiguous rows.

Current live recheck after the remediation: `results` 3,482,616; `relay_results` 198,899;
`relay_athletes` 443,605; `meets` 12,694; `athletes` 152,121; `event_types` 64; and
`event_aliases` 1,235. The detailed inventory below is the baseline snapshot and is retained for
audit comparison, not as a substitute for a fresh query.

The first recovery-queue dry run used the explicit overlap window `2025-08-01` through
`2026-07-31` (scope key `2025-26`), rather than trusting the inconsistent `meets.season` labels:
2,573 meets were inventoried; 1,442 are covered, 332 are queued behind a supported TFRRS or
athletic.net link (99 empty, 227 individual-only, 6 relay-only), and 799 are blocked because no
supported result link is currently recorded (49 empty, 745 individual-only, 5 relay-only). This is
an auditable workload inventory, not a claim that every blocked meet is absent from both sources.

The live event catalog currently has 51 time, 9 distance, 3 points, and 1 unknown event types;
both fact tables have zero null `event_type_id` rows. Legacy semantic cleanup is not complete,
though: 34,531 points-category results still carry `mark_seconds` and 37,251 carry `mark_meters`.
The new contract quarantines those component/aggregate conflicts for future imports; it does not
silently rewrite the historical rows.

## Technical summary

The database is populated and partially normalized, but it is not currently safe for unattended two-source recovery. The root issue is architectural: migration history has drifted, multiple importer generations still write the same facts, duplicate identity differs by source, and frontend reads still use raw meet and event text.

The target recovery seasons—Indoor 2026, Outdoor 2026, and XC 2025—contain 2,460 meet records:

- 2,288 have individual results.
- 16 are relay-only.
- 156 have no individual or relay rows.
- Therefore 172 target meets have no individual coverage.

The immediate recommendation is to pause unattended result writes, repair the access and identity foundations, and then run a source-aware recovery queue. Model or sub-agent selection should follow that control-plane work.

## Baseline live database inventory

Exact counts queried from PostgreSQL on 19 August 2026:

| Object | Rows | Notes |
| --- | ---: | --- |
| results | 3,470,965 | Individual performance facts |
| relay_results | 198,899 | Team performance facts |
| relay_athletes | 443,605 | Relay-leg bridge rows |
| meets | 12,694 | Meet/recovery units |
| athletes | 151,200 | Athlete dimension |
| teams | 3,607 | School/gender team dimension |
| event_types | 64 | Canonical event catalog |
| event_aliases | 1,224 | Raw-name mappings |
| unmapped_events | 38 | Stale telemetry; current null event-type coverage is zero |

The results table is approximately 2.24 GB including indexes. PostgreSQL statistics report approximately 273,575 dead tuples even though autovacuum recently ran; exact COUNT queries, not pg_stat estimates, were used for the audit totals.

## P0 findings

### 1. The recovery gap is verified, but status is not a safe state machine

The target-season status rollup is:

| Recorded status | Meets | Individual rows | Relay rows | No rows anywhere | Relay-only |
| --- | ---: | ---: | ---: | ---: | ---: |
| imported | 223 | 211,773 | 8,429 | 0 | 0 |
| missing_tfrrs_url | 1,737 | 803,689 | 27,062 | 119 | 5 |
| no_results_at_source | 31 | 0 | 36 | 28 | 3 |
| pending | 462 | 231,233 | 6,239 | 9 | 8 |
| tfrrs_available | 7 | 6,276 | 46 | 0 | 0 |

The largest bucket, missing_tfrrs_url, already contains 803,689 individual rows. pending contains 231,233 individual rows. A recovery agent must use linked fact counts, source provenance, and deterministic identity—not results_status alone—to decide whether a meet needs import.

### 2. The meet sequence is behind existing IDs

meets_meet_id_seq has last_value 13,166 while the table max meet_id is 94,959. There are 437 rows above the sequence, with IDs 90,355–94,959, created within roughly one second on 6 February 2026. The sequence will eventually collide with those rows during future default inserts unless reconciled safely.

### 3. Public access controls expose mutable backup and catalog tables

Supabase security advisors reported 18 security findings. Direct privilege inspection found 12 public-schema base tables with RLS disabled while anon has SELECT, INSERT, UPDATE, and DELETE privileges. The set includes backup tables containing millions of rows plus event/dimension catalogs. This is both a data-exposure and data-corruption risk.

Additional findings:

- v_athlete_prs is a security-definer view.
- The athlete_prs policy named “service role full access” is granted to public and permits ALL.
- push_tokens is publicly insertable/updatable.
- waitlist has overlapping insert policies.
- Four functions have mutable search paths.
- live_results has RLS enabled but no policy.

### 4. Migration history is not portable or authoritative

The repository contains 37 files under supabase/migrations plus four out-of-band files under migrations. The live migration history records only 14 migrations, and local filenames/versions do not consistently match remote history. The out-of-band deduplication and sibling-table fixes are not represented in the normal migration chain.

This means a fresh environment cannot be assumed to reproduce production, and the current repository cannot safely serve as the sole schema source until the chain is reconciled.

## Schema and data-model findings

### Meet and event identity

The core relational direction is good: meets, athletes, teams, results, relay_results, relay_athletes, event_types, and event_aliases exist with validated foreign keys. However:

- public.events is empty.
- 1,195,368 individual rows and 35,253 relay rows retain non-null event_id values with no parent row and no event_id foreign key.
- Meet identity has no unique normalized name/date constraint.
- There are 53 duplicate tfrrs_url groups with 66 extra rows, 5 duplicate athletic.net URL groups with 5 extras, and 16 duplicate meet_url groups with 34 extras.
- Current normalized name/date duplicate groups are zero, so the problem is chiefly source-URL identity and writer behavior rather than exact normalized meet-name duplication.

The frontend hook useMeetDetails still queries events by meet_id, so that path returns no events. Other frontend services build meet pages from results using meet_name/date instead of treating meet_id as authoritative.

### Event normalization and multi-events

The current result and relay event_type_id null counts are both zero, which is a meaningful improvement. The remaining problem is semantic: multi-events are stored under one points event type.

Of 87,226 points-category result rows, 70,015 also have seconds or meters. The computed PR view extracts digits from mark_raw for points; 4,982 point PR rows in the view have component-like raw marks such as time or distance values. This can rank component performances as aggregate points.

The model needs component event instances—event, unit, component/order, and scoring context—before multi-event PRs or deduplication can be trusted.

### Result and relay completeness

| Finding | Count | Context |
| --- | ---: | --- |
| Individual rows with meet_id NULL | 562,063 | 16.2%; may be intentional athlete history |
| Results missing date | 422,761 | 12.2% |
| Results missing team_id | 400,487 | 11.5%; history/unattached rows contribute |
| Results missing environment | 336,673 | 9.7% overall |
| Meet-linked results missing environment | 212,684 | 7.3% of 2,908,902 linked results |
| Results missing season_code | 3,470,965 | 100% |
| Relay rows with meet_id NULL | 22,865 | 11.5% of 198,899 |
| Relay rows with team_id NULL | 31,408 | 15.8% |
| Relay rows with date NULL | 11,153 | 5.6% |
| Relay-leg rows with athlete_id NULL | 2,878 | 0.65% of relay_athletes |
| Linked individual dates outside meet window | 851 | Date/link consistency issue |
| Linked relay dates outside meet window | 29 | Date/link consistency issue |
| Linked individual meet-name mismatches | 3 | meet_id and copied text disagree |

Unlinked history is not automatically corruption. It is a separate state that must be claimed into a meet only with deterministic evidence.

## Importer and duplicate-logic findings

The repository has multiple writers capable of touching the same fact tables:

- Active TFRRS: [sync-weekend-results.js](../scrapers/tfrrs/meet-scraper/sync-weekend-results.js) and [import-meet-results.js](../scrapers/tfrrs/meet-scraper/import-meet-results.js).
- Athletic.net: [import_meet_results.js](../scrapers/athletic-net/import_meet_results.js).
- Legacy athlete-history: [import-results-to-db.js](../scrapers/tfrrs/athlete-scraper/import-results-to-db.js).
- Legacy relay, PR, repair, backfill, live, entries, and final scripts.

Important behavior differences:

1. The active TFRRS batch path filters work to meets with a stored TFRRS URL, checks existing rows with raw event_name/mark_raw/date keys, and does not page that existing-row query. It updates scraped meets to imported after the run regardless of imported/error counts. Relay parent rows, relay legs, and individual sibling rows are separate writes, not one transaction.

2. The athletic.net path uses the shared normalized fingerprint but scans a plus or minus seven-day window without pagination and excludes meet, date, round, and place from the fingerprint. In the 2024-09-01 through 2026-08-19 data, the same athlete/event/normalized-mark fingerprint appears across 57,082 cross-meet pairs within seven days. These are candidate collisions, not all confirmed duplicates, but the volume proves date proximity is too broad as the identity contract.

3. The legacy athlete-history importer keys on raw event name, raw mark, date, and meet name; manually assigns result_id from max(id); and runs without a require.main guard. This is race-prone and bypasses the shared fingerprint.

4. [result_fingerprint.js](../scrapers/shared/result_fingerprint.js) and [collapse_duplicate_rounds.js](../scrapers/shared/collapse_duplicate_rounds.js) intentionally exclude round in cross-source matching or collapse round variants before insert. The database unique indexes include round, so database constraints alone cannot detect Finals/Heat/Preliminaries equivalence.

5. A read-only semantic duplicate diagnostic found 195 meet-linked same-performance groups and 366 extra rows when round is ignored. These require domain classification; automatic deletion is unsafe.

6. GitHub scheduled workflows use actions/checkout without an explicit ref. The production schedules therefore follow the repository default branch, while backend-rebuild is ahead of main. Repaired importer code is not guaranteed to be what scheduled jobs execute.

The shared [event_resolver.js](../scrapers/shared/event_resolver.js) and [athlete_resolver.js](../scrapers/shared/athlete_resolver.js) are good consolidation steps, but they are not enforcement boundaries until every writer is removed, gated, or routed through one transactional API.

## Frontend read-path findings

[database-supabase.ts](../frontend/services/database-supabase.ts) still has several correctness and scale risks:

- getEventsByMeet and related functions use meet_name/date instead of meet_id.
- getEventsByMeetWithGender, getEventResults, and getRelayResults accept meetId but ignore it.
- getEventResults and relay reads filter on raw event_name rather than event_type_id.
- getSchoolAthletesBySeason has a 2,000-row limit.
- getSchoolMeets has a 1,000-row limit.
- Some event-list queries have no pagination.

This means the app can display the wrong source copy, miss rows past the PostgREST cap, or return no events through the legacy events hook.

## Security and performance advisors

Supabase reported 43 performance findings:

| Finding class | Count |
| --- | ---: |
| Unindexed foreign keys | 11 |
| No primary key | 8 |
| Unused indexes | 11 |
| Multiple permissive policies | 12 |
| Auth connection strategy advisory | 1 |

The index set also contains overlapping result indexes and two result-level duplicate guards whose keys include round. The normalized guard expressions in live SQL strip only a/h, while the current working-tree JavaScript normalization also handles c/y. There are currently no c/y-suffix result rows, but the database and code rules should be made identical before future imports.

## Methodology and confidence

The audit covered:

- Live information_schema and pg_catalog structure, columns, defaults, sequences, primary/foreign/check/unique constraints, indexes, views, functions, triggers, RLS, policies, grants, extensions, and table sizes.
- Supabase security and performance advisors.
- Exact coverage, completeness, consistency, duplicate-identity, event-semantic, source/status, and sequence diagnostics.
- All local and out-of-band SQL migrations.
- Active and legacy scraper writers, shared resolvers/fingerprints, workflows, frontend services/hooks, and Git/worktree state.
- Syntax validation of every scrapers/**/*.js file with node --check.

High confidence: live counts, constraints, policies, grants, sequence state, migration-history mismatch, and advisor findings.  
Medium confidence: duplicate classification and source/status interpretation.  
Requires external verification: whether each no-row meet is actually absent from TFRRS or athletic.net; no external source crawl was performed.

## Baseline remediation sequence

The sequence below is the original recommendation from the read-only audit. The current state of
the first controls is recorded in the remediation status above; the remaining items are still
open unless explicitly marked there.

### P0 — Stop new damage

- Pause or gate scheduled result imports until production is pinned to one reviewed commit and legacy writers cannot run concurrently.
- Lock down the 12 RLS-disabled public tables and backup tables.
- Correct the public athlete_prs ALL policy, security-definer view, mutable function search paths, and overlapping policies.
- Reconcile meets_meet_id_seq against max meet_id using a collision-safe check before new meet inserts.

### P1 — Establish one identity and write boundary

- Build one source-aware ingestion orchestrator per source.
- Use one transaction for meet provenance, individual results, relay results, relay legs, and status.
- Add explicit meet identity, result identity, source row provenance, canonical event instance, unit, round policy, and ingestion run.
- Keep database constraints as the final safety net, but route every writer through the same resolver.

### P2 — Recover 2025–26 safely

- Create a deterministic queue for the 172 target meets without individual rows: 156 with no rows and 16 relay-only.
- Reconcile the 1,737 missing_tfrrs_url and 462 pending groups against actual row presence.
- Claim history rows only when meet identity, date, athlete, canonical event, and mark evidence meet an auditable threshold; quarantine ambiguity.

### P3 — Make the model and app exact

- Move frontend reads to meet_id and event_type_id, paginate all fact queries, and remove ignored meetId arguments.
- Decide whether events is retired or populated.
- Model multi-event component instances.
- Rebuild the PR view from validated measures and component rows.

### P4 — Make recovery repeatable

- Consolidate the 41 local SQL files into one tracked migration chain and eliminate out-of-band production SQL.
- Add invariant tests for uniqueness, foreign keys, required fields, status/row agreement, provenance, pagination, and sibling-table parity.
- Review overlapping/unused indexes after query patterns are fixed, then vacuum/analyze from measured workload.

## Worktree state

The audit preserved the existing modifications:

- [scrapers/shared/result_fingerprint.js](../scrapers/shared/result_fingerprint.js)
- [scrapers/verify-data-invariants.js](../scrapers/verify-data-invariants.js)

No implementation fixes were applied during this audit.
