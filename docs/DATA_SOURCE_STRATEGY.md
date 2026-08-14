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


---

## Direction of travel (owner, 2026-08-10): lean on athletic.net for NEW meets

This is the owner's call, not a proposal to "switch sources" — the two still coexist, and the
rule against switching in CLAUDE.md §1 is aimed at unprompted agent suggestions, not this.

**Owner's reasoning:** athletic.net carries richer detail — qualifying status (**big Q** = auto
qualifier by place, **small q** = time qualifier), splits, wind, PB/SB, year, points. That detail
is what lets the app get better, not just bigger.

**A second argument, from the link data (measured 2026-08-10, 2025-26 season, 2,575 meets):**

| | meets |
|---|---|
| have an athletic.net link | **588 (23%)** |
| have a TFRRS link | **89 (3.5%)** |
| results actually sourced from TFRRS | 2,281 (89%) |

Athletic.net links are **6.6× more available**. And note the gap: 2,281 meets hold TFRRS results
while only 89 have a stored `tfrrs_url` — so the TFRRS path is mostly **not link-driven**, it is
matching by name and date. That is precisely the mechanism that produced DUP-1 (one TFRRS page
imported into both "Utah Spring Classic" and "Arkansas Spring Invitational", same date). Moving
new-meet ingestion onto stored athletic.net links removes that whole failure mode.

**What must NOT move:**
- **Athlete identity stays TFRRS-anchored.** `athletes.tfrrs_athlete_id` is the canonical id.
- **The historical archive stays TFRRS.** 9,572 pre-2025 meets, and no athletic.net links exist
  for any of them (measured: 0 of 10,105). That data is not re-sourceable.

**What has to happen first:**
1. **Link capture is the bottleneck, not the scraper.** 23% coverage is not enough to lead with.
   USTFCCCA's directory is a moving window (CLAUDE.md §1b), so links must be captured *during*
   the season — that window is the only cheap chance.
2. **Per-event source preference** (open issue U3). Coverage varies by meet and even by event, so
   the right model is "best source for this event", not "one source for everything".
3. **Schema has nowhere to put the richer data yet.** `results` has no qualifying-status column —
   the Q/q distinction the owner wants would need one, plus somewhere for splits. Worth designing
   before the 2026-27 season so the scrape captures it from day one rather than needing a backfill.


### The dual-source model the owner actually wants (2026-08-10)

Not a switch. **Scrape the same meet from BOTH sources**, with defined roles:

| role | source | supplies |
|---|---|---|
| **identity / skeleton** | TFRRS | `tfrrs_athlete_id`, athlete↔meet resolution, the canonical meet |
| **detail / enrichment** | athletic.net | Q vs q, splits, wind, PB/SB, year, points |

Both links stay on the meet row; each meet is reachable from either end; either can act as the
other's fallback.

**THIS CONFLICTS WITH COEXISTENCE RULE #1** ("one meet, one source — never import a second source
into a meet that already has results"). That rule exists because a batch was once imported onto
non-empty meets and had to be rolled back. It is not obsolete — what changes is *how* the second
source writes:

- **exactly one source INSERTS** result rows for a meet (system of record for the performance)
- **the other only UPDATES** them — attaches Q/q, splits, wind, and backfills the missing athlete
  pointer (`athletic_net_url` / `tfrrs_athlete_id`)
- a second INSERT for the same performance is a bug, not a merge strategy

**BLOCKER — the DB guard cannot see cross-source duplicates yet.** `results_no_exact_duplicate`
keys on `mark_raw`, and the two sources format marks differently:

| source | marks ending `a` (auto-timed) |
|---|---|
| athletic.net | **32,229** |
| TFRRS | 1,313 |

The same race is `10.35a` from one and `10.35` from the other — two different keys, so the index
lets both in. Before any dual-source import runs, `results` needs a **normalized mark column**
(strip a trailing `a`/`h` timing flag, keep the `m` field-unit) and the unique index must key on
that instead of `mark_raw`.

`mark_seconds` / `mark_meters` cannot be used for this: **45% of rows (1,483,604) have neither**,
and 1,319,151 of those have a numeric `mark_raw` that was simply never parsed.

**Order of work:** normalized mark column → re-key the unique index → define which source inserts
per meet → only then run both scrapers over the same meet.


## The recovery cascade for meets with no stored results link (owner's idea, proven 2026-08-14)

For a meet that is empty and has no `tfrrs_url` / `athletic_net_results_url`, try in order:

1. **TFRRS search** — `tfrrs.org/results_search.html`, paginated, ~30 meets per page. TFRRS
   aggregates every college meet regardless of which timing company ran it, so the results almost
   always exist there; what is missing is the URL, not the data.
2. **The timing site itself** — only worth it where the platform is an AthleticLIVE instance,
   because those link back to a permanent `www.athletic.net` meet page the existing scraper can
   already read.
3. **athletic.net directly**, if a link resolves.

### ⚠️ Step 1 is the thing CLAUDE.md §1b bans — it is only safe WITH verification

Name matching is what produced DUP-1. The existing `--fuzzy` matcher strips
`invitational|invite|indoor|outdoor|classic|open|championships` and the year, so
"Big West Track & Field Championships" normalises to just **"big west"**. That is how Big Ten
results ended up in three wrong conferences.

**The rule: never write a found URL without a falsifiable check first.**
- the candidate page's own **date** must contain the meet's date
- the **teams/schools** must fit the meet's identity (host state, conference, region)
- prefer meets whose names are **globally unique** (a national championship) over recurring ones
  ("Cougar Classic" happens every year in several states)

### Proven case (2026-08-14)

`NCAA DI Outdoor Championships – East/West First-Rounds` (meets 13134/13135) had only a
`flashresults.ncaa.com` link. TFRRS search listed both. Page dates read "May 27-30, 2026",
containing our 2026-05-30. Imported **4,157 results + 189 relays**, then verified:

| meet | states |
|---|---|
| East | AL CT DC DE FL GA IN KY LA MA MD ME MI MS NC NH NJ NY OH PA RI SC TN VA VT WV |
| West | AR AZ CA CO HI IA ID IL KS MN MO MT ND NE NM NV OK OR SD TX UT WA WI WY |

**Zero overlap** — a clean geographic partition, exactly what East/West regional qualifying must
produce and not something a wrong match could fake.

Also found the same day: **4 meets had a `tfrrs.org/results/...` URL sitting in `meet_url`**
instead of `tfrrs_url`, so no scraper ever looked. Worth re-checking periodically:
`WHERE meet_url ILIKE '%tfrrs.org/results%' AND tfrrs_url IS NULL`.
