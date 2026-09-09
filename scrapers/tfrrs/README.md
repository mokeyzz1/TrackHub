# TFRRS adapters and tools

Production meet-result ingestion starts at
`scrapers/results/sync-dual-source-results.js`. Its TFRRS adapter is
`meet-scraper/sync-weekend-results.js`; it normalizes observations and writes through the private
control plane.

`athlete-scraper/` is retained for profile identity, PR, and reviewed repair work. Its old direct
result importers were retired on 2026-09-09. Do not create a second result-import path here.

For the current entrypoint contract, see `scrapers/results/README.md`.
