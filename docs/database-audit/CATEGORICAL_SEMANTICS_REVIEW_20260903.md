# Categorical semantics review — 2026-09-03

This read-only profile evaluates the live values used to describe affiliation, meets, events,
seasons, environments, and rounds. The goal is to distinguish real domain categories from scraper
vocabulary drift.

## Affiliation values

`schools.division` currently contains DIII (440), DI (362), DII (318), NJCAA (262), NAIA (246),
Other (129), CCCAA (28), and one NULL. This is a useful collegiate classification, but `Other`
must not become a catch-all for clubs, high schools, countries, and unattached identities without a
separate affiliation policy.

`meets.level` is populated only for `college` (1,692 rows); 11,281 meets are NULL. The field is not
currently a reliable description of meet level and should not be used to infer athlete/team type.

## Meet status and source state

- `meets.status`: 12,716 `completed`, 254 `upcoming`, 3 `live`.
- `meets.results_status`: 10,662 `pending`, 1,998 `missing_tfrrs_url`, 262 `imported`, 29
  `no_results_at_source`, and 22 `tfrrs_available`.
- `meets.results_source`: 11,834 `tfrrs`, 95 `athletic_net`, 2 `timing_site`, 2 `manual`, and
  1,040 NULL.

These are different axes (meet lifecycle, result recovery state, and source). They should remain
separate, but their allowed values and transition rules need to be documented and enforced.

## Season vocabulary

The database contains canonical-looking labels such as `Indoor 2026`, `Outdoor 2026`, and `XC 2025`
alongside inconsistent values such as `indoor`, `Summer 2026`, and older historical seasons. Season
is a cross-year domain concept and should not be inferred from a calendar year or free-text spelling.
The target plan must define one canonical season policy and a migration map for every existing value.

## Event catalog

The live `event_types` catalog has 67 rows spanning sprint, distance, hurdle, jump, throw, walk,
steeple, relay, multi, and XC categories with explicit measures and environment scopes. This is a
strong foundation. Remaining design work includes:

- reviewing the `Other (uncommon)` catch-all;
- validating mixed relay types and environment scopes;
- keeping source aliases in `event_aliases` rather than adding new event types for spelling drift;
- modeling multi-event components separately from aggregate points.

## Result environment and rounds

Result environments are outdoor (1,419,130), indoor (1,362,923), XC (378,604), and NULL (258,521).
The NULL population needs source/meet/event classification before any NOT NULL constraint is
considered.

Round values are fragmented: NULL (1,247,067), `Final` (1,096,774), `Finals` (775,943), `Prelim`
(178,641), `Preliminaries` (90,358), plus numbered heats and semifinals. The target model needs a
canonical round vocabulary and an explicit policy for whether round participates in result identity.
Normalization must preserve the original raw round text for provenance.

## Disposition

No categorical values were rewritten by this review. The next step is a value-by-value mapping table
with source evidence, affected row counts, proposed canonical value, and an explicit “preserve raw /
quarantine / migrate” action for ambiguous values.
