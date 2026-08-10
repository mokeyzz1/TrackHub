# TrackHub — agent orientation

Mobile app (React Native/Expo, live on iOS App Store) for college track & field: results,
rankings, PRs, head-to-head. Supabase/PostgreSQL + Node scrapers. Solo-built by the owner.

**Read this fully before touching data ingestion or proposing schema changes.** Everything here
was learned the expensive way. Don't re-litigate settled decisions; don't re-discover known traps.

---

## 1. THE TWO DATA SOURCES — BOTH REQUIRED, THEY WORK TOGETHER

Never propose "switching" from one to the other. They coexist by design.

**History matters for reading the numbers.** The project started on **TFRRS** and scraped only
TFRRS for years; **athletic.net was added 2026-07**. So TFRRS holding ~99% of the data is a fact
of *chronology, not superiority* — it's simply what was scraped first. Both sources do the same
job.

**Do not confuse engine maturity with source quality.** Head-to-head in 2026-07 the TFRRS engine
looked "better" (100% `team_id`, relays handled, no duplicate athletes) while the athletic.net
import looked worse (no `team_id`, relays dropped) — but every one of those gaps was a *bug in
the newly-written athletic.net bridge*, since fixed, not a limitation of athletic.net. On raw
data athletic.net is actually **richer** (wind, splits, PB/SB, year, points) and fresher (live).
Judge the two on coverage for a given meet, not on which engine happened to be older.

**TFRRS — the foundation (came first, still essential)**
- Built ~99% of the database: **11,853 meets with results**.
- The aggregator for **college** T&F — every college meet lands here regardless of which timing
  company ran it. (Owner has corrected this point more than once: TFRRS has all college meets.)
- Owns **canonical athlete identity** (`athletes.tfrrs_athlete_id`) and official rankings.
- Reached via stored `meets.tfrrs_url`; links come from **USTFCCCA's weekly results directory** —
  the authoritative "phone book" listing each meet's TFRRS *and* athletic.net links. For current
  meets this means **no fuzzy matching is ever needed**; fuzzy is only a historical-backfill tool.
- Weakness: lags real time; its `results_search` isn't exhaustive.

**athletic.net (+ AthleticLIVE) — the live source & gap-filler (added 2026-07)**
- The **timing platform** where results are born live. Richer data: wind, splits, PB/SB, year,
  points. Covers college **and** high school — we only ever open our own college meets' stored
  URLs, so HS data never enters the DB.
- `live.athletic.net/meets/{id}` redirects to the timing company's AthleticLIVE instance
  (herostiming, blacksquirrel, `*.anet.live`, jdlfasttrack, michianatiming…) — all one platform,
  one scraper. athletic.net is the *interface* those timing systems publish into.
- Each live page links to the permanent `www.athletic.net/TrackAndField/meet/{wwwId}` — that's the
  live→www bridge, so no searching is needed when we already hold the live URL.
- Currently 108 meets / ~58k results.
- Cloudflare-protected → requires puppeteer-extra + StealthPlugin (plain HTTP gets a 403).

**Coexistence rules**
1. **One meet, one source.** Never import a second source into a meet that already has results —
   that is how duplicates are created. Import only into *genuinely empty* meets, verified with an
   exact per-meet count (`count(*) WHERE meet_id=…`), **not** `results_status`.
2. **`meets.results_source`** is the provenance record: `tfrrs` (11,853) · `athletic_net` (108) ·
   NULL (717 = still-empty meets). Query it to answer "which source did what".
3. **Identity is shared.** One internal `athlete_id` = one person. `tfrrs_athlete_id` and
   `athletic_net_url` are *pointers* to that person; every confident match backfills the missing
   pointer, so the two ID systems converge and future matches are exact.
4. **Link columns are intentional** — don't dump everything into one field:
   `meet_url` = live/timing link · `tfrrs_url` = TFRRS results · `athletic_net_results_url` =
   athletic.net results · `wa_results_url` = World Athletics.
5. Marks differ by source: athletic.net `10.35a`, TFRRS `10.35` — **normalize before comparing**.

Detail: `docs/DATA_SOURCE_STRATEGY.md`.

---

## 1b. HOW RESULTS LINKS ARE OBTAINED (and why old meets have none)

The pipeline **stores a results link on the meet row and scrapes from that link** — it does not
search for meets by name. Name/fuzzy matching was deliberately eliminated: it mismatched meets
and is the main way wrong results get imported. Fuzzy is a last-resort historical tool only.

