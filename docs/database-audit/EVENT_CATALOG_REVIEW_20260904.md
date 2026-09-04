# Event catalog and alias review — 2026-09-04

## Scope

This is a read-only production review of the canonical `public.event_types` catalog and
`public.event_aliases` map. It validates the event layer shared by individual results, relay
parents, and multi-event rows. No event rows, aliases, policies, tables, or constraints were
changed.

The reproducible query set is `docs/database-audit/event_catalog_scan.sql`.

## Live evidence

| Measure | Rows |
| --- | ---: |
| Canonical event types | 67 |
| Event types missing category | 0 |
| Event types missing measure | 0 |
| Event types missing environment scope | 0 |
| Raw aliases | 1,329 |
| Distinct normalized alias names | 1,288 |
| Alias rows without an event type | 0 |
| Event types represented in aliases | 67 |

The catalog covers sprint, distance, hurdle, jump, throw, walk, steeple, cross-country, relay,
multi-event, and an explicit `other` category. Every canonical row has a non-null `category`,
`measure`, and `environment_scope`; the environment values are constrained to
`indoor_only`, `outdoor_only`, `xc`, or `both`.

All 46 raw labels recorded by the unmapped-event telemetry now exact-match this alias map. Alias
duplicates are case-only or capitalization variants that point to the same `event_type_id` (for
example, `Mile`/`MILE` and `Discus`/`discus`). They are not conflicting mappings. The raw alias key
remains case-sensitive for source preservation; normalizing or deleting those variants is not
needed for current resolution.

Every event type is used by at least one canonical fact surface. Two low-volume types are relay-only
(`Mixed 4x400m` and `4x1000m`); they have zero individual rows but valid relay rows and aliases. The
multi-event types (`Heptathlon`, `Decathlon`, `Pentathlon`) retain points semantics; their component
row handling is governed by the separate multi-event review and does not require a second event
catalog.

## Constraints and access boundary

- `event_types.code` is unique and `event_type_id` is the primary key.
- `event_aliases.raw_name` is the primary key and every alias has a foreign key to `event_types`.
- Both tables are public-readable through SELECT-only policies; no public write policy was added.

## Design conclusion

The event catalog is coherent and already acts as the canonical identity layer. The duplicate-looking
aliases are harmless source spelling variants, and the raw labels should remain for provenance. Do
not add an `events` replacement table, a duplicate canonical-event column, or a bulk alias cleanup.
The remaining event work is limited to source-aware policy for new labels and the future normalized
multi-event parent/component model documented separately.

## Next gate

Keep the existing alias join authoritative while meet/source lineage is reviewed. If a new source
label appears, add a reviewed alias only after its canonical category, measure, and environment scope
are proven; preserve the raw observation and test both individual and relay readers.
