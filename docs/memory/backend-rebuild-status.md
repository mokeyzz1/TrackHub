## SESSION 2026-08-14/18: relays, guards, and prevention

Continues the 2026-08-10/12 purge. Everything reversible — `docs/RECOVERY.md`.

**DUPLICATES ARE NOW PREVENTED, NOT CLEANED UP.** Owner: *"why can't we just have something there
so it can prevent duplicates from happening... you keep deleting and re-deleting."* Correct.
Four unique indexes now exist; the important pair key on the **normalised** mark
(`lower(regexp_replace(mark_raw,'[ah]$',''))`) so `10.35a` and `10.35` collide. Verified by
inserting `22.82a` against an existing `22.82` → rejected. **This closed the cross-source gap that
blocked the dual-source athletic.net plan.** Expression indexes, not generated columns — checked
against the PG docs: a STORED column has the same per-write cost plus a full table rewrite, and
PG18 VIRTUAL columns cannot be indexed.

**DUP-3 finished — 40,210 relay rows** (13,716 round-label + 26,494 real-mark), 86,499 legs backed
up. **The tracker said 43,037, I "corrected" it to 674, the truth was 40,210** — my correction was
the wrong one. I over-narrowed the key after the A/B/C/D near-miss and trusted the narrow result
because it came with a dramatic story attached.

**4x100 repair — 163 meets, 2,953 relay rows** (463 broken → 300). DI Outdoor now shows 37.75.
Owner reported this THREE times before it was actually fixed: F7 repaired the parser and was
logged FIXED while 463 meets kept the broken data. **Use TFRRS, not athletic.net** — athletic.net
returns relay times with NO round label, and the app groups by round, so those rows look repaired
in the DB and are invisible on screen (cost a 44-row rollback).

**Also:** 45 empty 2025-26 meets filled (+9,171); 4 meets had a `tfrrs.org/results` URL sitting in
`meet_url`; the TFRRS recovery cascade proven on NCAA First Rounds (+4,157, verified by a perfect
East/West state partition).

### THE ROOT CAUSE OF THE REPETITION (owner named it)
*"Why didn't all that get fixed at the same time?"* Because I fixed the instance, not the class —
three times: parser without data, `results` without `relay_results`, a new insight without
re-checking the dedup it invalidated. Now `DEDUP_METHOD.md` §0: before closing anything, ask
**is the DATA fixed or only the code · where else does this pattern live · does this invalidate an
earlier fix.**

### SECOND RULE, learned three times in one hour
**A guard's WHERE must match the cleanup's WHERE.** Rows the cleanup skipped will violate a guard
that does not skip them too — `squad IS NOT NULL` (26,494), `team_id IS NOT NULL` (failed build),
`meet_id IS NOT NULL` (results index). Postgres was a more reliable checker than my own SQL: my
violation query returned zero twice while CREATE INDEX disagreed.

### DOCS ARE NOW IN ONE PLACE
37 files across 6 locations, with agent memory outside the repo entirely. Consolidated into
`docs/` (active · `memory/` · `reference/` · `archive/`) with `docs/README.md` as the index and
**`docs/OWNER_DECISIONS.md` read FIRST** — every decision, correction and technique the owner has
given, because I had been rediscovering them (the fuzzy-with-review approval, the link-column
warning, the AI-judge plan, the athlete-overlap technique).

### STILL OPEN
U1 merge the two scraper engines (pre-season) · U2 Unattached per-competition (**blocks claimed
profiles**) · U4/U5 frontend still text-matching · ~300 meets' 4x100 with no link · athlete-history
duplicates (1,524 groups, the last unguarded surface) · capture links weekly during the season.

---

## SESSION 2026-08-10/12: the duplicate purge — 477,503 rows removed, 21,683 repaired

Branch `backend-rebuild`, 25+ commits. Everything reversible — see `docs/RECOVERY.md` in the repo
for backup tables and rollback statements.

**Removed** (all backed up): DUP-2 within-meet round duplicates **452,752** · DUP-1 copied meets
**23,766** (33 meets) · DUP-5 athlete-history duplicates **976** · DUP-3 relay duplicates **674** ·
DUP-4 empty duplicate athlete records **12,518**. `results` 3,772,655 → ~3,295,161.
**Repaired:** 21,683 doubled mark codes (`NM  NM` → `NM`). Event coverage now **100%**.

