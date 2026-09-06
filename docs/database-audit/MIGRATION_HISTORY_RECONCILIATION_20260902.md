# Supabase migration-history reconciliation

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

Date: 2026-09-02

Status: partial reconciliation completed 2026-09-03; uncertain migrations remain untouched

## Evidence

- Production `supabase_migrations.schema_migrations`: 64 rows.
- Repository `supabase/migrations`: 107 SQL files and 90 unique version prefixes.
- Exact version-prefix intersection: 36.
- Matching migration names: 62.
- Local names absent from production history: 45.
- Production names absent from the local tree: 2 (`create_v_athlete_prs` and
  `20260810_map_remaining_event_aliases`).

The large name overlap with timestamp drift indicates that the repository and production were
maintained from different migration histories (renamed or regenerated files), not that production
has no migration tracking.

Of the 62 matching names, 25 use different version prefixes. Representative mappings include:

| Migration name | Local version | Production version |
|---|---:|---:|
| `create_event_types_and_aliases` | `20260714` | `20260710063357` |
| `create_divisions_dimension` | `20260715` | `20260715201807` |
| `add_results_source_tracking` | `20260716` | `20260716201815` |
| `team_aliases` | `20260820054037` | `20260820054321` |
| `athlete_aliases` | `20260820060951` | `20260820061042` |
| `recovery_queue_canonical_meet_target` | `20260828233203` | `20260828233616` |
| `add_cccaa_and_missing_junior_college_teams` | `20260829090000` | `20260829031927` |
| `add_glendale_ca_tfrrs_alias` | `20260829093000` | `20260829032324` |

These were initially evidence of drift, not proof that the SQL was equivalent; the fingerprint
result below supplies that proof for all 25 mappings.

## Fingerprint result

A read-only comparison was run on all 25 timestamp-drifted names. Comments and whitespace were
normalized, then SHA-256 fingerprints and token-set overlap were compared between each local file
and the production `statements` array:

- 25/25 normalized SQL fingerprints matched exactly;
- 25/25 had token overlap of 1.0000; and
- each production record contained one statement matching the local file.

These 25 entries are confirmed version renames, not distinct schema changes. That does **not** mean
we should run `migration repair` for the local timestamps: production already records the canonical
production versions, and adding the local versions would create duplicate history entries. The safer
next step is to align the local filenames to the canonical production versions (or establish an
explicit baseline) after reviewing the remaining local-only files.

One additional cross-name fingerprint is exact: local `20260715_computed_athlete_prs.sql` is byte-
equivalent after normalization to production `20260806182647_create_v_athlete_prs`.

## Live-state checks for local-only files

Read-only checks found the expected state for several local-only data/schema changes:

- all 37 event-alias labels from the late-August local alias files exist in `public.event_aliases`;
- all 31 reviewed team-alias mappings from the local-only TFRRS, Athletic.net, and TrackScoreboard
  files exist as active `ingest.team_aliases` rows;
- `push_tokens`, `v_athlete_prs`, `meets.end_date`, validated meet foreign keys, relay-table RLS,
  relay-coverage columns, and the replacement results indexes exist; and
- the retired `event_entries` and `meet_entries` tables are absent.

These checks establish that the live state contains the intended objects/data, but they do not
identify which migration supplied them. They are therefore classified as **state present,
provenance unresolved**, not automatically marked applied.

The invalid-history split remains **confirmed unapplied**: its archive operation and split-result
postconditions are absent from production, and it must remain pending.

## Function/data drift found

The live `public.get_top_performances(...)` body matches the substantive logic of the latest local
`20260223_wa_scoring_with_bounds.sql`; the earlier scoring files are therefore superseded.

`public.detect_timing_platform(text)` is different. The live function recognizes only the core
providers through `tfrrs`, while the local `20260527_expand_timing_platform_detection.sql` contains
additional providers such as FlashResults, Roster Athletics, and multiple timing hosts. The stored
`public.meets.timing_platform` values include those extended labels, but a read-only comparison of
the current function against stored values found 1,698 mismatches (including 4 `flashresults`, 3
`leonetiming`, and 13 `other_timing` rows). This is a live function/derived-data inconsistency that
needs a separate reviewed repair; it is not safe to resolve through migration-history metadata.

Emulating the local expanded detector against rows currently blank, `other`, or `other_timing`
projects 1,697 target rows: 555 `athletic_net`, 478 `tfrrs`, 130 `milesplit`, 46 `pt_timing`, 19
`finish_timing`, 31 `flashresults`, 29 `leonetiming`, 14 `xpresstiming`, 11 `herostiming`, 9
`wayzatatiming`, 8 `lexicontiming`, 6 `halfmiletiming`, 6 `deltatiming`, 174 `other_timing`, and
181 remaining `other`. This is a bounded repair candidate, but it requires a separate dry run and
owner approval before changing the derived column or replacing the live function.

## Timing-platform dry-run result

