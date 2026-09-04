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

## Authority checkpoint — 2026-09-04

A fresh read-only count before the view fix found the same broad split: `athlete_prs` has 475,523
rows for 77,361 athletes and 246 raw event labels, while `v_athlete_prs` exposes 851,775 derived
rows for 115,403 athletes and 64 canonical event types. The scraped table still has 466,965 rows
with both `set_at` and `meet_name` NULL (98.2%), and it has no `event_type_id` or `environment`
bucket. It remains evidence-bearing, not disposable.

Both surfaces are publicly readable; only `service_role`/`postgres` have write privileges on the
scraped table. The derived view has no stored rows and reads directly from canonical `results`.

The view had one concrete source-semantics defect: its points branch extracted every digit from
`mark_raw`, turning a supplied aggregate such as `6445 (+0.0)` into `644500` and allowing typed
multi-event components to enter the points bucket. A bounded dry run of the replacement logic
keeps 849,385 PR rows, including 6,882 supplied point aggregates, and excludes component rows
whose `mark_seconds`/`mark_meters` are populated. No score is calculated and no source row is
rewritten.

Migration `20260904195352_fix_v_athlete_prs_points_source.sql` was applied as a view-only change;
its rollback is `docs/database-audit/rollback_fix_v_athlete_prs_points_source.sql`. The new logic
accepts only a leading 3–5 digit aggregate token and requires both typed component columns to be
NULL. It also adds `result_id` as a deterministic tie-breaker. The scraped cache remains kept and
its full-season parity/missing-result reconciliation remains held.
