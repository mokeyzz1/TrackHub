---
name: athletic-net-scraper-plan
description: "Planned athletic.net scraper — the strategic source for missing meet results + school logos + athlete photos (social app)"
metadata:
  type: project
  originSessionId: b63228a2-f910-41f5-bd61-21edda8f8e0c
  modified: 2026-08-09T22:17:59.309Z
---

**User direction 2026-07-16 — build an athletic.net scraper.** Rationale (user's, and correct):
athletic.net is a **timing platform** that hosts the vast majority of college (and HS) meets +
results — it's where most meets' timing/results live, alongside TFRRS. TFRRS is the aggregator
for college/elite rankings; athletic.net is the raw source-of-record for many meets. So
athletic.net is the best single source to:
1. **Fill the missing meet results** — especially the ~109 "no signal" outdoor-2026 meets that
   TFRRS's `results_search` didn't surface, and the ~230 empty meets whose `meet_url` is a
   timing site (many ARE athletic.net). See [backend-rebuild-status] MISSING RESULTS.
2. **School logos** — for the frontend (alt: generate with Claude, or use roster photos).
3. **Athlete / roster photos** — for the social-app claimed-profile feature.

Two integration paths (either works):
- **athletic.net → TFRRS match:** find the meet on athletic.net, then match to its TFRRS link.
- **Direct athletic.net scrape:** pull results straight from athletic.net (preferred long-term —
  it's the source; don't depend on TFRRS surfacing it).

**Matching hint from user for hard meets:** use **athlete overlap** — if the same athletes appear
across two meet records, they're the same meet. A strong signal for the 109 "no signal" meets
where name/date matching fails (compare rosters/entrants, not just names).

## API RECONNAISSANCE 2026-07-16 (browsed athletic.net live — full pipeline mapped)
athletic.net = Angular SPA + clean JSON API. TWO id spaces: `live.athletic.net/meets/{liveId}`
(live timing front-end, e.g. 63156) vs the PERMANENT `www.athletic.net/TrackAndField/meet/{meetId}`
(aggregator page, e.g. 631684) — DIFFERENT ids, bridged by the search below.

**THE COMPLETE PIPELINE (all plain HTTP JSON except results DOM):**
1. DISCOVER a meet by name → its athletic.net meetId:
   `GET https://www.athletic.net/api/v1/AutoComplete/search?q={meetName}&start=0`
   → Solr-style JSON: `response.docs[]` each `{id_db, type:"TFMeet", textsuggest:name, subtext:"{year} {venue}||{city,ST}", tf:year}`.
   Filter type=="TFMeet", match on our token+date matcher + year → `id_db` = the meetId. (631684 for 2026 MIAC.)
2. ENUMERATE events with results:
   `GET /api/v1/Meet/GetMeetData?meetId={id}&sport=tf` → `{meet, tfDivisions[], eventDivsWithResults:[{e,d}], jwtMeet(JWT), ...}`.
   eventDivsWithResults length = # event-divisions that HAVE results (0 = meet not posted yet). e=eventId, d=divId.
3. RESULTS per event: page URL `/TrackAndField/meet/{id}/results/{m|f}/{divId}/{eventCode}` (e.g. `/m/1/100m`).
   Results are RENDERED IN THE DOM (place, athlete name, team, mark like "10.35a", wind "4.0m/s", year Sr/Jr/So/Fr, PB/SB flags, points, Finals+Prelims+heats). Scrape the DOM (puppeteer) OR find the JSON behind it. RICHER than TFRRS (wind + year + PB/SB + points).
   (Guessed JSON endpoints GetResultsData/GetEventResults/GetEventData = 404; get the real one by clicking an event + watching network, OR just DOM-scrape.)
- Requires Node 20 + puppeteer (already used by platforms/athletic_net.js). AutoComplete search API also used by athletic-net/map-athletes.js already.

**BUILD PLAN (bridge, not from scratch):** for each empty meet → search API → match to id_db →
GetMeetData → for each {e,d} fetch the event results page → parse → import through
event_resolver + AthleteResolver + name_parser (clean by construction) → set results_status='imported'.
Existing `platforms/athletic_net.js` already DOM-scrapes the live-timing family; reuse its parsing or write a
GetMeetData-driven version. LOGOS/PHOTOS: athletic.net team/athlete pages (separate pull) for the social app.

## PIPELINE WORKING END-TO-END 2026-07-17: bridge built, first meet FILLED (committed 4bab23f)
`scrapers/athletic-net/import_meet_results.js` — the import bridge. scraped result→results row via
event_resolver (event_type_id) + name_parser + athlete match by athletic.net id (athletes.athletic_net_url,
77,956/141k=55% have it) with create-if-new + mark parser (time mm:ss/NN.NNa; field "5.08m"→meters) +
environment from meet season. `node import_meet_results.js <db_meet_id> [--commit] [--json f] [--limit N]`
(Node 20). Dry-run reports mapping quality; --commit inserts + stamps meets.results_source='athletic_net',
results_status='imported'. **PROVEN: MIAC 2026 (db meet 12949) filled 0→1,272 results, 44/44 events resolved,
0 null event_type_id, 359 w/ wind, 166 new athletes created, source=athletic_net.** Bugs found+fixed during
build: (a) 12 athletic.net short event codes missing from aliases (110mh/100mh/400mh/300mh/3ksteeple/2ksteeple/
shot/tj/discus/wt/10-km→10000m/5-km→5000m) — ADDED to prod event_aliases (verify ids: 5-km must=5000m NOT
37=8k XC, that was a caught mistake); (b) blank-name rows (relay/empty) hit full_name NOT NULL → now skipped.
DEDUP FIX (committed 04c4ab8): matching by anet-id ALONE re-created ~145/166 "new" athletes that already
existed without an athletic_net_url (measured 87% dup). FIXED — added name+gender fallback: anet-id match →
else existing by name+gender USED ONLY IF EXACTLY ONE (never guess ambiguous) + backfill their athletic_net_url →
else create. Result on MIAC re-run: new athletes 166→29, name-colliding dupes 145→**8** (the 8 = ambiguous
multi-match names, safe-created NOT silently merged; caught by normal dedup later), 137 existing athletes linked.
Athlete lookups scoped to the meet's names/ids (light: ~few queries, not the full 77k load).
KNOWN LIMITATIONS (acceptable): new athletes land Unattached (school matching deferred); no dedup vs existing
RESULTS (fine — only run on EMPTY meets); unique-name+gender match could rarely hit a same-named different person
(low risk, better than mass-dup). MUST re-import cleanly if a meet was filled by the pre-fix bridge (delete its
results + the just-created dup athletes first, as done for meet 12949).
NEXT: batch the bridge over the ~107 other empty athletic.net meets; then orchestrator; then meet-discovery
writes intentional columns.

## BATCH 2026-07-18: `scrapers/athletic-net/batch_import.js` — fixed + verified + FULL RUN launched
Batch runner over meets with athletic_net_results_url. **TWO dup bugs found+fixed (tranche-1 created dups, fully rolled back):** (1) was targeting `results_status != 'imported'` which included meets that ALREADY had TFRRS results → imported on top = dups. FIX: import ONLY genuinely-empty meets (exact per-meet count via head:true; NOT .in() which caps at 1000 rows and misclassified big meets). One meet, one source. (2) fingerprint guard used raw mark → athletic.net "10.35a" ≠ TFRRS "10.35". FIX: normMark strips trailing letters/units so cross-source dups are caught. Commit fb340af.
**Verified tranche (5 empty meets, 2,423 results): dup_results=0 (normalized check); new athletes 493, only 36 (7%) name+gender-collide with a schooled athlete w/ results — down from tranche-1's 87% — and those are conservative same-name-DIFFERENT-school creates (never wrong-merge; the ~7% Unattached tail gets resolved by the multi-signal dedup pass).** Candidates 558 → 451 already have results (skipped) → 107 genuinely empty (MIAC + tranche-2's 5 done; ~101 left).
**FULL RUN COMPLETE 2026-07-19: 108 athletic_net-sourced meets, 57,974 results imported, only ~10 dup results in 58k (0.017%) — guards held.** All 102+4 empty-with-anet-link meets processed (2 had 0 results on athletic.net = genuinely unposted, marked imported so they stop retrying). Batch idempotent/empty-only/dup-guarded worked as designed.
REMAINING (not an athletic.net gap): **~203 empty 2026 meets still have NO athletic.net link** (the "no link at all" + non-anet-timing meets). They need LINK-DISCOVERY first (USTFCCCA weekly directory → tfrrs+anet links, no fuzzy) before scraping. THEN: (a) fold the ~7% new-Unattached tail into the next multi-signal dedup pass; (b) fix meet-discovery to write intentional link columns going forward (so new meets auto-sort); (c) build the orchestrator (athletic.net vs TFRRS compare per meet).

