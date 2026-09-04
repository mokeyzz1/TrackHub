# Reference and telemetry evidence — 2026-09-03

## `conference_memberships`

- Live rows: **0**.
- Schema is a proper school↔conference bridge with required foreign keys and optional start/end
  years.
- Repository search found no active application reader or writer; the table is retained as a
  forward-looking historical model rather than treated as a ghost table.

Disposition: keep structurally, do not populate or drop until conference-history requirements are
defined. An empty M:N table is not harmful by itself.

## `external_ids`

- Live rows: **356** across 355 distinct athlete IDs (one athlete has two source identities).
- All rows have `athlete_id`; all 356 have `school_id`, `team_id`, and `conference_id` NULL.
- Sources: TFRRS 283 rows / 282 athletes, Athletic.net 58 / 58, DirectAthletics 15 / 15.
- All rows are marked `verified = true`; no duplicate `(source, external_key)` groups were found.

This is a working athlete-source identity map, not an unused generic table. The nullable entity
columns are future capacity, not evidence of bad data. Keep it and use it for identity resolution;
do not split it into source-specific tables.

### Reference checkpoint — 2026-09-04

The table still contains **356** verified rows for **353** athletes: 283 TFRRS rows (282 athletes),
58 Athletic.net rows, and 15 DirectAthletics rows. Every row has an athlete link; school, team, and
conference links are all NULL, and 282 external URLs are NULL. No duplicate `(source,
external_key)` groups exist. Three athletes have two source rows (two cross-source pairs and one
athlete with two TFRRS keys); these are identity-review candidates, not automatic merge or delete
targets. The primary key and `(source, external_key)` unique constraint remain appropriate.

Access remains public-read only for `anon`/`authenticated`; writes are not granted to those roles.
No reference identity row or policy was changed by this checkpoint.

## `unmapped_events`

- Live rows: **46** distinct raw labels.
- Aggregate `seen_count`: **1,484**; maximum for one label: 172.
- Frequent labels include `5000 M Open`, `1500m Run`, `100 Meter Dash D1 Elite`, `DMR 4000m`, and
  `SMR 1600m`.
- The table has no canonical event-type link, so it is review telemetry rather than a source of
  event semantics. A current exact-match join against `event_aliases` resolves **all 46** labels
  (1,484 sightings); there are zero currently unresolved labels.
- Current access is service-role-only (RLS policy plus service-role table grants); there is no
  `anon`/`authenticated` read or write grant. The write boundary is correct, but retention and
  resolution status are not explicit columns.

Disposition: keep as private review telemetry and retain raw labels. Treat exact alias matches as
resolved for review purposes, but do not delete rows or add a duplicate canonical link merely
because aliases are later added. A resolution-state column is optional future work only if a
review/retention workflow needs durable state beyond the authoritative `event_aliases` join.

No reference or telemetry rows were changed by this review.
