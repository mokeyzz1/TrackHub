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
