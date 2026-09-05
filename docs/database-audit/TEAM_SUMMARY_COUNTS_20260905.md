# API-01b: count athletes, not athlete-season rows

`teams_summary.athlete_count` used `count(ats.athlete_id)` across all stored seasons. A person with
two team-season records counted twice. The read-only census confirmed overcounts on 1,795 teams,
totaling 34,659 excess counts. Those affiliation rows are legitimate history, not duplicates to delete.

Applied `20260905190400_count_distinct_team_summary_athletes`: the existing view now uses
`count(DISTINCT ats.athlete_id)`. Names, groupings and column types remain unchanged. The replacement
also explicitly uses invoker security. No public grant was added: anon/authenticated still cannot
read this view; service_role can. Repo search found generated type references, not runtime frontend
reads, so no UI update is claimed.

Meaning: unique athletes associated with a team across the stored seasons. This is **not** a
current-season roster size and does not infer active membership. Empty teams return zero. Per-season
roster queries remain separate. Historical affiliations, transfers and original season codes are kept.

Verification: all 3,516 live team counts match an independent grouped affiliation query, with zero
mismatches. All 127,357 affiliation rows remain (same count before/after); this DDL issued no DML.
The fixture demonstrates one athlete/two seasons gives one athlete, empty team zero, service-role
read works, public access remains absent, and rollback restores the former count without removing
history. All 19 PostgreSQL tests pass (18 scenarios plus parent).

The pre-change SELECT is preserved in `rollback_team_summary_count_20260905.sql`; its DDL rollback
is tested in an isolated transaction and keeps invoker security. No live rollback or affiliation
rewrite occurred. Existing schema archives remain available. No new table, column or index was
needed. Targeted migration application did not execute held or unrelated migration files.
