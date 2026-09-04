# Explicit-affiliation backfill candidates — 2026-09-03

## Read-only result

The first candidate scan used only existing `schools.official_name`, `schools.division`, team
gender, and current source metadata. It found seven high-signal team rows:

| Team IDs | Existing school label | Division | Proposed `team_type` | Confidence |
|---|---|---|---|---|
| 3611 (M), 3612 (F) | Unattached | NULL | `unattached` | High |
| 3605 (M) | Dawgs Track Club | Other | `club` | High |
| 713 (M), 714 (F) | Academy of Art | DII | `collegiate` | High |
| 1350 (M), 1351 (F) | Alliant International | NAIA | `collegiate` | High |

The two college pairs are intentionally **not** classified as clubs or unattached merely because
their names contain “Academy” or “International”; their existing NCAA/NAIA division is stronger
evidence. The generic `Other` division is not treated as a category by itself.

## Proposed first batch (not applied)

Populate only these seven rows, using the existing school label as `team_name` and the proposed
typed value above. Before-images should be written to the existing private
`ingest.fact_cleanup_archive` under a unique operation key. The update must require both new
columns to be NULL, assert exactly seven rows changed, and verify the postcondition by team ID.

No athlete, result, relay, school, bridge, policy, or foreign-key rows would be changed. The batch
would be independently reversible from the archive and should be applied only after owner approval.

## Held cohort

All other teams remain unclassified. Division `Other`, missing division, and school names alone are
not sufficient evidence for a typed affiliation. They require source-level review or a dedicated
alias record before any backfill.

## Safety status

This report performed no writes. The seven candidate rows still have `team_name IS NULL` and
`team_type IS NULL` in production.
