# Affiliation foundation migration — 2026-09-03

## What is ready

Migration `20260903180000_add_explicit_team_affiliation_fields.sql` adds two nullable columns to
the existing `public.teams` table:

- `team_name`: explicit competition-affiliation display label;
- `team_type`: reviewed category constrained to `collegiate`, `club`, `scholastic`,
  `international`, `open`, `unattached`, or `other`.

The migration deliberately does **not** create a new table, populate or move rows, change existing
foreign keys, change RLS/policies, rewrite compatibility views, or retire school 1835. Existing
readers continue to use the old school-derived display until the dual-read step is implemented.

## Application checkpoint — 2026-09-03

The exact migration SQL was first executed against the live database inside a transaction and rolled
back. It was then applied transactionally and recorded in the live ledger as
`20260903180000_add_explicit_team_affiliation_fields`.

Verification confirmed both columns are present and nullable, all 3,516 existing team rows still
have NULL values in both new fields, and existing athlete rows remain unchanged. No data backfill, FK
relaxation, policy change, compatibility-view rewrite, or placeholder retirement occurred.

## Required next steps after applying

1. Reconcile any remaining repository/production migration-history drift before applying additional
   migrations.
2. Update compatibility readers (`teams_summary`, frontend types, and scraper team lookups) to use
   `COALESCE(team_name, schools.official_name)` and expose `team_type` without changing old fields.
3. Add fixtures/tests for collegiate, club, scholastic, international, open, unattached, and
   school-linked historical cases.
4. Begin a reviewed dual-read/dual-write rollout. No backfill is part of this first wave.
