# Live database audit — 2026-09-01

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

## Scope and safety

This was a read-only inspection of the live Supabase PostgreSQL database. No canonical
`public` result, relay, athlete, meet, team, or policy row was changed. The outdoor 2026
4x100 worker remains paused; there are no active worker connections. The only database
state change made before this audit was the already-requested consolidation of the temporary
4x100 reconciliation records into the existing `ingest.event_recovery_queue`.

Reproducible SQL companions:

- `docs/database-audit/quality_scan.sql` — one exact scan per app table, every column
- `docs/database-audit/integrity_scan.sql` — canonical-row and invariant checks
- `docs/database-audit/targeted_scan.sql` — policies, ACLs, constraints, views, queues, and linkage

## Inventory

The owner-managed schemas are `public` and `ingest`. All Supabase-managed schemas were also
inventoried; the only RLS policies in the database are the 23 policies in `public`.

Exact row counts from the live scan:

| Area | Rows |
|---|---:|
| `public.results` | 3,507,218 |
| `public.relay_results` | 203,826 |
| `public.relay_athletes` | 462,728 |
| `public.athlete_prs` | 475,527 |
| `public.athletes` / `teams` / `schools` / `meets` | 152,204 / 3,677 / 1,867 / 12,878 |
| `ingest.source_records` / `source_links` / `observations` | 54,518 / 41,214 / 156,385 |
| `ingest.event_recovery_queue` / `recovery_queue` | 10,533 / 2,573 |
| `ingest.quarantine` / `runs` | 9,648 / 1,497 |

Dimension/auxiliary counts: `event_types` 67, `event_aliases` 1,329, `conferences` 1,114,
`regions` 27, `divisions` 6, `external_ids` 15, `unmapped_events` 46, `live_results` 48,
`events` 0, `conference_memberships` 0, `waitlist` 1, and `push_tokens` 1.

## What is healthy

- All 51 foreign-key constraints in `public`/`ingest` are validated; no unvalidated FK was found.
- Canonical results and relays all resolve to an `event_type_id` (0 NULL event types).
- No duplicate relay with the enforced meet/event/team/place/mark/round/lineup key was found.
- No malformed doubled status marks were found.
- Every parseable numeric mark across `results`, `relay_results`, and `athlete_prs` has a numeric value.
- No zero, negative, or truncated `h:mm:ss` numeric marks were found.
- No duplicate index definitions were found.
- All app tables except one archival table have RLS enabled; public read policies are explicit.

## Findings requiring owner decisions

### 1. Historical unlinked result population — high impact, legacy-shaped

`results` has 562,033 rows with no `meet_id` (422,761 have no date). The unlinked rows are
heavily concentrated in old import batches created on 2025-11-26 (349,673), 2026-01-30
(79,263), and 2026-02-03/04 (132,809 combined). This looks like a legacy ingestion/linkage gap,
not a reason to delete rows. It should be repaired or explicitly classified before any NOT NULL
constraint is considered.

`results` also has 403,675 rows with no `team_id`; unlike the meet gap, this includes recent
imports, so it needs a source/roster-aware review. `relay_results` has 31,407 rows without a team
and 22,865 without a meet; `relay_athletes` has 3,359 legs without an `athlete_id`.

### 2. Thirty invalid history claims — reviewed split candidates

The date detector exposed ten rows dated more than seven days away from their linked meet. A full
provenance trace found 20 additional undated history rows claimed by the same pre-fix matcher bug.
All 30 canonical rows combine an older historical performance with a different, newer source
observation. The reviewed repair is a reversible 30-row split, not deletion or blind relinking;
see `INVALID_HISTORY_CLAIM_REVIEW_20260902.md`.

### 3. Same-day/different-state signal is above baseline — investigate, do not auto-delete

The standing detector reports 3,048 athlete-days across different states versus a documented
baseline of 2,866. The detector documentation explicitly says adjacent-state and multi-day meets
create legitimate hits. This is a review queue, not proof of duplicate results.