Links come from **USTFCCCA's weekly results directory** (`web4.ustfccca.org/meets-results`) —
the authoritative "phone book" that lists each meet with its TFRRS *and* athletic.net links.
Meet discovery grabs them at scrape time (`meets/scrape_meets.js`), and
`meets/backfill_result_links.js` can fill gaps.

**THE CRITICAL CONSTRAINT — USTFCCCA's directory is a moving window.** It only lists recent
meets; after a few weeks a meet's links are no longer retrievable there. Consequences:
- A meet inside the window self-heals on the next scrape run. **A completed meet outside the
  window never will** — its links are simply gone.
- Link capture only started recently, so: 2026 meets mostly have links; **2025 and older have
  essentially zero** (`OVERNIGHT_BACKFILL_PLAN.md`: 2025 = 2,178 missing / 0 with a link;
  2024-and-older ≈ 8,700 / 0).
- **So "just go get the links" is not generally possible for old meets.** Treat link-less
  historical meets as likely-unfillable rather than a backlog to grind. Mark genuinely
  unavailable ones `results_status='unavailable'` and stop rechecking.
- Corollary: **capture links promptly for current meets** — that window is the only cheap
  chance to get them.

Note the `results` table is dual-purpose: rows with `meet_id` power meet pages; rows with
`meet_id` NULL but `athlete_id` set are athlete-history marks. So a meet with "no results" often
still has its athletes' marks in the DB — they're just not linked to the meet.

## 2. SETTLED DECISIONS — don't re-open these

- **"Unattached" — read this carefully, it is a recurring misunderstanding.**
  Unattached means **competing without representing a school at that competition**. It is a
  property of the *competition*, not of the person. Who competes unattached:
  1. **Post-collegiate athletes** (the majority) — done with college, still competing.
  2. **Currently-enrolled athletes who can't represent the team**: redshirt year, transfer
     sit-out, exhausted eligibility, or running unattached to preserve eligibility.
  3. Competing outside the NCAA season.
  So the *same person* can be unattached one weekend and score for their school the next.
  **They are NOT junk and NOT deletion candidates** — the owner will incorporate them into the
  app (they're real athletes, and a natural social-app audience).
  **Current data-model limitation:** unattached is stored as an athlete property
  (`athletes.school_id = 1835`; 47,186 athletes, 50,543 results, and **0 of those results carry a
  `team_id`**). Two unused Unattached teams exist. The correct model is per-result:
  `results.team_id` → the Unattached team for that meet, while the athlete keeps their school
  affiliation. Until that lands, a person's unattached record and their college record look like
  two different athletes.
  **Dedup implication:** an Unattached record and a school record with the same name are *often
  the same person* — this is the single biggest duplicate source (~10,358 name-matches found).
  Merge them with corroboration, never blindly.
- **TFRRS ID is not a reliable same/different-person signal.** The same person often has two
  different `tfrrs_athlete_id`s (transfers, re-scrapes). Don't penalize an ID conflict when
  deduping. Real signals: shared exact result (definitive same) · same date at different meets
  (definitive different) · different gender (different).
- **Don't drop `athlete_prs`.** Measured at scale: the computed view finds 299 pairs the scraped
  table lacks, but the scraped table holds **189 the computed view can't see** — career bests from
  TFRRS profile pages for meets whose results were never imported. They're complementary. (Those
  189 also *flag* missing meet results worth backfilling.)
- **Computed PRs = `v_athlete_prs`** (applied). Per-athlete read is **0.6 ms** (index scan) → the
  app can query the view directly; **no materialized view or refresh job needed**. Only
  materialize if PR-based leaderboards get built (a full-event scan is ~8 s).
- **Empty athlete columns are future social-app scaffolding, not dead weight.** `athletes.bio`,
  `profile_image_url`, `hometown`, `high_school`, `grad_year`, `primary_events` are reserved for
  accounts / claimed profiles / feed (the owner's next product direction). Keep them.
- **Never drop a column the frontend still reads.** Superseded columns wait for the frontend
  migration. The full list + reference counts: `docs/COLUMN_RETIREMENT_PLAN.md`.
- **LIVE RESULTS IN-APP: ABANDONED — do not rebuild.** The original plan was for the app to show
  its own live results during a meet. That requires scraping essentially 24/7 and effectively
  running a timing-system UI — too much work for the value. **The shipped solution is simpler:
  store the meet's timing link and let users go watch it there** (`meets.meet_url`, rendered as a
  WebView in `app/meet/[id].tsx`). `meet_url` is therefore ACTIVE and important — don't retire it.
  Dead leftovers from the abandoned attempt (safe to retire, nothing in the app uses them):
  `live_results` (48 junk rows) + `unprocessed_live_results` view · `frontend/hooks/useLiveResults.ts`
  (zero imports) · `getTopPerformances()` in `services/database-supabase.ts` (never called — the
  home screen uses the `get_top_performances` RPC) · the live scrapers in `backend/scripts/*live*`
  and `scrapers/live/`. Keep `backend/LIVE_RESULTS_INVESTIGATION.md` — it records *why* this was
  abandoned (CDP analysis proving AthleticLIVE has no public API; results are server-rendered).
