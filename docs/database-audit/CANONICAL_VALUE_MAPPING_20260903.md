# Canonical value mapping plan — 2026-09-03

This mapping defines how the current free-text categorical values should become consistent. It is
planning only; no values were rewritten.

## Seasons

The canonical representation should be a stable code such as `2026_INDOOR`, `2026_OUTDOOR`, and
`2025_XC`, with explicit start/end dates. Existing values map as follows when the year and sport are
unambiguous:

| Current pattern | Canonical direction | Treatment |
| --- | --- | --- |
| `Indoor YYYY` | `YYYY_INDOOR` | deterministic mapping |
| `Outdoor YYYY` | `YYYY_OUTDOOR` | deterministic mapping |
| `XC YYYY` | `YYYY_XC` | deterministic mapping |
| lowercase/alternate capitalization | canonical equivalent | deterministic after case/whitespace normalization |
| `Summer YYYY` | unresolved | review meet dates/source context; do not assume outdoor |
| isolated historical/malformed values | unresolved | preserve raw value and quarantine for mapping |

The raw `meets.season` value remains available during migration. A canonical season value must not
be derived from calendar year alone because indoor seasons span two calendar years.

## Environment

Canonical values are `indoor`, `outdoor`, and `xc`.

- Event types with an exclusive environment scope can be mapped deterministically.
- Shared events require meet-season/date evidence.
- NULL environments remain unresolved until source and meet context supports a deterministic value.
- The original source value is preserved for auditability.

## Rounds

Canonical round values should be structured as `final`, `semifinal`, `prelim`, and `heat`, with a
separate numeric heat/flight value where present. Safe vocabulary mappings include:

| Current values | Canonical value |
| --- | --- |
| `Final`, `Finals` | `final` |
| `Prelim`, `Prelims`, `Preliminaries` | `prelim` |
| `Semifinal`, `Semifinals` | `semifinal` |
| `Heat N` | `heat` + `heat_number = N` |

NULL rounds remain NULL unless the source provides deterministic evidence. Raw round text must be
retained during and after normalization.

## Affiliation and level

`schools.division`, `meets.level`, team identity, and athlete identity are separate concepts. The
following must not be automatic mappings:

- `Other` → club, high school, international, or unattached.
- NULL `meets.level` → non-collegiate.
- A source team label → a canonical school.

Those cases require an affiliation classification backed by source identity and meet context.

## Result source status

The existing `meets.status`, `results_status`, and `results_source` fields should remain separate:

- `status`: meet lifecycle (`upcoming`, `live`, `completed`).
- `results_status`: coverage/recovery state (`pending`, `available`, `imported`, `not_found`,
  `blocked`, or equivalent documented vocabulary).
- `results_source`: provenance (`tfrrs`, `athletic_net`, `timing_site`, `manual`, or NULL).

Allowed values and transition rules must be defined before tightening constraints. Existing values
are preserved until a migration can prove the mapping.

## Event aliases

Source event strings should map to existing `event_types` through `event_aliases`. A new canonical
event type is justified only when the label represents a genuinely different event or measure, not
when it is a spelling, abbreviation, casing, or punctuation variation.

## Mapping gates

Every mapping batch must provide:

1. Current value, canonical value, and affected row count.
2. Source and semantic evidence.
3. A hold bucket for ambiguous values.
4. Before-images and rollback SQL.
5. Post-migration invariant checks and unchanged raw provenance.
