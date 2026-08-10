# Scaling Plan — 10k–20k+ users

Goal (owner, 2026-08): open the community/social features and handle 10k–20k+ logged-in users.
This is the plan to get there. Nothing here is urgent today; the point is to build in the right
direction now so nothing has to be undone later.

---

## The one fact that shapes everything

**TrackHub's data is ~99% read-only and changes weekly**, when scrapes run. No user writes a
result. That makes it *far* easier to scale than a typical social app: almost every expensive
query can be **computed once after an import and read millions of times**.

The social layer (accounts, claimed profiles, feed, reactions) is the opposite — small, write-y,
per-user. Treat the two as different systems with different rules.

| | Stats data (results/meets/athletes) | Social data (feed/reactions/claims) |
|---|---|---|
| Writes | weekly, batch, by scrapers | constant, small, by users |
| Reads | identical for every user | user-specific |
| Scaling tool | **precompute + cache** | indexes, pagination, RLS |
| Freshness needed | weekly | seconds |

---

## Do NOT do (yet)

- **Multiple databases / sharding.** 3.7M rows is small for Postgres. The measured slowness was a
  missing index (school pages: 2,473 ms → 145 ms). Sharding adds permanent complexity and solves
  nothing you have.
- **A custom API server in front of Supabase.** Direct-to-Supabase is fine at this scale and one
  less thing to run. (`services/api.ts` already points at a dead dev IP — retire it.)
- **Premature microservices.** The scrapers are already separate; that's enough separation.

## Do, in order

### 1. Precompute what every user reads identically  ← biggest lever
Leaderboards, school pages, athlete PRs, meet result pages: same answer for every user, changes
only on import. Options, cheapest first:
- **Materialized views** refreshed after each scrape (`REFRESH MATERIALIZED VIEW CONCURRENTLY`).
  Already scoped for PRs — see `mv_athlete_prs` in `20260715_computed_athlete_prs.sql`.
- **Summary tables** written by the importer (e.g. `school_season_summary`, `meet_event_summary`).
- Rule of thumb: **if the answer is the same for user #1 and user #10,000, compute it once.**

### 2. Cache at the edges
- Client cache already exists (`top_performances_cache_v8` in `useTopPerformances`). Extend the
  same pattern to school/meet/athlete pages, keyed by a version that bumps on import.
- Because data changes weekly, cache TTLs can be **long** (hours), which is a huge win.

### 3. Index per access pattern — and measure each one
Indexes are not free and not always good here. Proven on this instance:
- `results.team_id` → school pages **2,473 ms → 145 ms** ✅ kept
- `(event_type_id, environment)` → broad scan **8s → 22.5s** ❌ reverted (scattered heap fetches
  lose to sequential scans on slow I/O)
**Always `EXPLAIN ANALYZE` before and after; keep only what measurably helps.**

### 4. Shrink the data
~28% of 2026 results are duplicates (416k rows). Cleaning them makes every scan and index smaller
and faster — a correctness fix *and* a performance fix. See `DATA_ISSUES_TRACKER.md` DUP-1–DUP-3.

### 5. Design the social schema for reads
When accounts land:
- Index every foreign key used in feeds (`user_id`, `athlete_id`, `created_at DESC`).
- **Keyset pagination** (`WHERE created_at < $cursor ORDER BY created_at DESC LIMIT 20`), never
  `OFFSET` — offset degrades badly as the feed grows.
- Store **counters** (reaction counts) denormalized on the row; don't `COUNT(*)` a reactions table
  on every render.
- Keep **RLS policies simple and indexed** — a policy that can't use an index runs per row.

### 6. Scale the instance when (and only when) measurement says so
This Supabase instance is I/O-slow (visible in cold-cache timings, and it's why bulk writes need
the safe-backfill method). Upgrading the tier is the honest fix for that — but do it *after* the
duplicate cleanup and precomputation, so you're not paying to serve waste.

### 7. Watch the right numbers
Before opening the community, know your baseline: p95 latency per screen, slowest queries
(`pg_stat_statements`), cache hit rate, and rows scanned per request. Optimising without these is
guessing.

---

## Capacity reality check
At 20k users with, say, 10% daily actives and ~20 screen-views each, that's ~40k page loads/day —
under 1/second average, with peaks around meet weekends. **That is not a lot** for Postgres *if*
each page is a handful of indexed or precomputed queries. It is a lot if each page runs several
multi-second scans. The work above is what moves you from the second case to the first.
