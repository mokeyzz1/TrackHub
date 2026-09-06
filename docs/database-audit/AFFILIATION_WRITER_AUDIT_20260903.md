# Affiliation writer audit — 2026-09-03

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

## Scope

This audit searched the repository for runtime and migration writes targeting `public.teams`.
Read-only selectors and the paused 4×100 reconciliation path were reviewed separately from writers.

## Findings

There are no active application paths that insert or update `public.teams`. The only repository
writers are three reviewed migrations:

| Migration | Operation | Guard / limitation |
|---|---|---|
| `20260820055613_california_junior_college_team_entities.sql` | Inserts M/F teams for a fixed list of California junior colleges; enriches missing TFRRS URLs | Requires an existing canonical school; does not overwrite an existing URL |
| `20260829090000_add_cccaa_and_missing_junior_college_teams.sql` | Inserts M/F teams for additional junior colleges; enriches missing TFRRS URLs | Requires an existing canonical school and `NOT EXISTS` team/gender guard |
| `20260829110000_add_lai_puerto_rico_team_entities.sql` | Inserts M/F teams for reviewed Puerto Rico entities | Requires an existing canonical school and `NOT EXISTS` team/gender guard |

All three writers are school-backed and predate the explicit affiliation fields. None writes
`team_name` or `team_type`; this is safe because the new fields are nullable and currently empty.

## Current decision

Do not add a generic runtime team creator. Future non-collegiate affiliations should be created by
an owner-reviewed, idempotent workflow that requires source evidence, explicit `team_type`, a
stable source key or alias, and a rollback/archive record. Existing school-backed team creation
must remain unchanged until that workflow is designed and tested.

## Verification boundary

The dual-read rollout now covers the shared resolver, TFRRS readers, TrackScoreboard promotion,
frontend result/relay displays, and `teams_summary`. No dual-write or backfill was performed.