- **Logos**: parked. Better sourced via the existing `schools.logo_source`
  (wikipedia/athletic-site) path than by reverse-engineering athletic.net.

## 3. DOMAIN RULES (track & field)

- **Seasons span two calendar years** (Indoor/Outdoor/XC) — never split by calendar year.
- **Environment is a separate axis from event.** Indoor 200m ≠ outdoor 200m ≠ XC. PRs/rankings
  bucket by **(event_type × environment × gender)**. `results.environment` carries it.
- **Events are canonical**: 63 `event_types`, ~1,180 `event_aliases` mapping messy raw names
  (`200`/`200m`/`200 Meters`, athletic.net short codes like `60mh`/`weight`/`1mile`). Unknown names
  go to `unmapped_events` — never silently mangled. Coverage is currently **100%**.
- **Division is the top-level partition**: DI, DII, DIII, NAIA, NJCAA. **Conferences and regions
  each belong to one division** and are *independent of each other* — schools in the same region
  can be in different conferences (verified: the ACC spans 7 regions). NAIA has no regions
  (national qualifying); NJCAA has 24 (not yet loaded). DI regions are **sport-specific**: XC uses
  9 geographic regions, outdoor track qualifies via East/West prelims (derived, never stored).
- Wind ≤ +2.0 is legal outdoors; altitude aids sprints/jumps. `wind` is currently free text and
  mostly null, so PR calculations ignore legality for now (documented v2 refinement).

## 4. HARD OPERATIONAL RULES

- **Never make the database messy again.** Before any bulk import:
  - *Athletes* — cascade: exact source-ID match → unique name+gender **with school corroboration**
    → else create. Never guess; a wrong merge is far harder to undo than a duplicate.
  - *Results* — fingerprint check (athlete + event_type + **normalized** mark, near the meet date).
    An existing row with NULL `meet_id` should be **claimed** (set `meet_id`), not duplicated.
- **Verify after writing — don't assume.** Every bulk op gets a post-write duplicate check. This
  has caught real problems repeatedly (a batch once imported onto non-empty meets; rolled back).
- **This Supabase instance is weak/write-slow.** Small batches (15–25k), hard `statement_timeout`,
  PK-driven CTE updates, throttle, reconnect-on-drop. **Never** a giant unbounded UPDATE — one
  overloaded prod for hours. Filtering `results` by an unindexed column = full scan = timeout.
  Full method: `memory/backend-rebuild-status.md` → "SAFE-BACKFILL METHOD".
- **Supabase `.in()` caps at 1000 rows** — it silently truncates. Use exact per-row counts for
  correctness-critical checks.
- **Scrapers need Node 20+**: `/Users/mk/.nvm/versions/node/v20.20.0/bin/node`. The shell defaults
  to 18 and supabase-js/puppeteer crash there (`ReferenceError: File is not defined`).
- **Commits: no `Co-Authored-By` lines.**
- **All ingestion resolves through `scrapers/shared/`**: `event_resolver` (→ `event_type_id`),
  `name_parser` (first/last on insert), `athlete_resolver` (find-or-create, no orphan leak).
  Fixing logic there fixes it for every importer — the copy-paste between importers is what let
  bugs live in one path and not the other.

## 5. WHERE THINGS ARE

| Topic | File |
|---|---|
| Data sources & orchestration | `docs/DATA_SOURCE_STRATEGY.md` |
| Target schema / north star | `docs/TARGET_SCHEMA_BLUEPRINT.md` |
| T&F domain rules | `docs/DOMAIN_LOGIC.md` |
| Columns pending retirement | `docs/COLUMN_RETIREMENT_PLAN.md` |
| **Every known data issue + status** | **`docs/DATA_ISSUES_TRACKER.md`** |
| **Scaling to 10k–20k users (social launch)** | **`docs/SCALING_PLAN.md`** |
| **Priorities / working checklist** | **`docs/BACKEND_PRIORITIES.md`** |
| Backend architecture | `docs/BACKEND_ARCHITECTURE.md` |
| Live results: NO public API (already investigated) | `backend/LIVE_RESULTS_INVESTIGATION.md` |
| Status-router scraper design | `backend/SCRAPING_PIPELINE.md` |
| Problem/solution history across sessions | `memory/backend-rebuild-status.md` |
| athletic.net scraper | `scrapers/athletic-net/scrape_meet_results.js` |
| athletic.net import bridge | `scrapers/athletic-net/import_meet_results.js` |
| Batch importer | `scrapers/athletic-net/batch_import.js` |
| TFRRS weekly engine | `scrapers/tfrrs/meet-scraper/sync-weekend-results.js` |
| Meet result-link backfill (USTFCCCA/TFRRS) | `scrapers/meets/backfill_result_links.js` |

