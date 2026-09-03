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

## Verification

The exact migration SQL was executed against the live database inside a transaction and rolled back.
After rollback:

- `public.teams` still has 3,516 rows;
- neither new column exists in the live schema;
- no production data or schema change remains.

## Required next steps before applying

1. Reconcile the repository/production migration-history drift so this migration is applied through
   the normal controlled path.
2. Update compatibility readers (`teams_summary`, frontend types, and scraper team lookups) to use
   `COALESCE(team_name, schools.official_name)` and expose `team_type` without changing old fields.
3. Add fixtures/tests for collegiate, club, scholastic, international, open, unattached, and
   school-linked historical cases.
4. Apply only the additive columns, verify policies/FKs/counts, and then begin a reviewed dual-write
   rollout. No backfill is part of this first wave.

No live migration was applied by this checkpoint.
