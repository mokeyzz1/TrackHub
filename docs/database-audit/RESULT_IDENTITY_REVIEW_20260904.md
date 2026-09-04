# Individual result identity review — 2026-09-04

## Scope

This is a read-only production review of `public.results`. It follows meet identity because a
result key cannot be finalized while meet/source ownership is unresolved. No result rows, links,
indexes, constraints, policies, or tables were changed.

The reproducible query set is `docs/database-audit/result_identity_scan.sql`.

## Live field contract

| Measure | Rows |
| --- | ---: |
| Results | 3,419,178 |
| Missing `athlete_id` | 0 |
| Missing `event_name` | 0 |
| Missing `mark_raw` | 0 |
| Missing `event_type_id` | 0 |
| Missing `team_id` | 401,563 |
| Missing `meet_id` | 562,033 |
| Missing legacy `event_id` | 2,283,713 |
| Missing `date` | 422,761 |
| Missing `meet_name` | 313,152 |
| Missing `season_code` | 3,419,178 |
| Missing `environment` | 258,521 |
| Missing `round` | 1,247,067 |
| Missing `mark_seconds` | 1,067,872 |
| Missing `mark_meters` | 2,542,758 |
| Missing `mark_feet` | 3,121,692 |

`athlete_id`, `event_name`, `mark_raw`, and `event_type_id` form the stable minimum fact shape.
Nullable meet/team/date/round values are measured semantic states (historical, unattached,
unresolved, or source-incomplete), not automatic repair targets. The typed mark columns are
applicability fields: a time result should not be forced to have a distance value, and vice versa.

## Duplicate and constraint evidence

Two valid unique indexes already protect linked meet rows:

- `results_no_exact_duplicate`: `(athlete_id, meet_id, event_type_id, mark_raw, place, round)`;
- `results_no_dup_normmark`: the same key with trailing wind/annotation suffixes normalized.

Both are partial to `meet_id IS NOT NULL`, matching the fact that unlinked rows cannot yet be
assigned a safe meet identity. A full table-wide duplicate GROUP BY was intentionally not used as a
gate because it exceeded the hosted statement timeout. The bounded index validity check is the
authoritative constraint evidence.

For unlinked rows, the contextual duplicate scan found zero groups when athlete, canonical event,
meet-name, date, mark, place, and round all matched. This does not prove that no source-level copy
exists; it means no immediate deletion candidate is produced by the available canonical context.

Status marks (`NT`, `DNS`, `DNF`, `DQ`, `SCR`, `NM`, `FOUL`) are source results and must remain
visible as such. They are not malformed numeric rows to delete or coerce.

## Design conclusion

The result table is a canonical fact surface with a sound minimum identity and existing linked-row
guards. Its unresolved work is parent/source reconciliation and taxonomy policy—not adding another
duplicate results table or making all nullable links mandatory. Keep raw/context fields for
provenance, finish meet identity review first, and only then test any broader fact key across source
boundaries.

## Next gate

Use the meet collision packet to review result ownership for the three byte-equivalent historical
fact sets and the remaining source URL groups. After source lineage is classified, run a bounded
duplicate-partition dry run that includes source/meet/event/round identity and produces an archived,
reversible plan. No fact deletion or reparenting is authorized before that gate.
