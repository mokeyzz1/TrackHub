---
name: app-domain-logic
description: "Track & field domain rules and app-logic concerns the backend must support (events, PRs, rankings, head-to-head, progression)"
metadata: 
  node_type: memory
  type: project
  originSessionId: b63228a2-f910-41f5-bd61-21edda8f8e0c
  modified: 2026-08-06T18:30:05.372Z
---

Full living checklist: `docs/DOMAIN_LOGIC.md`. Key points the builder wants remembered:

**Everything higher-level depends on the foundation.** PRs, rankings, head-to-head, and
progression charts are only correct if events are canonical, environment (indoor/outdoor) is
tagged, marks carry wind/validity, and results link cleanly to meets+athletes. So foundation
work (meet_id, event normalization, dedup) is what makes app features trustworthy. See
[results-data-model], [track-season-model].

- **Event naming is chaotic:** one event has many spellings (`200`/`200m`/`200 Meters`/`200M`/
  `200 Invitational`; `60m H`/`60 Meter Hurdles`/`60 Meter Hurdles Invitational`). Fix = a
  canonical event dictionary (make the empty `events` table real).
- **Indoor vs outdoor must be separated** (banked indoor 200m ≠ outdoor 200m; 60m indoor-only);
  times not comparable across environments.
- **Wind & altitude** affect mark validity (wind ≤ +2.0 legal outdoors; altitude aids sprints/
  jumps, hurts distance).
- **PRs — CORRECTED 2026-07-19 (measured at scale; supersedes the 2026-07-15 "retire scraped" call).**
  `v_athlete_prs` is APPLIED (migration `20260715_computed_athlete_prs.sql`, plain VIEW).
  **Perf measured:** per-athlete query = **0.6 ms** (index scan on idx_results_athlete_id, filter
  pushes into the window function) → the app can read the VIEW directly for athlete profiles;
  no materialized view / refresh job needed. BUT a leaderboard-style scan (all PRs in one event)
  = **8 s** (seq-scans results) → only build `mv_athlete_prs` (or an index on
  results(event_type_id, environment)) IF you add PR-based leaderboards. Current leaderboards use
  the separate WA-scoring top_performances functions, so this may never be needed.
  **DO NOT DROP `athlete_prs`.** 150-athlete sample, normalized through event_aliases:
  computed-only = 299 pairs, **scraped-only = 189 pairs** — the scraped table holds real career
  bests from TFRRS profile pages for meets whose RESULTS were never imported. They're
  COMPLEMENTARY. Bonus: those 189 are a signal pointing at missing meet results.
  (Also: raw scraped event_name inflates counts ~35% via free-text dupes "200"/"200m", and 86/685
  scraped names don't map to any canonical event at all.)
- **PRs — earlier note 2026-07-15 (partially superseded above):** Drafted `v_athlete_prs` view (migration
  `20260715_computed_athlete_prs.sql`, not applied): best mark per athlete × event_type_id ×
  environment; direction by event_types.measure (time→min mark_seconds, distance→max mark_meters,
  points/multis→max mark_raw::int since multis store points only in mark_raw). Validated on real
  athletes + compared to scraped `athlete_prs`: scraped is INCOMPLETE (Skyler Phillips 77050 —
  scraped had 4 rows, MISSING Discus/Hammer/Javelin entirely) and STALE/WRONG (scraped WT 13.11m
  vs actual best 13.96m; missing outdoor Shot Put PR). Computed wins decisively → retire scraped
  athlete_prs + results.is_pr (make is_pr computed). Production form = MATERIALIZED VIEW
  mv_athlete_prs (unique idx on athlete_id,event_type_id,environment; REFRESH CONCURRENTLY after
  imports). v1 ignores wind legality (wind is messy text, no wind_legal col) — that's a v2 refinement.
- **Head-to-head** includes "same meet/same race" comparison → needs reliable meet_id + event links.
- App is deeply **data-driven**; live on iOS with 300+ downloads; off-season now (good time to rebuild).

## UPDATE 2026-07-10: Event normalization BUILT & applied
- Tables live: `event_types` (61 canonical events), `event_aliases` (1,135 raw->event map), `unmapped_events` (log). Migration: create_event_types_and_aliases.
- `results.event_type_id` backfilled to **100% (all 3,634,305 rows)**; `results.environment` set for fixed-env events (~46%); "both"-event environment awaits the seasons step.
- HARD-WON LESSON: `results` has 14 indexes → updates are very slow on this weak Supabase instance and a too-big/no-timeout backfill OVERLOADED prod (queries timed out, orphaned server-side UPDATEs held locks for hrs). Fixes that worked: (1) small batches (15k), (2) HARD per-statement timeout (~50s) so nothing runs away, (3) PK-driven CTE query `WITH batch AS (SELECT ... WHERE result_id BETWEEN .. AND event_type_id IS NULL) UPDATE ... JOIN` (avoids event_name-driven full scans), (4) let autovacuum finish (dead tuples->0) before/after. For future big backfills: consider dropping non-essential indexes first, or do it off-hours throttled. NEVER run a giant single UPDATE with statement_timeout=0.
- Next build step: canonical seasons (also fills "both"-event environment) + fix scrape_meets.js hardcoded season. Then scrapers resolve events via event_aliases (flag misses to unmapped_events).