**Recurrence closed (this was the point):**
- `results_no_exact_duplicate` — partial NULLS NOT DISTINCT unique index; blocks exact re-imports.
- **U8 SOLVED**: TFRRS renders an event as several tables (combined + one per heat/flight) and
  both scrapers walked ALL of them, emitting each athlete 2-3× with different round labels. That
  was the origin of ~370k rows. Fixed via `scrapers/shared/collapse_duplicate_rounds.js` in BOTH
  engines; **verified end-to-end** on the live 2026 DI Outdoor meet (Long Jump 48→24, 0 duplicates,
  prelim/final pairs preserved). Keep `verify-no-duplicate-rounds.js` as a pre-release check.
- Frontend groups by `event_type_id` (fixed 25,093 athletes seeing one event as up to six).

### WHAT I GOT WRONG — read before trusting any documented number

**Three documented issue sizes were materially wrong.** M1 overstated 3×. **DUP-3 overstated 98×**
(43,037 claimed, 674 real). DUP-2 *understated* (416k → 453k). **Re-measure before acting.**

**Near-misses caught only by verification, not by the rule being right:**
1. **DUP-3 relays.** Was about to delete 29,184 rows + 37,561 cascading legs; **93% of those legs
   named athletes absent from the surviving row.** A school enters A/B/C/D squads, and when they
   all DNS they share `mark='DNS'` + `place=NULL` — identical on every column, four different
   teams. **Relay identity is the LINEUP, never the columns.**
2. **DUP-4 athletes.** First "empty" test would have destroyed roster history + scraped PRs for
   **2,792 athletes** via `ON DELETE CASCADE`.
3. **DUP-1 attribution failed FOUR times** before the host-location test worked (largest-same-date
   named a real unrelated championship as owner of Big Ten results; largest-link-backed named a
   meet holding 0 of the rows).

**The rule that finally worked for DUP-1:** the real meet's host state (`meets.location`) appears
among its own schools' states; the copy's does not. Evidence, not structure.

**Process lesson that cost real capability:** the first relay backfill wrote 3,271 rows without
saving their ids, so afterwards there was no way to prove it hadn't created duplicates and no way
to roll back just those rows. **Always write the id list BEFORE applying.**

### DOMAIN CORRECTIONS FROM THE OWNER (I had these wrong)

- **Heats ARE prelims.** "Heat 2" = prelim heat 2, a subdivision of the round, not its own round.
  There is no Final 1/2/3. Many meets are **timed finals** — run once, in a heat seeded slowest to
  fastest, and that heat IS the final, so one run legitimately carries both a `Heat N` and a
  `Finals` label. Measured: 78% of events producing such a pair were timed finals.
- **Mark codes ARE results.** `DNS`/`DQ`/`FS`/`DNF`/`SCR`/`NT` are outcomes, not missing data —
  never deletion candidates. I twice framed them as "absence of a performance"; that framing is
  what produced the bad relay key. Full reference incl. `ENR` (en route split), `NP` (no points,
  multi-events), `NWI` (no wind indication): `docs/MARK_CODES.md`.

### OWNER DIRECTION (2026-08-12)
Not switching sources — **link both, make one primary**. TFRRS keeps identity
(`tfrrs_athlete_id`) and the historical archive; athletic.net leads on new meets for its richer
detail (**big Q vs small q qualifying**, splits, wind). Blocker: the dedup guard keys on
`mark_raw`, and athletic.net writes `10.35a` where TFRRS writes `10.35` — needs a normalized mark
column first. Owner is **not reviewing changes individually** ("letting you just cook"), which is
why `docs/RECOVERY.md` exists.

### STILL OPEN
DUP-1 pre-2026 (needs the container query indexed — it timed out repeatedly) · DUP-1's 2 rename
cases + 50 mutual pairs · DUP-4 real merges (blocked on **U2**, Unattached per-competition) ·
normalized mark column · M7 (1.3M numeric marks never parsed) · frontend still text-matching (U5/U4).

**Unverified:** ~13 of the 33 DUP-1 meets relied on the location rule without hand-checking.

---

---
name: backend-rebuild-status
description: "Single source of truth for the TrackHub backend rebuild — what's done, what's left, branch, and the safe-backfill method"
metadata: 
  node_type: memory
  type: project
  originSessionId: b63228a2-f910-41f5-bd61-21edda8f8e0c
  modified: 2026-08-06T19:11:49.850Z
