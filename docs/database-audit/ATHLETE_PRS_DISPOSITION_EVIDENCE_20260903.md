# `athlete_prs` disposition evidence — 2026-09-03

## Live counts

| Surface | Rows | Distinct athletes | Event identity |
| --- | ---: | ---: | ---: |
| `public.athlete_prs` (scraped cache) | 475,523 | 77,361 | 254 raw `event_name` values |
| `public.v_athlete_prs` (computed view) | 851,775 | 115,403 | 64 canonical `event_type_id` values |

In the scraped table, 466,965 rows (98.2%) have both `set_at` and `meet_name` NULL. The table has
no `event_type_id` or environment column, so it cannot express the canonical PR bucket used by the
computed view. The computed view derives best marks from `results` and separates event type and
environment, but its points parsing and missing-source coverage still require validation.

## Active code dependencies

- The frontend’s `getAthletePRs` already reads `results` and computes a client-side best-mark map;
  it does not read the scraped table directly.
- Reviewed Athletic.net identity/PR tools still read and write `public.athlete_prs`.
- TFRRS PR import/backfill and health-check scripts still read/write the table.
- `frontend/types/database.ts` still exposes the table as a public API type.

## Disposition

Do **not** drop or truncate `athlete_prs` now. The existing computed-view migration records a
validated sample in which the scraped cache contained career-best pairs not reproducible from
currently imported results. Those rows are evidence of missing meet/result ingestion, not proof that
the cache is disposable.

The safe path is:

1. Keep the table read-only to public clients and preserve its rows.
2. Inventory the scraped-only pairs against source provenance and missing results.
3. Migrate all writers to a reviewed provenance path and all readers to the computed authority (or a
   documented union during transition).
4. Reconcile or backfill source gaps, compare counts/checksums, and archive before-images.
5. Retire the table only after a full-season comparison and rollback test prove no unique evidence is
   lost.

No PR rows, policies, or schema objects were changed by this review.
