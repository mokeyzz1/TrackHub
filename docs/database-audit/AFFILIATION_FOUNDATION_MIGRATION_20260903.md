# Affiliation foundation migration — 2026-09-03

## What is ready

Migration `20260903180000_add_explicit_team_affiliation_fields.sql` adds two nullable columns to
the existing `public.teams` table:

- `team_name`: explicit competition-affiliation display label;
- `team_type`: reviewed category constrained to `collegiate`, `club`, `scholastic`,
  `international`, `open`, `unattached`, or `other`.

The migration deliberately does **not** create a new table, populate or move rows, change existing
foreign keys, change RLS/policies, rewrite compatibility views, or retire school 1835. Existing
readers remain compatible while the dual-read rollout is introduced incrementally.

## Application checkpoint — 2026-09-03

The exact migration SQL was first executed against the live database inside a transaction and rolled
back. It was then applied transactionally and recorded in the live ledger as
`20260903180000_add_explicit_team_affiliation_fields`.

Verification confirmed both columns are present and nullable, all 3,516 existing team rows still
have NULL values in both new fields, and existing athlete rows remain unchanged. No data backfill, FK
relaxation, policy change, compatibility-view rewrite, or placeholder retirement occurred.

## Dual-read checkpoint — 2026-09-03

The shared conservative identity resolver, active TFRRS and TrackScoreboard team readers, and
frontend result/relay display paths now select the new fields and use `team_name` when present,
while retaining the existing school aliases as fallback.
Legacy helper maps are non-overwriting as well, so a future explicit name cannot be replaced by a
later school alias with the same normalized key.
The resolver test suite passes 12/12. Because every existing `team_name` is still NULL, this
changes no current match and is safe to deploy ahead of any reviewed backfill.

The existing `public.teams_summary` view was then updated in place to use
`COALESCE(t.team_name, s.official_name)` while keeping its original eight-column contract. The
live view still returns 3,516 rows, with zero display-name changes, and migration
`20260903212617_teams_summary_prefers_explicit_affiliation` is recorded as applied.

## Required next steps after applying

1. Reconcile any remaining repository/production migration-history drift before applying additional
   migrations.
2. Audit the remaining legacy roster/import helpers for explicit-affiliation reads before any
   future backfill; no write path is authorized yet.
   without changing old fields.
3. Add fixtures/tests for collegiate, club, scholastic, international, open, unattached, and
   school-linked historical cases.
4. Begin a reviewed dual-read/dual-write rollout. No backfill is part of this first wave.

The first reviewed backfill cohort was subsequently applied as a separate migration
(`20260904004321_backfill_reviewed_explicit_team_affiliations`) with seven private before-images
and exact-row postcondition checks. The remaining teams are not implicitly classified.
