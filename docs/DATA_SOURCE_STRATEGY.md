# Data-Source Strategy — Results Ingestion

Decision of record for how meet results / performances get into the database, and how the two
sources (athletic.net and TFRRS) are used together. Written 2026-07-16.

## The two sources, and their roles

**CORRECTION (2026-07-19):** an earlier version of this doc labelled TFRRS "secondary". That was
wrong and it misled later work. TFRRS is the **foundation** — it built ~99% of the database
(~12,570 meets / 11,853 with results) versus athletic.net's 108. Both sources are required and
**work together**; neither replaces the other. Never propose "switching" from one to the other.

| Source | What it is | Role |
|---|---|---|
| **TFRRS** | The *college aggregator* — every college meet lands here regardless of which timing company ran it. Owns canonical athlete identity (`tfrrs_athlete_id`) + official rankings. Reached via stored `tfrrs_url`; links come from USTFCCCA's weekly directory. | **FOUNDATION** — built ~99% of the data; the identity + rankings backbone. Weakness: lags real time, `results_search` not exhaustive. |
| **athletic.net** (incl. AthleticLIVE) | The *timing platform* — where results are born, live. Richest data (wind, splits, year, PB/SB, points). College **and** HS, but we only open our own college meets' stored URLs, so HS is never pulled in. Cloudflare-protected → puppeteer. | **SOURCE / GAP-FILLER** — fills meets TFRRS didn't cover, and the go-forward live feed. Its links are already captured at meet-discovery (2026 meets: ~563 have one). |

**How they coexist — the rules**
1. **One meet, one source.** Never import a second source into a meet that already has results
   (that creates duplicates). Import only into *genuinely empty* meets — verify with an exact
   per-meet count, not `results_status`.
2. **`meets.results_source`** is the provenance record (`athletic_net` | `tfrrs` | `ustfccca` |
   `timing_site` | `manual` | `other`; NULL = historical TFRRS/USTFCCCA era). Query it to know
   which source filled what.
3. **Identity is shared:** one internal `athlete_id` = one person; `tfrrs_athlete_id` and
   `athletic_net_url` are pointers to that person, and every confident match backfills the
   missing pointer so the two ID systems converge.
4. Marks differ by source (`10.35a` vs `10.35`) — **normalize before comparing** for dup checks.

## The link columns (each source has its own home)

Set intentionally at meet discovery based on the URL host — no more dumping everything into one field:

| Column | Holds | When |
|---|---|---|
| `meet_url` | the raw **LIVE / timing link** (athletic.net-live, leonetiming, flashresults, milesplit, blueridge, herostiming…) — where people watch the meet live | at discovery |
| `athletic_net_results_url` | the **athletic.net results** link | discovery / post-meet |
| `tfrrs_url` | the **TFRRS results** link | post-meet (from USTFCCCA or matched) |
| `wa_results_url` | World Athletics results link | if applicable |
| `results_source` | which source we actually imported from (`athletic_net` \| `tfrrs` \| `ustfccca` \| `timing_site` \| `manual` \| `other`) | set by the orchestrator |
| `results_status` | `pending` \| `tfrrs_available` \| `missing_tfrrs_url` \| `imported` | pipeline state |

Note: an athletic.net *live* link doubles as its results source, so it lives in BOTH `meet_url`
(the live link) and `athletic_net_results_url` (the results home). That's why the sort was a
copy, not a move.

## Where links come from (no fuzzy for current meets)

- **Current meets:** discovery already attaches the athletic.net link; **USTFCCCA's weekly
  directory** is the phone book that publishes each meet's TFRRS *and* athletic.net links —
  read them straight, no fuzzy matching.
- **Historical backlog only:** fuzzy / token+date matching against TFRRS/athletic.net search
  (the fragile part) — a one-time cleanup, never for live meets.

## The orchestrator ("the scrapers talking to themselves")

One coordinator runs the source scrapers and compares — the scrapers don't talk peer-to-peer.
Per meet needing results:

1. Look at which link columns are filled.
2. Scrape each available source (athletic.net via puppeteer; TFRRS via its scraper).
3. **Compare** the outputs: result count, event coverage, richness (wind/splits/PB-SB).
4. **Pick the winner or merge:** default to athletic.net for completeness + rich marks; fall
   back to TFRRS if athletic.net is thin/missing; always use TFRRS to stamp the canonical
   athlete identity (TFRRS ID). Best case: merge — athletic.net marks + TFRRS identity.
5. Record `results_source` (+ optionally per-source counts) and set `results_status='imported'`.

This makes ingestion **intentional and self-comparing**: every meet records how it got filled
and which source had more, so coverage/quality is observable over time.

## Ingestion must run through the hardened shared modules
Every import path (athletic.net, TFRRS) resolves through `scrapers/shared/`:
`event_resolver` (→ event_type_id), `name_parser` (first/last on insert), `AthleteResolver`
(find-or-create athlete, no orphan leak). This keeps the data clean by construction regardless
of source. Node 20+ required (puppeteer + supabase-js).

## Status / next
- ✅ Link columns rationalized; athletic.net links sorted into `athletic_net_results_url` (563).
- ✅ `results_source` column added.
- ⏳ Build the athletic.net results scraper→import bridge (reuse `platforms/athletic_net.js`).
- ⏳ Build the orchestrator (compare + pick + record).
- See [athletic-net-scraper-plan] memory for the full athletic.net API map.
