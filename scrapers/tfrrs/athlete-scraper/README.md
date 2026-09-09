# TFRRS athlete-profile tools

These are historical profile, identity, PR, and reviewed repair tools. They are not a second
meet-result ingestion system.

The former `import-results-to-db.js` and `import-retry-data.js` direct result writers were retired
on 2026-09-09. New meet results must use `scrapers/results/sync-dual-source-results.js` and the
canonical control plane.

Retained tools may read athlete profiles or perform explicitly reviewed repairs. Before running a
mutation, use its dry-run and rollback instructions; none of these tools is scheduled production
ingestion.
