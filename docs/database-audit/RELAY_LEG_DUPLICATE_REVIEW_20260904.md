# Relay leg duplicate review — 2026-09-04

## Scope

This is a read-only production review of repeated `(relay_result_id, athlete_id)` groups and
conflicting relay-leg TFRRS athlete IDs. It follows the team/relay identity checkpoint and keeps
the paused 4×100 reconciliation out of scope. No rows, policies, tables, constraints, or
migrations were changed.

The reproducible query set is
`docs/database-audit/relay_leg_duplicate_scan.sql`.

## Live evidence

### Repeated athlete groups

| Measure | Rows |
| --- | ---: |
| Repeated `(relay_result_id, athlete_id)` groups | 459 |
| Extra rows represented by those groups | 459 |
| Groups with exactly two distinct leg slots | 459 |
| Exact `(relay_result_id, athlete_id, leg_order)` duplicate groups | 0 |
| Exact duplicate extra rows | 0 |
| Repeated-group rows with a non-empty TFRRS athlete ID | 12 |
| Repeated-group rows with a non-empty athlete name | 24 |

Every repeated group is therefore the same internal athlete attached to two different leg slots,
not two identical rows in the same slot. The most common pairs are `{1,2}` (182 groups), `{3,4}`
(93), `{5,6}` (38), and `{2,3}` (27). The remaining 119 groups use other slot pairs, including
non-adjacent positions. This shape is consistent with a source-list/leg-position anomaly or a
legitimate repeated listing; the canonical tables do not contain enough source context to choose
between those explanations.

### Conflicting relay source IDs

| Bucket | Relay rows | Source IDs | Parents | Meets | First date | Last date | Name mismatches |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: |
| Canonical match | 214 | 96 | 208 | 127 | 2020-02-14 | 2026-06-13 | 2 |
| Canonical mismatch | 300 | 96 | 289 | 207 | 2025-12-04 | 2026-06-13 | 9 |

The 96 conflicting source IDs occur across 514 relay-leg rows. Each source ID appears on at least
two parents and at most 14 (average 5.35), so this is not an isolated one-row duplicate pattern.
One internal athlete matches the canonical `athletes.tfrrs_athlete_id` for each source key, while
the other does not. Relay legs do not currently retain a direct source-record ownership key, so
the match signal cannot prove that the mismatch rows should be reassigned.

### Provenance coverage

| Cohort | Parents | Parents with linked source record | Parents with insert observation |
| --- | ---: | ---: | ---: |
| Repeated-athlete groups | 296 | 0 | 0 |
| Conflicting source-ID groups | 497 | 77 | 75 |

The 77 source-linked conflict parents each have one TFRRS source record with four payload legs
(308 payload legs total). Every payload leg agrees with the stored relay row on leg order, source
athlete ID, and display name. Of those 308 comparisons, 301 also retain the payload's internal
`athlete_id`; four use a different internal athlete row and three have no canonical `athlete_id`
at all. Two of the four internal-ID mismatches have a current canonical athlete row for the source
ID and matching name; the other two source IDs have no current canonical athlete row. These are
bounded repair candidates, not permission to bulk-reassign the 300 mismatch legs.

The 459 repeated rows remain completely outside the private source-link layer (their 296 parents
have neither a linked source record nor an insert observation). They cannot be source-verified from
the current provenance tables.

## Decision

No cleanup write is authorized from these counts:

- Do not delete the 459 repeated rows; none are exact same-slot duplicates.
- Do not collapse adjacent leg slots; the source may have listed a person more than once or the
  importer may have shifted positions.
- Do not reassign the 300 mismatch legs to the matching athlete without source payload ownership,
  source date/meet evidence, and a before-image/rollback map.
- Do not add a relay-specific table or identity column merely to hold this review state.

The safe next evidence gate is to review the 77 source-linked conflict parents and the four
internal-ID mismatch legs with before-images and a deterministic target check. The 459 repeated
rows have no source link and remain preserved; they require source recovery or an importer-level
fix before they can be classified. Until either mapping exists, the application should continue
reading all rows as stored facts.

## Relationship to the broader schema cleanup

This review does not change the relay model, team affiliation model, athlete profiles, or the
paused 4×100 queue. It narrows the cleanup decision: the current anomaly is identity/provenance
ambiguity, not a proven duplicate-row defect. Any future importer fix must be separately tested
against source payloads and must not rewrite historical rows without an explicit rollback plan.
