# Reliable wide-table profiling

The existing aggregate-only quality scan used one `jsonb_build_object` call with two arguments
per column. A 70-column isolated fixture reproduced PostgreSQL error 54023, “cannot pass more
than 100 arguments to a function.” The scan now combines small per-column JSON objects while
retaining a single aggregate scan per table.

The regression profiles 70 columns and two synthetic rows, verifies exact null/empty counts,
and verifies that fixture row text is not present in the returned metrics. All 21 PostgreSQL
tests pass (20 scenarios plus parent). This is a tooling fix, not a new production-data scan.

Grain: one metric row per ordinary-table column in `public`/`ingest`. `distinct_values` remains
NULL because it is unmeasured, not because the column has no values. Archive/platform schemas,
partitioned parents and views are outside this script's current scope. Nullness alone never
authorizes removal: optional source attributes and partial historical coverage can be valid.

Severity: medium audit-reliability issue; reproduced with high confidence. No live data or schema
changed; revert this checkpoint to roll back tooling. The data-quality skill informed explicit
grain, scope and missingness limitations. The checked-in SQL and regression test are the
inspectable engineering artifacts; no separate dashboard or notebook is needed for this fix.
