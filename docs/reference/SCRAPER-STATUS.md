# Current scheduled scraper lifecycle

The scheduled lifecycle has one owner per stage:

1. `scrapers/meets/discover_meets.js` discovers meets and source links Monday, Thursday, and Friday.
2. `scrapers/meets/update_meet_status.js` owns upcoming/live/completed transitions; it preserves
   the original start/end dates.
3. `scrapers/results/sync-dual-source-results.js` ingests official results for completed meets on
   Monday after refreshing links and statuses.

The entries/live/final real-time subsystem and roster system remain separate and unscheduled.

## Official results

As of 2026-09-09 there is one production result-ingestion entrypoint:

```bash
node scrapers/results/sync-dual-source-results.js --days 7 --commit
```

It coordinates the retained TFRRS and Athletic.net source adapters and sends both through one
normalizer, matcher, and canonical database writer. Matching source rows link to one performance;
unique rows can create one fact; conflicts remain private for review.

TrackScoreboard and timing-site adapters are repair-only. Historical backfill, identity, dedupe,
merge, and correction scripts are operator-run tools, not alternate scheduled scrapers.

The old Athletic.net batch runner, TFRRS file-based meet pipeline, and direct athlete-result
importers were retired. Their code is recoverable from Git history but is intentionally absent from
the active working tree. The enforceable caller checks live in
`docs/database-audit/workflow_safety.test.js`.
