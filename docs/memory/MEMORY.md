# Project Memory

**START HERE: `/Users/mk/Projects/track-meet-tracker/CLAUDE.md`** — auto-loaded orientation file. TFRRS (foundation, ~99% of data + athlete identity) and athletic.net (gap-filler + live feed) are BOTH required and work TOGETHER; never propose switching between them.

- [Results data model](results-data-model.md) — results table is dual-purpose (meet-linked vs athlete-history); the stored-link scrape model that replaced name-matching
- [Meet URL / backfill state](meet-url-backfill-state.md) — app matches results by meet_name+date (NOT meet_id); 93.4% of meets show results, only ~830 genuinely empty. Job 1 done 2026-07-09
- [Track season model](track-season-model.md) — seasons span two calendar years (Indoor/Outdoor/XC); never split by calendar year
- [App domain logic](app-domain-logic.md) — T&F rules the backend must support: event-name normalization, indoor/outdoor, wind/altitude, PRs (scrape vs compute — open Q), head-to-head, rankings. Checklist: docs/DOMAIN_LOGIC.md
- [Backend rebuild status](backend-rebuild-status.md) — SINGLE SOURCE OF TRUTH for the rebuild: branch backend-rebuild, done (meets/events/seasons/cleanup), TODO (athlete dedup, PRs, FKs, frontend), + the safe-backfill method for this weak DB
- [athletic.net scraper plan](athletic-net-scraper-plan.md) — planned build: the strategic source for missing meet results + school logos + athlete photos (social app); use athlete-overlap to match hard meets
