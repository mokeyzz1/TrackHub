# Application dependency review — 2026-09-03

## Method

The repository was searched for Supabase table calls (`.from('...')`), direct SQL references,
frontend hooks, scraper writers, migrations, and shared ingestion modules. This is a code-level
dependency map, not a claim that every dynamic SQL string can be found by text search; dynamic and
generated references will be checked against the database catalog and tests.

## Relative usage concentration

Direct frontend/scraper `.from()` calls are concentrated in:

| Table | Call sites found |
| --- | ---: |
| `results` | 70 |
| `athletes` | 41 |
| `meets` | 31 |
| `teams` | 13 |
| `relay_results` | 10 |
| `athlete_prs` | 9 |
| `schools` | 7 |
| `relay_athletes` | 5 |
| `live_results` | 4 |
| `unmapped_events` | 3 |
| `event_types` | 2 |
| `events`, `event_aliases`, `waitlist` | 1 each |

This concentration means changes to `results`, `athletes`, `meets`, and relay tables require the
most careful compatibility work. The ingest tables are primarily accessed by controlled scraper,
recovery, and migration code rather than public frontend reads.

## Current contract boundaries

- Frontend reads primarily use `meets`, `results`, `relay_results`, `relay_athletes`, `athletes`,
  `teams`, `schools`, `event_types`, `athlete_prs`, and `live_results`.
- Scrapers and repair tools write canonical facts and dimensions through multiple generations of
  code; these writers must be consolidated or gated before tightening constraints.
- The shared ingestion boundary uses `ingest.runs`, `source_records`, `observations`,
  `source_links`, `quarantine`, aliases, and recovery queues.
- `public.events` is still queried by `frontend/hooks/useMeetDetails.ts` even though it is empty;
  it cannot be dropped until that reader is migrated or removed.
- `public.athlete_prs` is still read by scraper code while `public.v_athlete_prs` is the derived
  replacement; both paths must be reconciled before retiring the scraped table.
- Several frontend paths accept a `meetId` argument but query by copied meet name/date or raw
  event text instead. These are correctness dependencies, not merely style issues.

## Safe modernization order

1. Pin and gate all writers behind the controlled ingestion contract.
2. Migrate frontend reads to authoritative IDs (`meet_id`, `event_type_id`) and paginate large
   fact queries.
3. Introduce replacement columns/views alongside legacy fields.
4. Validate tests and live read paths.
5. Retire legacy fields or tables only after code search and runtime evidence show no readers.

No schema or data change is justified solely by a text-search count. Each proposed migration must
include the catalog dependency map, code-reader list, data backfill proof, and rollback plan.