The read-only companion scan is `docs/database-audit/timing_platform_repair_scan.sql`. It reproduces
the local migration's CASE order and its exact eligibility predicate (`meet_url IS NOT NULL` plus a
blank/`other`/`other_timing` stored value).

The live scan confirmed:

- 1,697 rows are eligible under that predicate;
- 1,667 rows would actually change; and
- 30 rows already match their projected fallback (`other` or `other_timing`).

The 1,667 changing rows include 555 blank-to-`athletic_net` (plus one `other_timing`-
to-`athletic_net`), 478 blank-to-`tfrrs`, 130 blank-to-`milesplit`, 46 blank-to-`pt_timing`,
31 blank-to-`flashresults`, 29 blank-to-`leonetiming`, 19 blank-to-`finish_timing`, 14
blank-to-`xpresstiming`, 11 blank-to-`herostiming`, 9 blank-to-`wayzatatiming`, 8
blank-to-`lexicontiming`, and six each blank-to-`halfmiletiming` and blank-to-`deltatiming`.
The eligible set also contains 181 rows projecting to `other` and 174 to `other_timing`; 18 and 12
of those already match their stored fallback, leaving 163 and 162 actual fallback changes caused
by URL classification.

No rows were updated and the live function was not replaced. Before any repair, the fallback and
unknown-host groups need an owner-reviewed policy: a detector label is not proof that the URL is
the authoritative result provider, especially for generic timing hosts and TrackScoreboard-backed
pages. Any eventual write should be a separate reversible migration with a before-image/archive,
postcondition checks, and explicit approval.

Using that conservative policy, 1,342 changes are classified as known-provider matches and 325 are
held for review. The held group is concentrated in generic or intermediary hosts (including
TrackScoreboard pages); it is not safe to relabel those automatically from URL text alone.

The owner-approved known-provider repair was subsequently applied with operation key
`20260902_timing_platform_known_provider_repair`. It archived 1,342 unique meet before-images and
updated only those rows; the 325 held fallback rows were preserved at that stage. Two separately
approved host-specific repairs then updated 16 `.anet.live` rows and 96 verified AthleticLIVE
custom-domain rows. Their archives are retained for rollback; 216 fallback changes and five
active/upcoming exceptions remain held. No migration-history row or new table was added.

## Cleanup migrations applied outside history

These five migrations were applied directly to production after snapshot/rollback verification but
are not present in `schema_migrations`:

1. `20260902120000_consolidate_reviewed_school_duplicates.sql`
2. `20260902130000_remove_reviewed_empty_school_duplicates.sql`
3. `20260902140000_repair_aug18_tfrrs_edition_contamination.sql`
4. `20260902144458_preserve_reviewed_secondary_athlete_identities.sql`
5. `20260902170615_consolidate_reviewed_athlete_duplicates.sql`

`20260902100000_split_invalid_history_claims.sql` exists locally but was not applied to production.
It must not be marked applied.

## Tooling limitation

The Supabase CLI could not provide a linked comparison because this environment has no
`SUPABASE_ACCESS_TOKEN`. Its local comparison also cannot run because no local database is listening
on the configured port 54322. The production table was inspected directly with read-only SQL.

## Safety implication

Do not run `supabase db push` or blindly insert history rows yet. Timestamp drift and local-only
files could cause an already-applied schema change to be replayed. The migration table also stores
statement arrays and has no useful idempotency/rollback metadata for automatically proving
equivalence.

## Safe reconciliation sequence

1. Build a name-to-version map for the 62 common migrations and compare statement/schema
   fingerprints, not filenames alone.
2. Classify the 45 local-only names as superseded, unapplied, or intentionally local before any
   repair operation.
3. Verify the two production-only migrations against the live schema and repository history.
4. For only exact, already-applied migrations, prepare a reviewed `migration repair` command or
   equivalent metadata update. Never mark the unrun invalid-history split as applied.
5. Re-run the linked migration list and a schema diff before resuming normal migration deployment.

Until this sequence is complete, the cleanup and 4×100 work remain safe because they do not depend
on replaying the migration queue.

## Reconciliation checkpoint — 2026-09-03

The five cleanup migrations documented above as already applied directly in production were repaired
into `supabase_migrations.schema_migrations` using `supabase migration repair --status applied`:

- `20260902120000_consolidate_reviewed_school_duplicates`
- `20260902130000_remove_reviewed_empty_school_duplicates`
- `20260902140000_repair_aug18_tfrrs_edition_contamination`
- `20260902144458_preserve_reviewed_secondary_athlete_identities`
- `20260902170615_consolidate_reviewed_athlete_duplicates`

The live ledger now contains each version with its canonical name. The repair changed migration
metadata only; it did not replay SQL or alter application rows. The local invalid-history split
(`20260902100000`) and paused 4×100 team-link migration (`20260903200000`) remain absent and
unapplied. The additive affiliation foundation (`20260903180000`) was then applied through a
transaction-tested direct DDL step and recorded in the ledger; it changed only the `teams` schema.
Timestamp-drifted files and state-present/provenance-uncertain files remain held pending an explicit
baseline/alignment plan.

