# Team and relay identity review — 2026-09-04

## Scope

This is a read-only production review of `public.teams`, `public.relay_results`, and
`public.relay_athletes`. It is the next identity wave after the school and athlete scans. The
paused 4×100 reconciliation is out of scope; no rows, policies, tables, or constraints were
changed.

The reproducible query set is
`docs/database-audit/team_relay_identity_scan.sql`.

## Live evidence

### Teams

| Measure | Rows |
| --- | ---: |
| Team rows | 3,516 |
| Rows with no `team_name` | 3,509 |
| Rows with no `team_type` | 3,509 |
| TFRRS URLs | 3,181 |
| Athletic.net URLs | 0 |
| Active / inactive | 3,221 / 295 |
| Teams with individual results | 2,922 |
| Teams with relay parents | 2,721 |
| Teams with neither fact type | 586 |
| Teams whose `school_id` does not resolve | 0 |

The seven explicit rows are the previously reviewed cohort: Academy of Art (M/F), Alliant
International (M/F), Dawgs Track Club (M), and Unattached (M/F). The remaining 3,509 rows are
legacy school-backed teams. Their display name is supplied through `schools.official_name` by the
existing dual-read path; copying that value into `team_name` would duplicate canonical school data
without adding identity evidence.

`team_type` currently contains only `collegiate` (4), `club` (1), and `unattached` (2); every
other row is untyped. The live check found no duplicate normalized TFRRS URL, no duplicate
Athletic.net URL, and no duplicate normalized `team_name` under the same `(school_id, gender)`.

### Relay parents and legs

| Measure | Rows |
| --- | ---: |
| Relay parents | 200,736 |
| Relay legs | 450,685 |
| Legs without `athlete_id` | 3,359 |
| Legs without parent | 0 |
| Legs without `leg_order` | 0 |
| Legs with nonpositive `leg_order` | 0 |
| Legs without `athlete_name` | 292,225 |
| Legs without `tfrrs_athlete_id` | 317,475 |
| Parents with at least one leg | 197,002 |
| Parents with legs but no `team_id` | 29,265 |
| Parents with legs but no `meet_id` | 22,859 |
| Parents with no `event_type_id` | 0 |
| Parents with missing `mark_raw` | 327 |
| Parents with missing `date` | 11,153 |

Only two `(relay_result_id, leg_order)` duplicate groups were found. A separate source review found
459 `(relay_result_id, athlete_id)` repeat groups (459 extra rows); those include source patterns
where the same person is listed twice or where source IDs/names conflict. They are review candidates,
not safe duplicate deletions. No parent-level duplicate partition remained under the existing
identity index for linked meet/team rows.

### Relay source-ID conflicts

Ninety-six non-empty TFRRS athlete source IDs are attached to two internal `athlete_id` values in
the relay-leg table. In every one of those 96 cases, one internal row has a matching canonical
`athletes.tfrrs_athlete_id` and one does not. The cohort contains 214 relay legs on the canonical
match side and 300 legs on the mismatch side. The mismatch legs were created between February and
June 2026; the matching duplicate rows were created from August through September 2026. This is a
strong review signal for an importer/identity-resolution issue, but it is not proof that the older
legs can be reassigned: TFRRS profile history and source meet context still need to be checked.

## Constraints and access boundary

- `teams` has a validated foreign key to `schools`, a `gender IN ('M','F')` check, a typed-affiliation
  check, and `UNIQUE (school_id, gender)`.
- `relay_results` has foreign keys to `meets`, `teams`, and `event_types`; its meet/team links are
  nullable by design for historical or unresolved rows.
- `relay_athletes` has foreign keys to `relay_results` (`ON DELETE CASCADE`) and `athletes`; its
  parent link is currently complete, while the athlete link remains nullable.
- All three tables are public-readable through their existing SELECT policies. No public write
  policy was added or changed.

## Design conclusion

The current model is internally coherent for school-backed teams and relay-parent/leg facts, but it
cannot yet represent multiple independent affiliations that share one school row: `school_id` is
mandatory and `(school_id, gender)` is unique. The seven non-collegiate rows currently work by using
dedicated school-shaped placeholders. This is evidence for the target-schema decision; it is not a
reason to create a new table immediately.

Do not:

- bulk-fill `team_name` from `schools.official_name`;
- merge team rows by display name, school name, or gender alone;
- delete the 586 teams without facts;
- delete the 459 repeated athlete legs or the two duplicate leg-order groups;
- make team URLs globally unique until source scope and historical redirects are reviewed;
- relax `teams.school_id` or drop the `(school_id, gender)` key before code/read-path and affiliation
  evidence are complete.

## Next gate

Review the 459 repeated athlete-leg groups and the 96 relay TFRRS-source-ID conflicts in bounded
source batches, then quantify the non-collegiate team population from source observations. Only then
decide whether nullable organization links, alias rows, or a generalized affiliation dimension are
required. Any reassignment or schema change must have a before-image, rollback SQL, invariant checks,
and a reader/writer migration plan.
