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

## `unmapped_events`

- Live rows: **46** distinct raw labels.
- Aggregate `seen_count`: **1,484**; maximum for one label: 172.
- Frequent labels include `5000 M Open`, `1500m Run`, `100 Meter Dash D1 Elite`, `DMR 4000m`, and
  `SMR 1600m`.
- The table has no canonical event-type link, so it is review telemetry rather than a source of
  event semantics.
- Current access is service-role write plus public read policy; the write boundary is correct, but
  retention and resolution status are not yet explicit.

Disposition: keep as private review telemetry, add a reviewed resolution workflow before any alias
promotion, and retain raw labels. Do not delete rows merely because aliases are later added.

No reference or telemetry rows were changed by this review.
