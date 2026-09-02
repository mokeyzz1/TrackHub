# Supabase migration-history reconciliation

Date: 2026-09-02

Status: read-only assessment; no migration-history rows changed

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