## 6. CURRENT STATE (2026-07, branch `backend-rebuild`)

Off-season rebuild. **Done:** athlete dedup (6,277 merged) · canonical events (100%) ·
`meet_id` FKs + orphan cleanup · divisions dimension · gender (99.96%) and first/last name
(99.9%) backfills · hardened scrapers (orphan-leak fix, event resolution, name split on insert) ·
athletic.net pipeline built + 108 meets / ~58k results imported · computed PRs (`v_athlete_prs`).

**Known open issues:**
1. ~~Relays missing from athletic.net imports~~ **FIXED 2026-08.** Relay rows list the *team*, not
   a person, so the bridge skipped them as blank (the "N blank rows skipped" in old logs were the
   relays). Scraper now parses relay rows (`.team.title` + legs in `.tertiary-content`); bridge
   writes `relay_results` + `relay_athletes`, deriving each squad's team from its own legs.
   Backfilled all 106 meets: **3,686 relays / 11,230 legs across 72 meets**. Two further relay
   bugs found 2026-08 and fixed: (a) imported relays weren't *clickable* — the app builds a meet's
   event list from `results`, so each leg also needs a `results` row (TFRRS's importer always did
   this; the athletic.net bridge now does too); (b) **most relays had no `meet_id`** so meet pages
   couldn't find them — 4x100 was 6% linked vs 4x400 22%, which is exactly why 4x4s appeared and
   4x1s didn't. `scrapers/backfill-relay-meet-id.js` linked 157,780 rows (4x100 now 85%). Remaining gap: 1,418
   relays (38%, mostly juco) have no `team_id` because their leg athletes aren't in the DB — the
   lineups are still recorded. Re-run with `scrapers/athletic-net/backfill_relays.js`.
2. **`team_id` partly filled (89.3% of results).** The athletic.net bridge never mapped the
   scraped team, so those results had none. A roster-history backfill
   (`scrapers/backfill-result-team-id.js`, re-runnable) filled 104,487 — including 29,751 of the
   athletic.net rows — by mapping each result's date to a track season and using
   `athlete_team_seasons`. **Still 394,659 without a team**, mostly older seasons (roster history
   only covers 2024-25 and 2025-26) and undated athlete-history rows. Remaining fixes: have the
   athletic.net bridge store team on import (it already scrapes `team_name` +
   `athletic_net_team_id`), and extend roster coverage backwards.
   *(Related but separate — FIXED 2026-07-19: 5,446 athletes displayed their OLD school after
   transferring. `athletes.school_id` now derives from the most recent dated result's team; see
   `migrations/20260719_refresh_athlete_current_school.sql`. **Re-run it after each season** —
   transfers are continuous.)*
2b. **Duplicate athlete records are user-visible** — e.g. "Obiora Okeke" and "Mena Scatchard" each
   have extra Unattached copies. Part of the dedup tail / Unattached incorporation work.
3. **~203 meets still empty** — they have no athletic.net link; need link discovery (USTFCCCA)
   before scraping.
4. Dedup tail (cross-school + ambiguous pairs), uniqueness guard on `tfrrs_athlete_id`.
5. **Frontend migration** — the app still matches by *text* (`meet_name`, event strings) instead of
   `meet_id` / `event_type_id` / `division_id`. Until this lands, most of the backend cleanup is
   dormant. Riskiest step (user-visible), so do it screen by screen.
   **First slice landed 2026-08-09 (athlete screen → `event_type_id`).** Use
   `canonicalEventName(row)` from `utils/eventNames.ts` for anything that groups or displays an
   event, and select `event_type_id, event_types ( code )` in the query that feeds it.
   `normalizeEventName()`'s 192-entry map is the **fallback only** — it knows 192 of the DB's 1,186
   spellings, and grouping by it split one event into as many as six (see F13 in
   `DATA_ISSUES_TRACKER.md`). Still on text: `get_top_performances` (U4), meet/school screens (U5).