The follow-up compatibility-view migration
`20260903212617_teams_summary_prefers_explicit_affiliation` was applied transactionally and recorded
as applied. It preserves the existing `teams_summary` column contract and changes no current output
because all existing `teams.team_name` values remain NULL. The invalid-history split and paused
4×100 team-link migration remain absent and unapplied.

## Current ledger checkpoint — 2026-09-04

A fresh read-only recheck of the linked production project (`hunbahsnaeeztmzqpnrl`) confirms:

- `supabase_migrations.schema_migrations` contains 82 records, from
  `20260122075100` through `20260904141650`.
- The repository contains 120 tracked migration SQL files and 103 unique version prefixes.
- 54 local version prefixes match production exactly. A further 26 migration names are shared but
  use different local/production timestamps; this is the previously documented timestamp drift,
  not evidence that those SQL changes should be replayed.
- 40 local migration names are absent from the live ledger and remain unclassified (superseded,
  unapplied, or intentionally local). Two live names have no same-named local file:
  `create_v_athlete_prs` and `20260810_map_remaining_event_aliases`.
- One shared-name mismatch remains (`20260210` locally named
  `top_performances_with_scoring`, versus production `top_performances_function`).

The live migration rows include statement arrays but no rollback arrays; that metadata is not a
substitute for a before-image or an SQL-equivalence proof. No `migration repair`, `db push`, DDL,
or data write was performed during this checkpoint. The invalid-history split
(`20260902100000`) and paused 4×100 team-link migration (`20260903200000`) remain absent and
unapplied.

## Local-only classification pass — 2026-09-04

The 40 local names absent from production history were classified without changing the ledger:

- **Superseded function/normalization drafts — do not replay:**
  `fix_event_name_matching`, `fix_weight_throw_scoring`, `indoor_outdoor_scoring`,
  `normalized_event_names`, `normalize_event_names`, `comprehensive_event_normalization`, and
  `event_normalization_batched`. Later canonical event aliases and the current live function
  supersede these drafts.
- **Effect observed, but exact provenance still unresolved — do not replay:**
  `add_meet_end_date`, `add_performance_indexes`, `push_tokens`, `drop_duplicate_indexes`,
  `enable_rls_relay_tables`, `recompute_meet_seasons`, `seed_event_catalog`, `add_meet_id_fks`,
  `computed_athlete_prs`, `drop_dead_tables`, `relay_event_normalization`,
  `athletic_net_event_aliases`, `backfill_results_source_tfrrs`,
  `refresh_athlete_current_school`, `index_results_team_id`, `track_relay_source_coverage`,
  `wa_scoring_with_bounds`, `add_athleticlive_pentathlon_sub_event_aliases`,
  `add_athleticlive_college_event_aliases`, `add_athleticlive_racewalk_masters_aliases`,
  `add_athleticlive_pentathlon_mile_aliases`, `add_athleticlive_punctuated_seeded_event_aliases`,
  `add_lai_puerto_rico_team_entities`, `add_tfrrs_unattached_team_aliases`,
  `add_hammer_throw_event_alias`, `add_ccbc_catonsville_athletic_net_alias`,
  `add_semifinal_event_aliases`, `add_athleticlive_3000m_racewalk_alias`, and
  `reconcile_partial_event_queue_status`. Live object/data checks show the relevant effects or
  later replacements, but not which historical file supplied them.
- **Partially handled and held:** `expand_timing_platform_detection`. The known-provider subset
  was repaired separately with archived before-images; fallback/unknown-host rows remain held.
  Replaying this file would overwrite the reviewed boundary.
- **Explicitly not applied:** `split_invalid_history_claims` and
  `apply_reviewed_4x100_team_links`. Both remain pending by design.

`top_performances_with_scoring` is the one same-version naming mismatch: the local `20260210` file
and production `20260210_top_performances_function` are one history slot, not two changes. This
classification is a review aid only; it does not authorize marking any local file as applied.

## Production-only verification — 2026-09-04

The two live names without a same-named local file were checked against live state:

- `20260806182647_create_v_athlete_prs` is present as `public.v_athlete_prs`; its SQL is the
  computed, source-derived PR view represented by the local `20260715_computed_athlete_prs.sql`
  file under a different version.
- `20260810125242_20260810_map_remaining_event_aliases` has all 19 expected alias rows present.
  The current database has zero `results` rows with a NULL `event_type_id` and zero
  `unmapped_events` rows lacking an alias match.

These checks confirm live state, not permission to create duplicate local history entries. No
history repair or replay is needed for either production-only record.

## View-fix ledger follow-up — 2026-09-04

The reversible PR-view migration was applied successfully. The Supabase migration tool assigned
the canonical live version `20260904195352` with name `fix_v_athlete_prs_points_source`; the local
file is aligned to that exact version. The production ledger now contains 83 records. This was a
view definition change only: `athlete_prs` and `results` row counts were not written, and the
rollback definition is retained alongside the migration. No additional history repair is needed.
