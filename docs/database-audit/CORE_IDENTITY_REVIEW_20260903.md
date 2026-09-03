# Core identity and linkage review — 2026-09-03

This is a fresh read-only review of the current live `public` dimensions. Collision counts are
candidate populations, not proof that rows represent the same real-world entity.

## Current dimension posture

| Dimension | Rows | Important nullable fields |
| --- | ---: | --- |
| `schools` | 1,786 | 130 lack division, 666 lack region, 585 lack current conference |
| `teams` | 3,516 | all have a school and gender |
| `athletes` | 151,537 | 31,211 lack gender; all have a school |
| `meets` | 12,973 | source URL and source-status fields are sparse/role-specific |

## Candidate collision populations

| Candidate key | Groups | Extra rows | Interpretation |
| --- | ---: | ---: | --- |
| normalized school official name | 71 | 115 | broad collision set; state/source IDs and dependent facts required |
| school + team gender | 0 | 0 | no duplicate team pair on the current key |
| athlete normalized name + school | 6,549 | 9,884 | includes legitimate same-name people; only a reviewed subset is mergeable |
| normalized meet name + date | 0 | 0 | no exact duplicate on this coarse key |
| duplicate TFRRS meet URL | 10 | 13 | source-identity duplicate candidates |
| duplicate Athletic.net results URL | 5 | 5 | source-identity duplicate candidates |
| duplicate generic meet URL | 16 | 34 | source-identity duplicate candidates |

The previously reviewed high-confidence athlete set (667 pairs) is therefore a deliberately narrow
subset of the much larger 6,549 name/school collision population. The same principle applies to
school names and meet URLs.

## Safe interpretation

- Missing `team_id` or `gender` can represent valid unattached/history data, but the reason must be
  explicit before constraints are tightened.
- School-name matches require state, city, source IDs, teams, athlete history, and result
  provenance; names alone are insufficient.
- Athlete-name matches require source identity, date/team continuity, and contradictory-evidence
  checks; name + school is only a candidate key.
- Meet URL duplicates require source-record comparison and result overlap analysis before choosing a
  canonical meet.

No identity merges or deletes were performed by this review. The output feeds the target-model
disposition and future reversible dry-runs.