## IMPORT BRIDGE 2026-07-17: `scrapers/athletic-net/import_meet_results.js` + the 3-layer anti-mess design
Bridge = scraped JSON → results table via event_resolver + name_parser + mark parser; sets meet_id, results_source='athletic_net', results_status='imported'. Usage: `node import_meet_results.js <db_meet_id> [--commit] [--limit N]` (Node 20).
**LESSON (caught by user): first version matched athletes ONLY by athletic.net id → re-created ~145 dup athletes (existing TFRRS athletes lack athletic_net_url 45% of the time). Cleaned up (deleted meet 12949 results + 166 newbies, reset meet) and rebuilt with the 3-layer design:**
1. **Identity crosswalk:** internal athlete_id = the person; tfrrs_athlete_id + athletic_net_url = source pointers. Every confident match BACKFILLS the missing athletic_net_url → DB self-heals → exact-ID matching takes over across imports.
2. **Athlete cascade:** (a) exact athletic.net id → match; (b) unique name+gender AND schoolCorroborates(scraped team, athlete's school — shared distinctive token ≥4 chars, generic words excluded) → match + backfill URL; (c) else CREATE Unattached (ambiguous/same-name-diff-school = different person until dedup says otherwise; never guess).
3. **Result fingerprint guard:** for matched athletes, load existing results (athlete|event_type_id|mark_raw) within meet.date−7..end_date+7. Existing row with meet_id NULL = same performance from a TFRRS athlete-history scrape → **CLAIM it (set meet_id, no new row — heals the 563k unlinked rows as a side effect)**; already-linked → SKIP (also makes re-runs idempotent).
**MIAC (12949) imported: 1,272 results, 890 anet-id matches + 322 name matches + 29 new athletes, 137 athletes got anet URLs linked, verified 0 dup results.** (Note: MIAC's name-matches predate the school-corroboration version; season-overlap was verified post-hoc instead.)

## BUILT + WORKING 2026-07-17: `scrapers/athletic-net/scrape_meet_results.js` (committed f625d6a)
The OLD `platforms/athletic_net.js` is STALE — it looks for `a[href*="/event/"]` + `<tr>` rows that no longer exist on athletic.net → silently returns 0 events (THAT's why athletic.net data never landed; it looked like it ran). NEW scraper targets the real current DOM, verified end-to-end on MIAC 2026 (live 63156 → www meet 631684 → 44 events → 145 results, all fields populated).
**Confirmed page structure (current):** live URL has a **"View on AthleticNET" link → www.athletic.net/TrackAndField/meet/{wwwId}** (this is the live→www bridge, no search needed!). Event links = `/TrackAndField/meet/{id}/results/{m|f}/{divId}/{eventCode}`. Results are **div.result-row** (NOT tables, trCount=0). Per-row selectors: `.place-column`, athlete via `row a[href*="/athlete/"]` (NOT the name el's first <a> = that's the /profile/{handle} avatar link!), team via `row a[href*="/team/"]`, mark `.secondary .title`, `.tertiary-content` carries "SB • Yr: Sr • +10pts • 4.0m/s" (parse wind m/s, year, points, PR/SB). Output per result: place, athlete_name, athletic_net_athlete_id, athletic_net_profile (handle — good for social profiles), team_name, athletic_net_team_id, mark_raw, wind, year_in_school, points, is_sb, is_pr. Cloudflare beaten by puppeteer-extra+StealthPlugin (already installed; Node 20 via /Users/mk/.nvm/versions/node/v20.20.0/bin/node). Also `Complete Results (PDF)` on static.trackmeetio.com CDN (rejected — not every meet has one, layouts vary).
**STILL TODO to close the loop:** (1) IMPORT BRIDGE — scraped JSON → results table via AthleteResolver+event_resolver+name_parser, set meet_id + results_status='imported' + results_source='athletic_net' (map athletic_net_athlete_id via athletic-net/map-athletes.js). (2) Batch over the 108 empty meets w/ athletic.net links. (3) Orchestrator (athletic.net vs TFRRS compare). (4) Update meet-discovery to write intentional link columns.

## KEY FINDING 2026-07-16: "AthleticLIVE" is the common platform (results path CONFIRMED)
`live.athletic.net/meets/{liveId}` is just a front door — it REDIRECTS to the timing company's
own AthleticLIVE instance (e.g. 63156 → live.herostiming.com/meets/63156). ALL these timing hosts
(herostiming, blacksquirrel, michianatiming, jdlfasttrack, etc.) run the SAME **AthleticLIVE**
software — that's why one scraper covers the whole family. The AthleticLIVE meet page has the
FULL results in the DOM: team scores (M+W), every event marked "Official", per-event results,
a "Complete Results (PDF)" link, and a "View on AthleticNET" link. Cloudflare-protected → must go
through puppeteer (existing `platforms/athletic_net.js` already handles this family). Likely
websocket-driven live data, but results render to DOM → DOM-scrape works.

**RESULTS PATH — CONFIRMED VIABLE, no matching needed:** ~103 empty meets already store their
`live.athletic.net/meets/{id}` URL. Pipeline: for each → open the URL (redirects to the
AthleticLIVE host) → puppeteer-scrape the DOM results (reuse/extend platforms/athletic_net.js) →
import via AthleticResolver + event_resolver + name_parser → results_status='imported'. THIS is
the highest-value, lowest-risk fill (URLs in hand, one platform, data confirmed present).

## CORRECTED 2026-08 (user): TFRRS's 99% is CHRONOLOGY, NOT SUPERIORITY
The project started on TFRRS and scraped only TFRRS for years; athletic.net was added 2026-07.
So "TFRRS has ~99% of the data" reflects what was scraped FIRST — **both sources do the same job**.
**Don't confuse engine maturity with source quality:** the 2026-07/08 head-to-head made the TFRRS
engine look better (100% team_id, relays native, 0 dup athletes) vs athletic.net (no team_id,
relays dropped) — but every one of those was a BUG IN MY NEW athletic.net bridge (since fixed),
not a limitation of athletic.net. Raw athletic.net data is actually RICHER (wind, splits, PB/SB,
year, points) and fresher (live). Judge per-meet coverage, not engine age.

## CORRECTED 2026-07-19 (user pushback — I kept forgetting TFRRS): **BOTH SOURCES, TOGETHER**
TFRRS is the **FOUNDATION**, not "secondary": it built ~99% of the DB (12,570 meets / 11,853 with results) vs athletic.net's 108, AND owns canonical athlete identity + rankings. athletic.net is the **gap-filler + go-forward live feed**. NEVER frame it as switching from one to the other; they coexist. Rules: one meet one source (only import into genuinely-empty meets, exact per-meet count) · `meets.results_source` = provenance record · shared athlete identity (tfrrs_athlete_id + athletic_net_url both point at one internal athlete_id; matches backfill the missing pointer) · normalize marks cross-source (10.35a vs 10.35).
**→ Created `/CLAUDE.md` (auto-loaded EVERY agent session) so this never needs re-explaining.** It carries the two-source model, the hard rules (dedup discipline, verify-after-write, weak-instance backfill, Node 20, no co-author), and a docs index. Keep it current — it is the orientation file.

## SUPERSEDED 2026-07-16 framing (athletic.net "PRIMARY", TFRRS "SECONDARY") — see correction above
athletic.net primary (live/complete/rich, links already captured at discovery — 2026 meets: 563 have one; 2025: 0, feature added ~start of 2026). TFRRS secondary (fallback coverage + canonical athlete identity/TFRRS-ID + rankings). **Link columns now INTENTIONAL** (per user — stop dumping every link into meet_url): `meet_url`=raw LIVE/timing link (any system: athletic.net-live, leonetiming, flashresults, milesplit, herostiming…); `athletic_net_results_url` / `tfrrs_url` / `wa_results_url`=per-source RESULTS links. Did the SORT: copied 563 athletic.net links from meet_url→athletic_net_results_url (COPY not move — a live.athletic.net link is BOTH the live link AND the results source). Added **`meets.results_source`** column (athletic_net|tfrrs|ustfccca|timing_site|manual|other, CHECK) = which source filled the meet (migration `20260716_add_results_source_tracking.sql`, applied+committed). USTFCCCA = weekly phone book giving both tfrrs+athletic.net links for CURRENT meets (no fuzzy); fuzzy only for historical backlog. **ORCHESTRATOR** ("scrapers talk to themselves") = one coordinator scrapes both available sources per meet, COMPARES (result count/coverage/richness), picks best or merges (athletic.net marks + TFRRS identity), records results_source. NOT built yet — the spec is the doc.

STATUS: reconnaissance DONE + results path CONFIRMED. Not yet built. The build = the DOM-scrape →
import bridge (the scraper engine, athlete mapping, and shared modules all exist). Search API is a
fallback for meets with no stored link (fragile for meets, good for athletes/teams). Logos PARKED
(user 2026-07-16) — better via the existing schools.logo_source wikipedia/athletic-site path.
Fresh-session build. Verify on ONE meet (scrape live.athletic.net/meets/63156 = MIAC) before batch.
