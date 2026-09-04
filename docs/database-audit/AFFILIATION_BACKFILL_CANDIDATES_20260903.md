# Explicit-affiliation backfill candidates — 2026-09-03

## Read-only result

The first candidate scan used only existing `schools.official_name`, `schools.division`, team
gender, and current source metadata. It found seven high-signal team rows:

| Team IDs | Existing school label | Division | Proposed `team_type` | Confidence |
|---|---|---|---|---|
| 3611 (M), 3612 (F) | Unattached | NULL | `unattached` | High |
| 3605 (M) | Dawgs Track Club | Other | `club` | High |
| 713 (M), 714 (F) | Academy of Art | DII | `collegiate` | High |
| 1350 (M), 1351 (F) | Alliant International | NAIA | `collegiate` (historical) | High |

The two college pairs are intentionally **not** classified as clubs or unattached merely because
their names contain “Academy” or “International”; their existing NCAA/NAIA division is stronger
evidence. Alliant’s school row is inactive and currently has no linked athletes/results, so its
label means historical collegiate affiliation, not an assertion that the program is active today.
The generic `Other` division is not treated as a category by itself. Logo metadata is retained as
supporting identity evidence, but never used as the sole type classifier.

## First batch — applied 2026-09-04

Populate only these seven rows, using the existing school label as `team_name` and the proposed
typed value above. Before-images should be written to the existing private
`ingest.fact_cleanup_archive` under a unique operation key. The update must require both new
columns to be NULL, assert exactly seven rows changed, and verify the postcondition by team ID.

No athlete, result, relay, school, bridge, policy, or foreign-key rows would be changed. The batch
would be independently reversible from the archive and should be applied only after owner approval.

The migration was
`supabase/migrations/20260904004321_backfill_reviewed_explicit_team_affiliations.sql`. It was
executed transactionally after approval. Its seven-row precondition, before-image count, update
count, and postcondition assertions all passed. Seven before-images are retained under operation
key `20260904_reviewed_explicit_team_affiliations_v1` in the existing private archive.

## Held cohort

All other teams remain unclassified. Division `Other`, missing division, and school names alone are
not sufficient evidence for a typed affiliation. They require source-level review or a dedicated
alias record before any backfill.

## Safety status

The seven reviewed rows now have explicit values in production. No other team rows were populated;
the remaining population is still held for review.

The Dawgs Track Club school logo association was later removed by the separately approved
`20260904020412_remove_reviewed_dawgs_logo_association` migration. The school, team, athlete, and
result records remain; the complete before-image is in the private archive and the original image
file remains preserved at `scrapers/athletic-net/output/school-logo-backfill/manual_noncollege/1829.png`.
