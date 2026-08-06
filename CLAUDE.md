# TrackHub — agent orientation

Mobile app (React Native/Expo, iOS App Store) for college track & field: results, rankings,
PRs, head-to-head. Supabase/PostgreSQL backend + Node scrapers. Solo-built.

**Read this before proposing changes to data ingestion.** The #1 recurring mistake is treating
this as a single-source pipeline. It is not.

---

## THE TWO DATA SOURCES — BOTH ARE REQUIRED, THEY WORK TOGETHER

Neither replaces the other. Never propose "switching" from one to the other.

### TFRRS — the foundation (came first, still essential)
- **Built ~99% of the database**: ~12,570 meets / 11,853 with results.
- The aggregator for **college** T&F: every college meet ends up here regardless of which
  timing company ran it.
- Owns **canonical athlete identity** (`athletes.tfrrs_athlete_id`) and official rankings.
- Reached via stored `meets.tfrrs_url`; links come from **USTFCCCA's weekly results directory**
  (the authoritative "phone book" that publishes each meet's TFRRS *and* athletic.net links).
- Weakness: lags real time; its `results_search` isn't exhaustive.

### athletic.net (+ AthleticLIVE) — the source & gap-filler (added 2026-07)
- The **timing platform**: where results are born live. Richer data (wind, splits, PB/SB, year,
  points). Covers college **and** high school — we only ever open our own college meets' URLs,
  so HS data is never pulled in.
- `live.athletic.net/meets/{id}` redirects to the timing company's AthleticLIVE instance
  (herostiming, blacksquirrel, `*.anet.live`, jdlfasttrack…) — all the same platform, one scraper.
- Its meet page links to the permanent `www.athletic.net/TrackAndField/meet/{wwwId}` (that's the
  live→www bridge; no searching needed).
- Used to **fill meets TFRRS didn't cover** (108 meets so far) and as the go-forward live feed.
- Cloudflare-protected → needs puppeteer-extra + StealthPlugin.

### How they coexist — the rules
1. **One meet, one source.** Never import a second source into a meet that already has results —
   that is how duplicates get created. Import only into *genuinely empty* meets (verify with an
   exact per-meet count, not `results_status`).
2. **`meets.results_source`** records which source filled each meet (`athletic_net` | `tfrrs` |
   `ustfccca` | `timing_site` | `manual` | `other`). NULL = historical TFRRS/USTFCCCA era.
   **Query this to know which source did what** — it is the source of truth for provenance.
3. **Identity is shared.** One internal `athlete_id` = one person; `tfrrs_athlete_id` and
   `athletic_net_url` are just pointers to that person. Every confident match backfills the
   missing pointer so the two ID systems converge over time.
4. **Link columns are intentional** (don't dump everything in one field):
   `meet_url` = live/timing link · `tfrrs_url` = TFRRS results · `athletic_net_results_url` =
   athletic.net results · `wa_results_url` = World Athletics.

Full detail: **`docs/DATA_SOURCE_STRATEGY.md`**.

---

## HARD RULES (learned the expensive way)

- **Never make the database messy again.** Before any bulk import: dedup-check athletes
  (ID → name+gender *with school corroboration* → else create) and fingerprint-check results
  (athlete+event+normalized mark near the meet date). Marks differ by source: athletic.net
  writes `10.35a`, TFRRS writes `10.35` — normalize before comparing.
- **Verify after writing, don't assume.** Every bulk op gets a post-write duplicate check.
  This has caught real problems more than once.
- **This Supabase instance is weak/write-slow.** Small batches, hard `statement_timeout`,
  PK-driven updates, throttle. Never a giant unbounded UPDATE. See
  `memory/backend-rebuild-status.md` "SAFE-BACKFILL METHOD".
- **Scrapers need Node 20+** (`/Users/mk/.nvm/versions/node/v20.20.0/bin/node`); the shell
  defaults to 18 and supabase-js/puppeteer crash on it.
- **Commits: no `Co-Authored-By` lines.**
- All ingestion resolves through `scrapers/shared/`: `event_resolver` (→ `event_type_id`),
  `name_parser` (first/last on insert), `AthleteResolver` (find-or-create, no orphan leak).

## Where things are
| Topic | File |
|---|---|
| Data sources & orchestration | `docs/DATA_SOURCE_STRATEGY.md` |
| Target schema / north star | `docs/TARGET_SCHEMA_BLUEPRINT.md` |
| T&F domain rules (events, environments, PRs) | `docs/DOMAIN_LOGIC.md` |
| Columns pending retirement (don't drop early) | `docs/COLUMN_RETIREMENT_PLAN.md` |
| Backend architecture | `docs/BACKEND_ARCHITECTURE.md` |

## Current state (2026-07)
Off-season rebuild on branch `backend-rebuild`. Done: athlete dedup (6.3k merged), canonical
events (100%), `meet_id` FKs, divisions dimension, gender/name backfills, hardened scrapers,
athletic.net fill (108 meets / ~58k results), computed PRs (`v_athlete_prs`).
Open: relays missing from athletic.net imports; `team_id` NULL on those results; ~203 meets
still empty (need link discovery); dedup tail; frontend migration to read by IDs.