### 4. Provenance has a completely unused hash column

`ingest.source_records.payload_hash` is NULL in all 54,518 rows. The source-record uniqueness
guard is `(source, source_record_key)`, so this is not currently breaking integrity, but the
column is not providing deduplication or tamper evidence. Decide whether to populate it, remove
it from the active model, or document it as reserved.

`ingest.observations` has 91,114 rows with no canonical result/relay target. Many are intentionally
pending/quarantined, but the count must be reconciled against `quarantine` and decisions before
retention or deletion.

### 5. Several columns are known legacy/reserved fields, not safe drop candidates today

The existing `docs/reference/COLUMN_RETIREMENT_PLAN.md` correctly identifies the same live scan:
`results.season_code`, `meet_location`, and `total_competitors` are 100% NULL; `event_id` is mostly
NULL and superseded by `event_type_id`; `mark_feet` is mostly derivable; and `schools.ncaa_region`,
team URLs/coach fields, and athlete profile fields are empty. The profile fields are explicitly
reserved for future social/profile features. These should be retired only after code readers move.

`public.athlete_prs` is a large scraped table (475,527 rows) with 467,001 NULL `set_at` values and
466,969 NULL `meet_name` values. The repository already documents the computed `v_athlete_prs`
view as the intended replacement; no table deletion was performed.

`public.live_results` contains 48 unprocessed rows, all from 2025-12-02. It is stale, but not empty;
the target-schema notes correctly call for isolating it before deciding its fate.

### 6. Backup tables are intentional archives; documentation was reconciled 2026-09-02

Nine backup tables exist and are service-role-only. Exact current counts include:
`results_d2_backup` 453,737, `results_d1_backup` 23,766, `relay_results_d3_backup` 40,935,
`relay_athletes_d3_backup` 89,085, `athletes_empty_backup` 12,518, and smaller 2026-08-19 backups.
The counts for the relay backups differed substantially from the 2026-08-10 numbers previously in
`docs/RECOVERY.md`. The 2026-09-02 reconciliation accounts for all 40,935 parents and 89,085 legs
across five operations and updates the live counts. These tables have
no primary keys by design and are not publicly granted. `results_athlete_merge_backup` has 11 rows
and is the only app table with RLS disabled, but its ACL is still service-role-only.

### 7. School identity collisions are a review set, not proof of duplicates

There are 83 normalized official-name collision groups. Many are a populated canonical school plus
a later no-state/no-data copy (for example, community colleges); some groups have real references
on both records. Do not merge by name alone. Review `school_id`, state, source IDs, teams, and
athlete history together.

## Policy/security review

- `public` has 23 explicit policies: read-only policies for app data, service-role-only writes for
  `push_tokens` and `unmapped_events`, and a validated public insert policy for `waitlist`.
- `ingest` has no policies, but every ingest table is RLS-enabled and ACLs grant access only to
  `postgres` and/or `service_role`; no `anon`, `authenticated`, or `PUBLIC` table grants were found.
- Public views use `security_invoker`; the three internal views without anon/authenticated SELECT
  grants are not exposed through normal public roles.
- The only security-definer routine is `public.register_push_token(text,text)`. It has an explicit
  `search_path = public, pg_temp`, validates token/platform input, and is the intended public RPC.
  Other publicly executable routines are security-invoker and use the same fixed search path.

## Recommended next sequence (no mutation yet)

1. Reconcile the stale recovery/archive documentation with live counts.
2. Review the 30 invalid history claims and the 83 school collision groups manually.
3. Partition unlinked `results`/relays by ingestion batch and source before proposing any backfill.
4. Decide the lifecycle of `source_records.payload_hash`, `athlete_prs`, `live_results`, and empty
   `conference_memberships`/`events` using the existing retirement plan and target-schema blueprint.
5. Only after those decisions, prepare separate dry-run repair plans. No cleanup SQL should be run
   against canonical tables as part of this audit.
