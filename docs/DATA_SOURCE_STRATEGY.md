# Data-Source Strategy — Results Ingestion

Decision of record for how meet results / performances get into the database, and how the two
sources (athletic.net and TFRRS) are used together. Written 2026-07-16.

## The two sources, and their roles

| Source | What it is | Role |
|---|---|---|
| **athletic.net** (incl. AthleticLIVE) | The *timing platform* — where results are born, live, as the meet runs. Has everything (college + HS), the richest data (wind, splits, year, PB/SB, points). Cloudflare-protected → needs puppeteer. | **PRIMARY** — freshest, most complete, and we already capture its links at meet-discovery. |
| **TFRRS** | The *aggregator* — imports from timing systems after the fact, adds canonical college rankings + stable athlete identity (TFRRS IDs). Lighter to scrape, but delayed and not exhaustive. | **SECONDARY** — fallback coverage + athlete identity + canonical rankings. |

**Why athletic.net is primary:** it's the source (real-time, complete, rich), and your
meet-discovery scraper *already* banks its link on every meet (2026 meets: ~563 have one).
TFRRS needs name-matching to find its links; athletic.net's are already in hand. HS data is
never touched because we only open the specific college-meet URLs we already store.

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
