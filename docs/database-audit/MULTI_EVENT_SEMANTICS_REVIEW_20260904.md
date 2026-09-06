# Multi-event semantics review — 2026-09-04

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

This is a read-only evidence packet. It records why multi-event rows must not be rewritten or
ranked as ordinary point performances until component semantics are modeled explicitly.

## Live catalog

The canonical event catalog correctly classifies `Decathlon`, `Heptathlon`, and `Pentathlon` as
`category = 'multi'` and `measure = 'points'`. That event-level classification is appropriate for
an aggregate score, but it is not sufficient to classify every row currently stored under those
event types.

## Live fact evidence

The live semantic query joined every `results` row to `event_types` and counted typed measures:

| Canonical event | Rows | `mark_seconds` present | `mark_meters` present | Raw integer marks | Raw non-integer marks |
| --- | ---: | ---: | ---: | ---: | ---: |
| Heptathlon | 42,798 | 17,425 | 17,048 | 8,002 | 34,796 |
| Decathlon | 23,863 | 9,488 | 10,707 | 3,382 | 20,481 |
| Pentathlon | 21,344 | 7,200 | 8,896 | 5,061 | 16,283 |
| **Total** | **88,005** | **34,113** | **36,651** | **16,445** | **71,560** |

In total, **70,764** multi-event rows carry a typed time or distance despite their canonical
event measure being `points`. Sample live rows include `Heptathlon` marks such as `3:31.26` and
`17.84m`, alongside aggregate rows such as `3761` and `3603`, under the same `event_type_id`.

This is not evidence that the rows are corrupt. It is evidence that the current event-type key
collapses an aggregate multi-event result and its component performances into one semantic bucket.

## Safe product/database rule

Until a component model exists:

1. Treat only numeric aggregate point marks whose typed fields are both NULL as candidate
   multi-event scores.
2. Keep component-like rows in the canonical fact table with their raw mark and provenance; do not
   delete, overwrite, or coerce them into points.
3. Exclude component-like rows from point leaderboards, aggregate PR calculations, and any ranking
   that assumes `mark_raw` is a points total.
4. Preserve the current `event_type_id` and raw values while source evidence is reviewed.

This rule is intentionally conservative. It prevents a `2:17.18` component from being treated as
2.1718 points or a `17.84m` component from being treated as an aggregate score.

## Product decision recorded — 2026-09-04

The source/database values are authoritative. The application must display the supplied overall
multi-event score and supplied component marks/scores as-is; it must not recalculate event points,
re-rank components, or manufacture a missing score. For duplicate supplied aggregate rows in the
same event instance, the read path may select the highest supplied Finals score as the displayed
overall value. This is selection of an existing source value, not scoring math.

The immediate correction belongs in the existing read/UI path because the current rows already hold
the aggregate score but the screen renders aggregate and component facts as one flat list. A
dedicated multi-event definition/component table remains an allowed future improvement, but only
after the whole-schema audit confirms the parent key, fixed component order, source-score fields,
provenance, and rollback plan. Adding a table is not required to make the immediate score display
correct.

## Required next gate

The target model needs a component instance/leg representation tied to the parent multi-event
result, with a documented source mapping for each component event. Before any data migration:

- inventory source links and raw labels for aggregate versus component rows;
- define parent/result identity and component ordering;
- quantify rows that can be assigned deterministically;
- archive before-images and prepare exact rollback SQL;
- add invariant tests proving aggregate scores and component marks remain distinct.

No schema, data, policy, or index change is included in this review.