---

**Branch: `backend-rebuild`** (all rebuild work lives here; `main` has the events catalog migrations + design docs, pushed). Merge branch→main when the rebuild is verified. Goal: clean, portable, migration-based, self-documenting backend (see `docs/TARGET_SCHEMA_BLUEPRINT.md`). Off-season (July 2026) = safe window, no incoming data.

## DONE (applied to prod DB, verified)
- **Meets:** fixed 271 stale meet_urls; merged 43 duplicate meets; backfilled `results.meet_id` (1.64M rows). ~9 name-variation dup meets remain (JDL/ASICS type). See [meet-url-backfill-state].
- **Events:** `event_types` (61 canonical) + `event_aliases` (1,135 raw→event) + `unmapped_events` log built & seeded. `results.event_type_id` = **100%** tagged. Validated vs NCAA. See [app-domain-logic], `docs/EVENT_MAPPING_PROPOSAL.md`.
- **Seasons/environment:** recomputed `meets.season` for all 12,678 (fixed hardcoded-'indoor' bug); fixed `scrape_meets.js`+`scrape_meets_github.js` (deriveSeason). `results.environment` = **96.6%** (indoor/outdoor/xc); 124,269 (3.4%) genuinely unknown (no date/meet/keyword — AI-or-unknown floor). Recovered ~97k date-less dates too. See [track-season-model].
- **Cleanup:** dropped 3 duplicate indexes (results 14→12); enabled RLS + public-read on relay_results/relay_athletes (was anon-writable).
- Migrations in `supabase/migrations/2026071*`: event catalog+seed, drop_duplicate_indexes, recompute_meet_seasons, enable_rls_relay_tables. (event_type_id & environment backfills were one-time DATA ops, not migrations.)

## TODO (remaining rebuild)
1. **Athlete de-dup** — ~19k dup rows by name+school, 35k null tfrrs_id, 39k Unattached; add uniqueness guard. Needs human judgment on merges.
2. **Computed PRs** — replace scraped `athlete_prs` with computed (best legal mark per athlete × event_type × environment). See [app-domain-logic] open question.
3. **FKs** — add `results.meet_id`/`relay_results.meet_id` FKs; clean 222 pre-existing orphan meet_ids (94641/94729).
4. **Empty-table cleanup** — drop dead tables (events/event_entries/meet_entries), adopt external_ids, decide conferences/regions.
5. **Scraper update** — importers resolve event names via `event_aliases` (flag misses to `unmapped_events`) instead of code normalization.
6. **Frontend migration** — app reads by event_type_id/meet_id (the user-visible payoff; riskiest step).
7. Merge branch→main.
Also pending: ~830 genuinely-missing meet results; frontend/UI polish; rankings/head-to-head/progression features.

## SAFE-BACKFILL METHOD (hard-won — this DB is weak/write-slow)
- A too-big/no-timeout backfill OVERLOADED prod once (orphaned server-side UPDATEs held locks for hrs; killing the node client does NOT kill server queries — use `pg_terminate_backend`).
- Rules that work: (1) small batches (15-25k), (2) HARD `statement_timeout` ~50s, (3) PK-driven CTE `WITH batch AS (SELECT ... WHERE result_id BETWEEN lo AND hi AND <col> IS NULL) UPDATE ... JOIN` — NEVER let it drive off a text column (full scan), (4) throttle (sleep between batches), (5) reconnect-on-drop, (6) let autovacuum finish (dead_tup→0) after.
- **Filtering `results` by an unindexed col (`environment IS NULL`, `event_type_id IS NULL`) = full scan = times out.** Drive updates from SMALL tables (meets, event_aliases) via indexed `meet_name`/join instead, or batch by result_id PK ranges. Don't run big COUNT(*) FILTER over results — use bounded windows.
- User idea that worked great: infer a meet's environment from its OTHER events (a meet with a 60m is indoor → its 200m is indoor too). Layered recovery: event → date → recovered-date → meet-mates → meet-season → name-keyword → AI/unknown.

