# TFRRS meet-result adapter

This directory has one retained result adapter: `sync-weekend-results.js`. Production does not run
it as an independent batch engine; `scrapers/results/sync-dual-source-results.js` calls it once per
eligible meet so TFRRS and Athletic.net share the same canonical writer.

Examples for a reviewed single-meet operation:

```bash
# Stage private observations only
node sync-weekend-results.js --meet 13048 --source-url https://www.tfrrs.org/results/96496 --scrape --control-plane

# Promote through the canonical writer
node sync-weekend-results.js --meet 13048 --source-url https://www.tfrrs.org/results/96496 --compare --control-plane --commit
```

The old file-based list → scrape → import pipeline was retired on 2026-09-09. Its source remains
recoverable from Git history; it is intentionally absent from the working tree.
