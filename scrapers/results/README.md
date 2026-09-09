# Result-ingestion entry points

There is one production command:

```bash
node scrapers/results/sync-dual-source-results.js --days 7 --commit
```

It coordinates two source-specific adapters; they are implementation components, not competing
batch engines:

- `scrapers/tfrrs/meet-scraper/sync-weekend-results.js`
- `scrapers/athletic-net/import_meet_results.js`

Both normalize source rows and use `ControlledIngestion`; only
`scrapers/shared/canonical_fact_writer.js` normally promotes public result facts.
TrackScoreboard and timing adapters are repair-only source adapters. Historical backfill, dedupe,
merge, and correction programs are operator-run repair tools, not scheduled ingestion.

The separate `entries/` → `live/` → `final/` subsystem supports real-time meet tracking. It is
preserved but intentionally unscheduled and does not feed this official-results coordinator.

The superseded Athletic.net batch runner, TFRRS file-based meet pipeline, list builder, and legacy
athlete-result importers were removed on 2026-09-09. Their exact source remains in Git history at
the parent of checkpoint `ING-04`.