## UPDATE 2026-07-15: Athlete de-dup (partial — safe wins done)
- Merged 85 same-tfrrs_id dupes (real+Unattached-copy pattern) + 294 shared-exact-result clusters = **384 duplicate athletes removed** (147,749 → 147,365). 3,080 results reassigned, 2,271 redundant performances deduped. Merge mechanism: reassign refs (results/relay_athletes/athlete_team_seasons/athlete_prs/meet_entries/live_results) to canonical (kept = most results), dedup results by (event_type_id,mark_raw,date), delete dupe athlete. NOTE: per-dupe result-dedup query is slow (~1s/dupe) — run merges in BACKGROUND (foreground Bash caps at 2min); script is idempotent so re-run resumes.
- KEY LEARNING (from user): TFRRS ID is NOT a reliable same/different signal — the SAME person often has 2 different tfrrs_ids (transfers/re-scrapes). e.g. Anastasia Kirillov 4411/4412 = 34 shared meets, obviously one person, conflicting ids. So DON'T penalize tfrrs conflict. Real signals: shared exact result (event+mark+date)=SAME (definitive); same date + different meet = DIFFERENT (definitive, can't be 2 places); different gender = DIFFERENT.
- **Duplicate-athlete classification (real schools, excl. Unattached 1835):** 8,071 same-name groups → 294 provably SAME (merged), 1,343 provably DIFFERENT (left), ~6,480 AMBIGUOUS.
- TODO: (a) the ~6,480 ambiguous → **AI-judge pass** (feed compiled profile: name/school/tfrrs/timeline/events/meets; rules for definitive, AI for ambiguous — user's idea). (b) Unattached (school 1835, ~39k, many empty 0-result shells) — separate cleanup, deferred by user. (c) uniqueness guard on tfrrs_athlete_id after full dedup. Heavy per-pair scoring over all same-name athletes TIMES OUT on this instance — use the lighter name-level cat_same/cat_diff temp-table approach.

## UPDATE 2026-07-15: Classifier built (`scratchpad/classify_all.js`) — the "best way"
Turned the AI judgment into a rule+signal classifier over ALL same-name groups (real schools, excl 1835). Tractable pieces that WORK: temp table `sn` (same-name athletes) + name-level `cat_same` (shared exact result → SAME) + `cat_diff` (same date/diff meet → DIFFERENT) + a LIGHT per-athlete profile (school, gender, min/max date, event codes, meet names — NO heavy resig/daymeet arrays that timed out). Pairwise rules run in NODE.
**Rules (2-member groups):** gender differ→DIFF · shared exact result→SAME · same-day-diff-meet→DIFF · else: same-school+compatible-events→SAME (the track/XC split, dominant dup cause) · same-school+incompatible(distance-vs-throw/jump)→REVIEW · cross-school+concurrent-timeline+no-shared-meets→DIFF (can't be 2 places) · cross-school+sequential+shared-events→SAME (transfer) · else REVIEW. Empty shell (0 results)+same school→SAME.
**Result:** SAME=4,995 · DIFFERENT(leave)=1,221 · REVIEW=1,591 (incl 945 3+-member groups). SAME split into **same-school 3,967 (SAFE)** + **cross-school 1,028 (transfer guesses, HELD for review)** — plans in `scratchpad/{same_school,cross_school,classify_same}_plan.json`. (Bug fixed: pg returns count() as string → canon selection did string compare "9">="14"; coerce Number() first.)

## UPDATE 2026-07-15b: same-school merges DONE
Merged all **3,967 same-school dupes** via `scratchpad/merge_same_school.js` (throttled/idempotent, 0 errors, 0 retries). **35,317 results reassigned; athletes 147,365 → 143,398** (delta exactly 3,967). deduped=0 (shells + track/XC splits hold distinct results). STILL TODO in dedup: see next update.

## UPDATE 2026-07-15c: cross-school HIGH merged
Ranked the 1,028 cross-school pairs by transfer-confidence (`scratchpad/cross_analyze.js`: event-set Jaccard≥0.34 OR ≥3 shared events OR ≥2 shared meets, not throw/jump-vs-dist incompatible, rcMin≥2). Split: **734 HIGH (confident transfer)** + **294 REVIEW**. Merged all **734** via `scratchpad/merge_cross.js` (0 errors/retries). **13,782 results moved; athletes 143,398 → 142,664** (delta 734). **DEDUP TOTAL: 5,085 removed** (384 + 3,967 + 734), 147,749 → 142,664.
STILL TODO in dedup: (a) **294 cross-school REVIEW** (`cross_review.json`) — ambiguous profile shifts (e.g. kaylie goad 400mH↔6kXC), need human/LLM eyeball; (b) **1,591 review** — 945 groups of 3+ members (classifier only auto-did clean 2-member) + ~646 ambiguous 2-member; (c) Unattached (1835) ~39k shells, deferred; (d) uniqueness guard on tfrrs_athlete_id after all dedup. All merge plans/scripts in scratchpad (idempotent, reusable via the reassign→dedup→delete mechanism).

## APPLIED 2026-07-15: `supabase/migrations/20260715_add_meet_id_fks.sql`
FK on results.meet_id + relay_results.meet_id → meets. **DONE:** cleaned 222 orphans (0 remain), added both FKs NOT VALID then VALIDATE — both `convalidated=true`. Weak-instance path worked via MCP execute_sql (the anti-join scan + VALIDATE completed without timeout). results.event_type_id FK already existed. meet_id stays nullable (563k legit nulls). ON DELETE RESTRICT. event_id = dead col, left for the drop step. Supporting indexes on both meet_id cols already exist.
TODO 3 in the rebuild list is now DONE (FKs + orphans). Remaining structural: computed PRs, empty-table drops + external_ids, scraper event_aliases resolution, frontend read-by-id, merge branch→main.

## UPDATE 2026-07-15e: scraper event_aliases resolution DONE (TODO 5)
New shared module `scrapers/shared/event_resolver.js` (EventResolver: load event_aliases→Map once, resolve(raw)→event_type_id via trim/lowercase key, log misses, flushUnmapped→unmapped_events summing seen_count). Wired into BOTH result importers: `tfrrs/meet-scraper/import-meet-results.js` + `tfrrs/athlete-scraper/import-results-to-db.js` — each now sets `event_type_id: events.resolve(r.event_name)` on insert and reports/persists unmapped names (persist gated on --commit). Syntax-checked + live smoke test: 1,096 aliases load, 200/200m/200 Meters→23, LJ→53, 8k→37, unknowns→null+logged. Exact-match+log is intentional (fuzzy normalizing is what caused the original drift). NOT wired: the old tools/scrape-and-import.js (legacy).

## OPS GOTCHA 2026-07-16: scrapers need Node 20+ (shell defaults to 18)
Any scraper using `@supabase/supabase-js` or puppeteer CRASHES on Node 18.18.2 (the shell default) with `ReferenceError: File is not defined` (undici needs Node 20's File global). nvm has v20.19.4/v20.19.6/v20.20.0/v22.22.0 installed. Run scrapers with `/Users/mk/.nvm/versions/node/v20.20.0/bin/node`. (Direct-pg backfill scripts work on 18 since they use `pg`, not supabase-js.) Consider adding `.nvmrc` (20) to the repo.

## MISSING RESULTS PROGRESS 2026-07-16: matcher fixed (TFRRS HAS all these)
CORRECTION: empty meets ARE on TFRRS (user: TFRRS aggregates ALL college meets regardless of timing system). They weren't matching due to NAME normalization, not absence. Rewrote `meets/backfill_result_links.js` matcher (committed): token-overlap (strip noise words track/field/championships/outdoor/year + keep distinctive tokens) with EXACT-DATE ±2day anchor — NOT similarity-fuzzy. Went 3→17→**70** auto-matches for outdoor-2026 (223 candidates), ZERO false positives (threshold≥90 correctly rejects American Rivers≠American, NJCAA Region≠Indoor, Cal State LA≠Cal). Diagnostic added (prints unmatched near-misses w/ best score). Of 223: **70 matched, 46 near-miss (mix of multi-day-date-offset recoverables like Drake Relays + genuinely-different held), 109 no-signal (NOT in the 962 TFRRS results_search rows — needs investigation: is results_search exhaustive? dupes? HS?).** Run with Node 20. NEXT: (1) `--commit` to bank the 70 (safe, just sets tfrrs_url+results_status), run full 2025-26 range; (2) review the ~20 recoverable near-misses; (3) investigate the 109; (4) then scrape results via sync-weekend-results.js (stored tfrrs_url, NO --fuzzy).

## MISSING RESULTS 2026-07-16: ~410 empty meets in 2025-26 seasons
Empty meets (no results by meet_id): Outdoor 2026=164, Indoor 2026=117, Indoor 2025=117, XC 2025=10, Outdoor 2025=2. **ALL lack tfrrs_url** (only 3 have a tfrrs meet_url; 230 have a non-tfrrs timing-site meet_url; 177 have none). PIPELINE (fuzzy-free preferred): (1) `meets/backfill_result_links.js --source ustfccca --since .. --until .. [--commit]` reads USTFCCCA's authoritative directory + matches DB meets at score≥90 (exact name+date, NOT similarity-fuzzy; substring name needs location+date corroboration) → sets tfrrs_url + results_status='tfrrs_available'; (2) `sync-weekend-results.js` WITHOUT --fuzzy scrapes the stored tfrrs_url (source='stored_tfrrs_url'). User OK with fuzzy fallback for old meets IF matches are reviewed before commit (fuzzy = wrong-meet risk). `sync-weekend-results.js` args: --days N, --fuzzy, --commit; getMeetsNeedingResults(daysBack) works a today-minus-N..today window.

## UPDATE 2026-07-15k: SCRAPER HARDENING + the duplication trap
**KEY:** tonight's importer fixes (orphan-dedup, event resolution) had ONLY landed on `import-meet-results.js` — but the ACTUAL weekly engine is `tfrrs/meet-scraper/sync-weekend-results.js` (45KB monolith, does scrape+import via its own `importResults` at ~L866). It had NONE of them. Root cause = TWO import paths with copy-pasted logic ("fix one, miss the other"). Ported all 4 to the weekly engine (committed 7509ebc): (1) existingUnattachedByName pre-load + reuse, (2) result-insert row-by-row retry (was `errors+=batch.length` = silent 500-row loss), (3) `events.resolve()` event_type_id on individual + relay_results + relay-leg inserts + flushUnmapped, (4) parseName first/last on insert. Shared modules `scrapers/shared/{event_resolver,name_parser}.js` now used by BOTH paths.
**STILL TODO (scraper): CONSOLIDATE the two import paths into one shared importer** — the duplication is the real mess-generator; until then every fix must be applied twice. Other creation paths also wired with parseName: import-new-athletes.js. Legacy tools/scrape-and-import.js NOT touched.
**User direction 2026-07-15:** scrapers are the foundation — harden them so the DB never drifts back. Also MISSING RESULTS for rest of 2026 Outdoor season → backfill with the hardened engine (fix scrapers FIRST, then fill). New event spellings now auto-log to unmapped_events; add them to event_aliases periodically.

## UPDATE 2026-07-15j: name split DONE (first/last 44%→99.9%)
`scratchpad/name_split.js` (dry-run/--apply). Parses full_name→first_name/last_name for the 78,278 rows missing first_name. Parser: strip trailing suffixes (jr/sr/ii/iii/iv), first=token[0], last=final token + preceding surname particles (van/von/de/del/della/der/den/di/da/dos/la/le/du/st/san/santa/etc, chained e.g. "van der Heijden"), middle names dropped, skip single-token/first==last/has-digit. **78,186 split, 92 skipped** (mononyms, "(M63)" age tags, "Ahmed Ahmed" dup-token artifacts). Result: first_name/last_name 141,380/141,472 = **99.9%**. Not committed (data op). Note: unhyphenated compound surnames (e.g. "Rivkin Brennan") lose the middle token to last=Brennan — acceptable default, first_name always correct.

## UPDATE 2026-07-15i: gender backfill DONE (real-school athletes now 99.96% gendered)
`scratchpad/gender_backfill.js` (dry-run/--apply). Signal cascade, set only where signals agree, skip conflicts, only touch null rows: (1) team gender via results.team_id→teams.gender, (2) relay team gender via relay_athletes→relay_results.team_id→teams.gender, (3) gender-specific events (110mH/Decathlon/8k+10k XC→M; 100mH/Pentathlon/6k XC→F; skip ambiguous 60mH/5kXC/Heptathlon). Of 3,719 null-gender athletes who competed: **1,029 resolved (928M/101F), 24 conflicts skipped, 2,666 no-signal skipped** (mostly Unattached in gender-neutral open events, no team link — get gender via Unattached incorporation). Result: **real-school null-gender 752→41** (99.96% gendered). Not committed (data op, not migration). The 41 + 2,666 need name-inference (unreliable, avoid) or incorporation linking.

## ROOT CAUSE FOUND 2026-07-15: the 34,810 zero-result Unattached shells
**How they got created:** the weekly weekend sync (`scrapers/tfrrs/meet-scraper/import-meet-results.js`) EAGERLY creates an athlete row for every unrecognized participant (line ~194-208: no tfrrs_id → new Unattached athlete by name) BEFORE inserting results — then results leak through 3 holes while the athlete row stays: (1) relay-only participants (relays imported by a different script), (2) failed 500-row result batches that get SKIPPED WHOLE (line ~383 "Skip the batch"), (3) dupe-filtered marks. PLUS `seenAthletes` Set resets every run, so repeat post-collegiate competitors get a FRESH copy every weekend. ~3k orphans/Monday × season = 34,810.
**Forensics (proven):** of 34,810 shells, 10,358 (30%) share a name with an athlete that HAS results (dup copies), 7,241 names are duplicated WITHIN the shell pile (the weekly-dup bug). Created in weekly batches (created_at clusters: 2026-04-13=4242, 02-23=3776, etc.; sequential id ranges).
**TWO fixes:** (A) SCRAPER FIX (do before next season): look up existing Unattached athletes by name in the DB (not just this run's seenAthletes) before creating; don't strand athletes when result insert fails. (B) DATA CLEANUP = part of Unattached incorporation (deferred): merge the 10,358 name-matches into real records, collapse the 7,241 intra-pile dups, keep the rest as post-collegiate profiles.

## KEY INSIGHT 2026-07-19 (user clarified — USE THIS LATER): "Unattached" is PER-COMPETITION
**Unattached = competing WITHOUT representing a school AT THAT MEET.** It's a property of the
COMPETITION, not the person. Who runs unattached: (1) **post-collegiate athletes — the majority**,
(2) enrolled athletes who can't represent the team (redshirt year, transfer sit-out, exhausted
eligibility, running unattached to preserve eligibility), (3) out-of-NCAA-season competition.
**The same person can be unattached one weekend and score for their school the next.**
**MODEL MISMATCH (the important part):** we store it as an ATHLETE property
(`athletes.school_id=1835` — 47,186 athletes, 50,543 results, and **0 of those results carry a
team_id**; 2 unused Unattached teams exist). Correct model = per-result: `results.team_id` → the
Unattached team for that meet, athlete keeps their school affiliation.
**CONSEQUENCE — this is the root of the visible duplicates:** because unattached is person-level,
one human's unattached record and their college record become TWO athletes. That's the single
biggest dup source (~10,358 name-matches). Dupes ARE user-visible in the app (e.g. "Obiora Okeke",
"Mena Scatchard" each have extra Unattached copies).
**SEQUENCING:** fixing `results.team_id` is the FOUNDATION for both the unattached model and the
duplicate problem — arguably higher value than adding relay data, because it fixes what's wrong
rather than adding more. (team_id is also NULL on all ~58k athletic.net results — same root.)

## IMPORTANT (user, 2026-07-15): UNATTACHED ATHLETES ARE NOT JUNK
School 1835 "Unattached" = **post-collegiate athletes** (done with college, still competing).
User WILL incorporate them into the app (pro/alumni athletes — fits the social-app vision).
Do NOT treat them as deletion candidates. The deferred "Unattached cleanup" = dedup/identity
work (link them to their collegiate records where possible), NOT purging. 37,801 of them
currently lack gender; 34,839 have zero individual results (may still have relay legs or
just uncaptured post-collegiate marks).

## UPDATE 2026-07-15h: divisions dimension (research-validated, APPLIED)
Full-DB column profile done (pg_stats sweep — should have been done day 1). Key facts: ~20 columns 100% empty; athletes.gender 28% null, first/last_name 56% null (backfill targets); results.season_code 100% null (dead); athlete_prs.set_at/meet_name 98% null; live_results = 48 rows of test junk; conferences 1114 + regions 27 POPULATED (blueprint wrong). **Almost all "dead" columns are REFERENCED in frontend/scraper code (division 28×, event_id 38×, season_code 18×) → NO drops until the frontend migration removes the reads; drop-list documented.** User plans SOCIAL APP (accounts/claims/feed) → athletes.bio/profile_image_url/hometown/high_school/grad_year/primary_events are future scaffolding, KEEP.
**T&F org research (validated against NCAA/NAIA/NJCAA):** division = top-level world; conferences & regions belong to ONE division; region counts match DB (DI XC=9 ✓, DII=8 ✓, DIII=10 vs 9 in DB — 1 missing); NAIA = no regions (national standards) so NAIA nulls are CORRECT; NJCAA = 24 numbered regions (none loaded) + its own internal DI/DIII; **DI regions are SPORT-SPECIFIC — XC uses 9 regions, outdoor track = East/West prelims (derived, never stored)**; catch-all 'Independent(s)' conference spans DII+DIII → must split per-division (TFRRS-style) before enforcing school.division==conference.division.
**APPLIED `20260715_create_divisions_dimension.sql`:** divisions table (5 rows + governing_body) + division_id FKs on schools/conferences/regions + backfill (1699/1832, 1055/1114, 26/27 — unlinked = known junk: 133 'Other' schools, 59 no-division confs, 'Independent' region). Additive; text columns stay until frontend migration. Committed.

## UPDATE 2026-07-15g: relay event normalization DONE (event canon now 100% incl relays)
`20260715_relay_event_normalization.sql` (APPLIED). relay_results had 224,430 rows / 54 distinct event_names, only 76% resolvable (original build used '4x400m' forms, not the '4 x 400 Relay' forms). Added relay_results.event_type_id + FK, mapped the 21 unmapped relay spellings, backfilled ALL 224,430 (0 null). **Added 2 new event_types per user (they're genuinely distinct, don't approximate): 4x1500m, 4x1000m** (relay/time/both). Yard relays → metric equivalents (440y→4x400m, 880y→4x800m, 220y→4x200m), 4x Mile→4x1600m. Wired `import-relay-results.js` with EventResolver (both the relay_results insert AND its results-table leg insert get event_type_id + unmapped flush). event catalog now covers 63 event_types. Both individual results (100%) and relays (100%) are canonically tagged.

## UPDATE 2026-07-15f: committed + dead-table cleanup (TODO 4 partial)
Committed on backend-rebuild (no co-author, not pushed): FK migration (b540025), scraper event resolution (f858ee5), computed-PR draft (0d26098), dead-table drop (74f4a22).
**Empty-table cleanup — reality differed from blueprint.** Actual row counts: events 0, event_entries 0, meet_entries 0, conference_memberships 0, external_ids 0, BUT **conferences=1114 and regions=27 are POPULATED** (blueprint wrongly listed them empty — KEEP both, they power filtering). external_ids + conference_memberships KEPT (forward-looking/structural). **DROPPED event_entries + meet_entries** (0 rows, no code refs; also removed live_results.entry_id FK+all-null column that referenced meet_entries). **events NOT dropped** — `frontend/hooks/useMeetDetails.ts:47` still does `.from('events')` (returns [] today but DROP would error it); deferred to the frontend migration (TODO 6): remove that fetch, then DROP TABLE events. Migration `20260715_drop_dead_tables.sql` (applied).

## UPDATE 2026-07-15d: 3+-member groups clustered & merged
`scratchpad/cluster3.js` — union-find over the 945 same-name groups with ≥3 members. Per-pair signals incl. result FINGERPRINTS (event|mark|date shared → SAME definitive) + day-conflict (same date/diff meet → hard separator) + gender-conflict; transitive-contamination guard (any cluster containing a hard-conflict pair → REVIEW not merge). Correctly SPLITS a name into multiple people (e.g. "jacob jones" → 2 clusters). Result: 645 merge clusters (1,192 dupes) + only 3 review clusters. Merged all via `scratchpad/merge_cluster3.js`: **5,411 results moved; athletes 142,664 → 141,472**.
**DEDUP GRAND TOTAL: 6,277 removed** (384 + 3,967 + 734 + 1,192), 147,749 → 141,472.
REMAINING (the genuine judgment tail): (a) **294 cross-school REVIEW** (`cross_review.json`); (b) **3 conflict clusters** (`cluster3_review.json`); (c) **~646 ambiguous 2-member** (the classifier's REVIEW minus the 945 groups); (d) Unattached (1835) ~39k, deferred; (e) uniqueness guard on tfrrs_athlete_id after (a)-(c). These need human/LLM eyeball, not bulk rules.
