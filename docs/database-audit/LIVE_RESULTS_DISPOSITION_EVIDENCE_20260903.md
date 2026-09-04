# `live_results` disposition evidence — 2026-09-03

## Live database evidence

- Rows: **48**.
- Oldest `created_at`: 2025-12-02 22:26:14 UTC.
- Newest `created_at`: 2025-12-02 23:36:40 UTC.
- All 48 rows are `is_processed = false`, `is_final = false`, and `result_type = 'live'`.
- All 48 lack `athlete_id`, `team_id`, and `meet_id`.
- `public.unprocessed_live_results` also exposes the same 48 rows as a compatibility view.

This is stale, unlinked live-ingest data—not finalized canonical performance facts. It is not safe
to silently fold it into `results`, because no canonical athlete, team, meet, or provenance link is
present.

## Application evidence

The frontend has active readers (`database-supabase.ts` and `useLiveResults.ts`). Live and final
scraper paths still write/update this table, and reviewed identity tools count rows in it while
merging athletes. The generated frontend type still includes the table and its old `entry_id`
relationship, even though the live database no longer has that column.

## Safe disposition

Assign `live_results` **isolate and retire after lifecycle migration**:

1. Define the active live-ingest owner and retention window; stop treating stale unlinked rows as
   canonical results.
2. Migrate active readers/writers and the compatibility view to the chosen lifecycle surface.
3. Archive the exact 48 before-images (including raw marks, source URL, and timestamps) behind a
   private service-role boundary.
4. Re-run the zero-link and row-count checks, then remove the table/view only in a separate migration
   with exact-structure rollback SQL.

No row, table, policy, or view was changed by this evidence packet.

## Lifecycle checkpoint — 2026-09-04

The live table was rechecked after the schema cleanup wave: it still contains exactly 48 rows from
one meet URL, all created and scraped on 2025-12-02. All remain `is_processed = false`,
`is_final = false`, `result_type = 'live'`, with zero athlete, team, or meet links. The
`unprocessed_live_results` view still projects those same rows.

Repository workflow inspection found no scheduled invocation of the live or final scraper paths;
however, the `scrapers` package still exposes manual `live` and `final` commands, and compatibility
read/write code remains in the repository. Because an external/manual caller cannot be ruled out,
no rows were moved or deleted. The table remains **held for lifecycle ownership and a replacement
contract**.

## Lifecycle checkpoint — 2026-09-04 (schema and policy recheck)

The live relation still has 48 rows. Its current contract is 22 columns (the dropped ordinal is the
historical `entry_id` position), including `team_name`, `is_final`, `meet_id`, and `result_type`.
All 48 rows remain `result_type = 'live'`, `is_processed = false`, and `is_final = false`, with
zero athlete, team, or meet links. They still point to one meet URL and span only the 2025-12-02
capture window.

`public.live_results` has RLS enabled with one broad SELECT policy for `anon` and `authenticated`.
The `public.unprocessed_live_results` compatibility view is not itself RLS-enabled and currently
projects only the older column subset (`live_result_id` through `updated_at`), omitting
`team_name`, `is_final`, `meet_id`, and `result_type`. This is a contract gap to resolve during
lifecycle migration; it is not a reason to mutate the stale rows now.

The relation still has separate indexes for date, event, final/processed state, meet URL/ID,
scrape time, and result type. No index change is authorized until the replacement owner and query
workload are identified.

## Replacement-contract draft — 2026-09-04

Repository tracing found no frontend import of `useLiveResults` and no caller of
`getTopPerformances()`; the shipped app's current meet and performance reads use the canonical
`results`/`relay_results` paths. The remaining dependencies are manual `live`/`final` scraper
commands, documentation, cleanup/identity tools that count or move rows, and the meet-link
classifier that uses `live_results` as a timing-platform label. No scheduled invocation was found.

The safest replacement boundary is therefore the existing private ingest layer, not another public
copy table:

- future live capture should be owned by an explicit ingest run and retain raw payloads/source
  links in `ingest.source_records`/`ingest.observations` before any promotion;
- finalized individual and relay facts should be promoted through the canonical `results` and
  `relay_results` writer contract;
- public frontend reads should remain on canonical facts, with live state treated as an explicitly
  private/operational concern if the feature returns;
- `live_results` retirement waits until manual writers and tooling references are removed or
  migrated, the retention window is approved, and a before-image/rollback test passes.

This is a contract draft, not an authorization to retire the table. It deliberately reuses the
existing private evidence surfaces and does not propose a new table.

## Dependency inventory — 2026-09-04

The live catalog and repository were rechecked together:

- The database has exactly one dependent view, `public.unprocessed_live_results`; no dependent
  materialized views, functions, or user triggers were found. The view is a compatibility
  projection and omits the newer lifecycle columns (`team_name`, `is_final`, `meet_id`, and
  `result_type`).
- RLS is enabled with only `live_results_public_read` for `anon`/`authenticated` (`SELECT USING
  (true)`). Those roles have no write grants. `service_role` and `postgres` retain the write
  privileges used by controlled/manual tooling.
- The scheduled GitHub workflow runs `scrapers/meets/update_meet_status.js` only. It does not
  invoke the live or final result writers. The live path in `backend/scripts/smart_meet_scraper.js`
  is explicitly `live_scraper_not_implemented`; completed-meet routing and the standalone
  `scrapers/live`/`scrapers/final` commands remain manually callable.
- Repository references remain in the legacy frontend hook/service definitions, backend live
  investigation/query/monitor scripts, the `scrapers/live` and `scrapers/final` writers, and
  reviewed identity/cleanup tools that count or move legacy rows. No current shipped frontend
  caller was found.

This closes the dependency-inventory portion of the gate. Retirement is still held because those
manual writers/tools and the 48 stale rows need an owner-approved migration and retention decision.

## Product-priority checkpoint — 2026-09-04

Live in-meet tracking is not currently in use and is not a present product priority. The safe
decision is therefore to **defer** the replacement/retirement work: preserve the 48 rows, the
compatibility view, and the existing permissions exactly as they are; do not add a replacement
table; and reopen the lifecycle migration only when live tracking returns to active development.
This is a prioritization decision, not permission to delete or reinterpret the stale rows.
