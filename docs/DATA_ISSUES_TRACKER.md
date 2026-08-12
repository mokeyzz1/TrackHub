# Data Issues Tracker

Living list of every known data problem, its size, and its status. Goal: a fully clean database
before the 2026-27 season (starts Dec 2026 / Jan 2027).

Companion docs: `BACKEND_PRIORITIES.md` (execution order) · `CLAUDE.md` (rules & context) ·
`memory/backend-rebuild-status.md` (problem/solution history).

**SCALE NOTE (owner, 2026-08):** every issue found by inspecting ONE athlete's profile turned out
to affect tens of thousands. Always measure an in-app symptom across the whole DB before deciding
it's minor.

**Working rules for every fix here:** dry-run with counts + samples first · verify after writing ·
never delete without a self-proving test · small throttled batches (weak instance).

---

## 🔴 OPEN — duplicates (user-visible, highest priority)

> **Issue IDs are `DUP-n`, `M-n`, `U-n`, `F-n` — they are NOT NCAA divisions.** These were
> originally `D1`/`D2`/`D3`, which in a track & field project reads as Division I/II/III and
> caused exactly that confusion (owner, 2026-08-10). Renamed. **Every fix in this document
> applies to the whole database — all divisions, all seasons.** Nothing here has ever been
> scoped to one division.


| # | Issue | Size | Notes |
|---|---|---|---|
| DUP-1 | **Cross-meet duplication** — the same performance attributed to 2-4 different meets | **26,846 extra attributions** (Outdoor 2026 alone) | Proven case: "Utah Spring Classic" (12436) holds **100% Arkansas Spring Invitational** (12337) data — 0 unique rows, athletes all from AR/IA/KS/KY/MO/OK. Owner spotted it: an athlete showing a meet she never attended. **Fix:** find meets with zero unique results, corroborate by geography, delete the copied rows (meet returns to empty = accurate). |
| ~~DUP-2~~ | ~~Within-meet round duplicates~~ | **DONE 2026-08-10 — 452,748 rows removed** | Whole-DB re-measure found 441,314 groups / 453,113 extra rows / 71,117 athletes. Removed in three runs (pilot 4,427 · full 447,853 · NULL-bug cleanup 468). **185 groups deliberately kept** — both `Preliminaries` and `Finals` at the same mark and place, genuinely ambiguous. `results`: 3,772,655 → **3,319,907**. Backup `results_d2_backup` + per-run audit JSONs. Rollback: `INSERT INTO results SELECT * FROM results_d2_backup;` See the DUP-2 detail section below. |
| DUP-3 | **Duplicate relay rows** | **674, not 43,037 — the old figure was 98% wrong.** 674 removed 2026-08-10 | Same meet+event+team+place+identical mark. Pre-existing (not from the athletic.net import, which was dup-guarded). The count rose from ~40,618 partly because linking previously-invisible relays (F5, M3) *surfaces* duplicates that were always there but unlinked. **Run DUP-3 dedup after the relay linking work, not before.** |
| DUP-4 | **Duplicate athlete records** | 294 cross-school + ~646 ambiguous + 3 conflict clusters | Root cause is U2 below. Visible in-app (e.g. "Obiora Okeke", "Mena Scatchard"). |
| ~~DUP-5~~ | ~~Duplicate athlete-history rows~~ (`meet_id IS NULL`) | **976 removed 2026-08-10; 707 left deliberately** | Found 2026-08-10 while building the dedup guard — a non-partial unique index could not be created because of them. **Not covered by `results_no_exact_duplicate`**, which is partial on `meet_id IS NOT NULL`. These are the dual-purpose rows that power athlete history rather than meet pages, so DUP-2's meet-scoped key never saw them. Same rule should apply, keyed on (athlete, event_type, mark, place, round) without `meet_id`. |

## 🟠 OPEN — missing / incomplete data

| # | Issue | Size | Notes |
|---|---|---|---|
| M1 | **Relay events with no time at all** | **RESCOPED 2026-08-09: 212 events / 1,091 rows / 157 meets** — not "619 meets" | The old figure counted every meet holding *any* timeless 4x100, which swept in legitimate DNFs. The real signal is an event where **every** team is timeless (≥3 teams) — physically impossible, so a parser failure. 4x100 177 events · 4x400 30 · 4x800 4 · DMR 1. The 83% 4x100 share matches the F7 colon bug. **Leave partial-DNF events alone — 4,901 of them are genuine.** ⚠️ **Only 61 of the 157 meets (39%) still have a results link** (14 TFRRS · 52 athletic.net); 96 have none and are unrecoverable (§1b moving window). Realistic ceiling ≈ 420 rows — **low value, do it last.** ~~Also note `NT` is the parser's fallback value~~ — **WRONG, corrected 2026-08-12: `NT` means *No Time* and is a legitimate result like any other code (`docs/MARK_CODES.md`).** The real signal is an event where *every* team is timeless with 3+ teams, which is physically impossible. |
| M2 | **All-DNF relay events** | 408 events / 406 meets (1,439 rows) | Consequence of F7. Recoverable from TFRRS *and* athletic.net. |
| M3 | **Relays still unlinked to a meet** | **22,865** (was 26,136 — 3,271 linked 2026-08-09) | 11,712 have a date but no matching meet. Of the 14,365 dateless ones, **3,271 are now linked** with corroboration (`backfill-relay-meet-id-nodate.js`); 11,094 remain and are **deliberately not linkable by name** — see the warning below. |

> ### ⚠️ Name-only matching is a trap — measured proof (2026-08-09)
> Of the 14,365 dateless relays, 5,907 had a `meet_name` matching **exactly one** meet row, which
> looks safe. It isn't: meets recur annually, and if only one edition is in `meets`, a relay from
> another year matches it and gets linked to the **wrong edition**. Testing each candidate against
> its own leg athletes:
>
> | outcome | rows | action |
> |---|---|---|
> | a leg athlete has a result **at that meet** | **3,271** | linked ✅ |
> | meet has no results — can't corroborate | 11 | skipped |
> | relay's legs aren't known athletes | 4 | skipped |
> | **meet has results, legs are known, none competed there** | **2,621** | **skipped — contradicted** |
>
> That 2,621 is what naive name-matching would have silently mislinked. **Rule: link a dateless
> relay only when one of its own leg athletes is independently recorded at the target meet.**
>
> **Process lesson (cost me the ability to verify):** the first run wrote 3,271 rows without
> saving their ids. A linked row is indistinguishable from a normally-linked one, so afterwards
> there was **no way to measure whether any of them duplicated a relay already on that meet**, and
> no way to roll back just those rows. The script now writes an audit JSON of every id *before*
> applying, and reports collisions after. **Never run a bulk change without that.** Bound on the
> unverified run: ≤3,271 rows, all corroborated links; any collisions are DUP-3-shaped and will be
> absorbed by the DUP-3 dedup pass, which keys on exactly (meet, event, team, place, mark).
| M4 | **Relays with no team** | 1,418 | Mostly juco — leg athletes aren't in the DB, so the team can't be derived. Lineups are still recorded. |
| M5 | **Results with no `team_id`** | 394,659 | Mostly pre-2024 (roster history only covers 2024-25, 2025-26). Re-runnable: `backfill-result-team-id.js`. |
| M7 | **Numeric marks never parsed into `mark_seconds` / `mark_meters`** | **1,483,604 rows (45%) have neither, and 1,319,151 of those have a numeric `mark_raw`** | Found 2026-08-10 while checking whether those columns could key the cross-source dedup — they can't. Blocks using them for anything computed (PR maths already works off `mark_raw`). Related: the normalized-mark column needed for dual-source imports (`DATA_SOURCE_STRATEGY.md`). |
| ~~M8~~ | ~~Doubled mark codes~~ — `NM  NM`, `NH  NH` | **FIXED 2026-08-12: 21,683 repaired, 9 collisions removed, 0 left** (11,452 + 10,240) | Scraper concatenated a field-event cell with itself; appears only in HJ/LJ/PV/SP/TJ. Should be `NM` / `NH`. ⚠️ Not a plain UPDATE — `mark_raw` is in `results_no_exact_duplicate`, so normalising can collide with an existing row; delete the collider instead, as `backfill-null-event-types.js` does. |
| M6 | **Meets with no results link** | 137 (2025-26) · 671 all-time | **Structurally limited** — USTFCCCA's directory is a moving window, so old links are gone (CLAUDE.md §1b). Don't grind; mark `results_status='unavailable'`. |

## 🟡 OPEN — modelling / structural

| # | Issue | Notes |
|---|---|---|
| U1 | **Two scraper engines with copy-pasted logic** | The relay colon bug (F7) existed **separately in two files**. One shared engine = fix once. |
| U2 | **Unattached modelled per-person, not per-competition** | `athletes.school_id=1835` instead of `results.team_id` → one person's unattached and college records look like two athletes. Root cause of DUP-4. |
| U3 | **No per-event source fallback** | TFRRS broke on DII 4x100 while athletic.net had it perfectly. Current rule is per-meet; needs to be per-event. |
| U4 | **`get_top_performances` uses regex, not `event_type_id`** | Home-screen leaderboard normalizes events by hand-written regex and infers indoor by "has a 60m event" — misses athletic.net short codes. Best first target for the frontend migration. |
| ~~U4b~~ | ~~Athlete progression & season bests split one event into several~~ | **FIXED 2026-08-09 — see F13.** |
| ~~U8~~ | ~~Source of the `Finals`+`Heat N` duplicates~~ | **SOLVED + FIXED 2026-08-10 — see below.** |
| U8-old | *(superseded)* | **The biggest recurrence risk before Dec/Jan.** DUP-2 removed ~370k of these, and the DB guard does NOT prevent them (the rows legitimately differ in `round`). A single scraper pass over one event page emits **one row per athlete**, so it cannot produce the pair — the duplication happens somewhere else. **Leading hypothesis: the same meet ingested by BOTH `scrape-meet-results.js` and `sync-weekend-results.js`**, each labelling the round from a different view (see U1 — two engines, copy-pasted logic). **Test it** against a meet known to have produced the pairs, before the season starts. A round-label fix was applied 2026-08-10 (label now taken from the cell the mark came from) but verified to change 0 of 48 rows on a live page — latent hardening, *not* the cause. |
| U5 | **Frontend still matches by text** | App reads `meet_name`/`event_name` strings instead of IDs. Until this lands most cleanup is dormant. |
| U6 | **Abandoned live-results code** | In-app live results was dropped (link-out via `meet_url` is the shipped answer). Dead: `live_results` table, `useLiveResults.ts`, `getTopPerformances()`, 8 live scripts. |
| U7 | **Merge `backend-rebuild` → `main`** | Nothing touches app code; low risk. |

## ✅ FIXED (2026-07 → 2026-08)

| # | Fix | Result |
|---|---|---|
| F1 | Transferred athletes showing old school | 5,446 corrected · re-runnable migration |
| F2 | `results.team_id` missing | 86.5% → 89.3% (104,487 filled from roster history) |
| F3 | athletic.net dropped relays entirely | 3,686 relays / 11,230 legs imported |
| F4 | Imported relays not clickable | Leg rows now written to `results` (app builds event lists from there) |
| F5 | **Relays orphaned from meets** | **157,780 linked** — 4x100 went 6% → 85% |
| F6 | athletic.net event short-codes unmapped | 3,589 results fixed → event coverage back to 100% |
| F7 | **Relay time parser required a colon** | 4x100 (`39.30`) fell to the DNF fallback while 4x400 (`3:17.58`) worked. Fixed in **both** scrapers |
| F8 | Empty 2025-26 meets (TFRRS-linked) | 47 meets → **72,454 results + 2,016 relays** |
| F9 | TFRRS sync would import onto populated meets | Caught before any writes — would have duplicated 42 meets |
| F10 | Link drift at discovery | athletic.net timing links now also fill `athletic_net_results_url` |
| F11 | Provenance unknown | `meets.results_source` populated (tfrrs 11,853 · athletic_net 108) |
| F12 | Context lost between sessions | `CLAUDE.md` + this tracker + priorities doc |
| F13 | **One event shown as several, each with its own season best / PR** | **34,748 athlete-event pairs · 25,093 athletes · worst case 1 event shown 6×.** First frontend cut-over to `event_type_id`. |

### F13 detail — first use of the canonical event in the app

**Symptom (owner-reported):** progression listed `100` and `100 Meters` separately; season bests
showed 60m twice.

**Diagnosis — the first guess was wrong and worth recording.** The initial theory was "the frontend
never normalizes". False: `normalizeEventName()` *is* applied at every grouping site, and it
collapses `100`/`100 Meters`/`100m` correctly. The real cause is that
`utils/eventNames.ts` carries a **hand-written 192-entry map**, while the DB resolves **1,186
spellings** through `event_aliases`. Everything the map doesn't know falls through as its own event.

Measured across the whole DB (2026-08-09): the map splits **58 of 62 event types**;
**64,054 track & field results** land on a stray label. Examples — `200m` rendered as 35 different
labels (`200 Meter Dash Open`, `200 M Participate`, `200 Meter Dash Unseeded`…), `800m` as 66,
`Pole Vault` as 43. Athlete 84383 saw six separate Pole Vault events, each with its own season best.

**Fix:** new `canonicalEventName(row)` in `utils/eventNames.ts` returns `event_types.code` from the
DB and falls back to `normalizeEventName()` only when a row has no `event_type_id`. Every query
that groups by event now selects `event_type_id, event_types ( code )`:
`getAthletePerformances` · `getAthletePRs` · `getAthleteComparisonStats` · `getHeadToHead` ·
`getAthleteRelays` — plus the grouping sites in `app/athlete/[id].tsx` and `AthleteStatsModal.tsx`.
`getHeadToHead` had to change **in the same commit** as `getAthleteComparisonStats`: it filters
using the keys that function produces, so a half-migration would have silently matched nothing.

**Note:** `types/database.ts` was stale — it had no `event_type_id` and no `event_types` table at
all, so the query wouldn't typecheck. Added those by hand rather than regenerating (a full regen
churns 41 KB and the file is stale in other ways too — worth doing, separately).

**Not covered by this fix:** XC. 52,496 XC results also carry non-canonical labels, but there the
distances are genuinely different (`4.97M`, `7k`, `5 MILE (XC)` all map to `8k XC`). Collapsing
those to one label would *hide* real differences — that's a DB modelling question, not a display
bug. Left alone deliberately.

**Earlier in the rebuild:** athlete dedup (6,277 merged) · canonical events (63 types, 100%) ·
`meet_id` FKs + orphan cleanup · divisions dimension · gender 99.96% · names 99.9% ·
computed PRs (`v_athlete_prs`) · scraper hardening (orphan leak, event resolution, dup guards).

### DUP-2 progress — pilot run 2026-08-10

Re-measured whole-DB (the documented 416,044 covered only the 2026 seasons):
**441,314 groups · 453,113 extra rows · 71,117 athletes.**

**Two mechanisms found, both genuine duplicates:**
1. *Same scrape, published twice* (82.9% of groups share `created_at` to the microsecond) —
   TFRRS lists a race in the combined result AND broken out by heat, so it is captured twice
   under different round labels. e.g. Durrell Collins, 200m, WAC Indoor: `21.19 3rd Finals` and
   `21.19 3rd Heat 1` — one run, two rows.
2. *Whole meet re-imported* — two contiguous `result_id` blocks from two scrape runs, differing
   only in `date`. e.g. Anaya Ervin's entire heptathlon at Carl Kight, once dated 04-02 and once
   04-03. Keep-rule now prefers the row whose date matches `meets.date`.

**Why the key is safe:** `mark_seconds` differs in **0** of 441,314 groups; a real prelim→final
pair has different times, so requiring identical mark AND place cannot merge two real races. The
185 groups that are genuinely ambiguous (both `Preliminaries` and `Finals`, same mark and place)
are **excluded, not guessed at**.

**Root cause is unfixed:** the only unique index on `results` is the primary key — nothing at the
DB level prevents re-inserting the same performance. A unique constraint can't be the answer
either, since it would reject those 185 legitimate pairs. The guard must live in the importer,
and it demonstrably failed for the Ervin meet. **Re-check the importer guard before the next
season's scrapes, or these come back.**

**Pilot (meets of Durrell Collins + Jaurdin Mallory):** 4,427 rows backed up and deleted.

| athlete | rows before | rows after | distinct performances |
|---|---|---|---|
| Durrell Collins | 51 | 44 | 44 → 44 unchanged |
| Jaurdin Mallory | 58 | 49 | 49 → 49 unchanged |

Row count now equals distinct performances — no real performance lost. Remaining DB-wide:
436,889 groups. Rollback: `INSERT INTO results SELECT * FROM results_d2_backup;`

### DUP-2 — completed 2026-08-10

**Two duplication mechanisms, both genuine:**
1. *Same scrape published twice* — TFRRS lists a race in the combined result AND broken out by
   heat, so it is captured twice under different round labels. 82.9% of groups share `created_at`
   to the microsecond. Durrell Collins, 200m, WAC Indoor: `21.19 3rd Finals` + `21.19 3rd Heat 1`.
2. *Whole meet re-imported* — two contiguous `result_id` blocks, differing only in `date`
   (Anaya Ervin's heptathlon at Carl Kight, once 04-02 and once 04-03).

**Verification:** Collins 51→44 rows, Mallory 58→49, distinct performances unchanged in both.
Residual is exactly 185, the deliberately-kept ambiguous groups.

**TWO SQL NULL BUGS — the reason the first full run left 376 groups behind.** Both skipped rows
rather than over-deleting, so nothing was lost, but they are easy to repeat:
- `g.event_type_id = r.event_type_id` in a join — `NULL = NULL` is **not true**, so 302 groups
  with a NULL `event_type_id` never matched. Use `IS NOT DISTINCT FROM` for any nullable column.
- `HAVING NOT (bool_or(round='Preliminaries') AND bool_or(round='Finals'))` — when every row's
  round is NULL, `bool_or` returns NULL, `NOT NULL` is NULL, and the group **silently vanishes
  from HAVING**. 74 groups lost this way. Wrap aggregate booleans in `COALESCE(..., false)`.

**Root cause is still unfixed.** The only unique index on `results` is the primary key, so nothing
at the DB level prevents re-inserting the same performance. A unique constraint cannot be the
answer either — it would reject the 185 legitimate pairs. The guard must live in the importer,
and it demonstrably failed for the Ervin meet. **Re-check it before the 2026-27 scrapes or these
come straight back.**

**Minor finding:** 463 of 3,319,907 results (0.01%) still have no `event_type_id` — event names
with unmapped suffixes (`5000 M Open`, `100 Meter Dash D1 Elite`, `Hammer Throw Unseeded`).
Worth an `event_aliases` top-up.


### DUP-1 — what it actually is (scanned 2026-08-10, NOT yet fixed)

Far bigger and differently shaped than the single Utah Spring Classic case. **95 meets in 2026
alone hold 60,452 results with zero unique rows** — every row also exists at another meet.

**A NEAR-MISS WORTH READING BEFORE TOUCHING THIS.** The first detection rule was "a meet whose
rows are all contained in a LARGER meet ON THE SAME DATE is a copy of it". That rule is wrong,
and running it would have corrupted real data:

| meet | schools actually in it |
|---|---|
| "Big 12 Outdoor Championships" (13053) | Illinois, Indiana, Iowa, Maryland, Michigan… |
| "BIG EAST Outdoor Championships" (13054) | *identical Big Ten schools* |
| "Big Sky Outdoor Championships" (13055) | *identical Big Ten schools* |
| "Southland Outdoor Championships" (13068) | East Texas A&M, Lamar, McNeese State — **genuine** |

Three meets each held 1,471 identical rows of **Big Ten** results under the wrong conference name.
The rule named **Southland** as their "original" purely because it was the biggest meet that day —
a completely real, unrelated championship. The true owner was **"Big Ten Outdoor Championships"
(13056), on the NEXT day, with a stored `tfrrs_url` and a 2,446-row superset containing all
1,471 of them.**

**Lessons, now encoded in the script:**
- **Size is not evidence.** The largest same-date meet is not the original.
- **Date is not evidence.** The real meet can be a day off from its copies.
- **A stored `tfrrs_url` IS evidence.** The genuine meet was scraped from a real link; the copies
  were conjured by name/date matching, which is why they have no link of their own.
- **School↔meet identity is the strongest check** — a conference championship should contain that
  conference's schools. That is what exposed this, and it should gate any deletion.

**Status: detection rule corrected, NOT re-run, nothing deleted.** Before applying, verify a
sample of proposed deletions by the school-identity test, not just by containment.


### DUP-1 — why it is NOT safe to automate (four failed rules, 2026-08-10)

Detection of *copies* is solid: a meet with **zero unique rows** is definitionally holding someone
else's data. **95 such meets in 2026, 60,452 rows.** What cannot be automated with the signals
available is deciding **whose** data it is and **which meet survives**.

| rule tried | what it produced |
|---|---|
| largest same-date meet is the original | named **Southland** (real, unrelated) as owner of **Big Ten** results |
| largest link-backed meet within ±3 days | named **Chicagoland** as owner of Utah's rows — contains **0 of 851** |
| container derived from the data | correct attribution (Utah → Arkansas, 851/851) but exposed **mutual copy pairs** — both sides flagged, deleting both erases the results |
| keep one survivor per cluster | survivor chosen by row count then meet_id — **arbitrary**, because mutual copies have identical row counts and none hold a link |

**What the survivor rule actually picked:** `Big 12` over BIG EAST/Big Sky/Big West (the cluster
holds *Big Ten* results, so all four are wrong); `"South Coast (SCC) Champions;hips prelims"` — the
**typo** — over the correctly spelled meet; `River States Outdoor Championships` (Midwest) over
`Fresno State Invitational` (California).

**Two structural problems:**
1. **A cluster should not always keep a survivor.** Where a meet *outside* the cluster holds the
   data — "Big Ten Outdoor Championships" (13056) holds all 1,471 rows of each impostor, and was
   never flagged because it has unique rows of its own — **all** cluster members should go.
2. **Survivor choice needs the school↔meet identity test**, the thing that exposed the Big Ten
   error: a conference championship must contain that conference's schools. Row count and meet_id
   are not evidence.

**STATUS: nothing deleted. Do not run `--apply` as it stands.** Next step is a resolver that uses
`schools.current_conference_id` vs the meet name for championships, and school geography vs meet
location for invitationals — falling back to manual review, which is tractable at ~95 meets.


### DUP-1 — first 5 meets cleared 2026-08-10 (6,735 rows)

Only cases passing **both** tests were touched: (a) rows fully contained in an unflagged meet, and
(b) that meet's schools match its own name.

| cleared | rows | data now lives at |
|---|---|---|
| Utah Spring Classic (12436) | 851 | Arkansas Spring Invitational (12337) — AR/KS/MO/OK schools ✅ |
| Big 12 (13053), BIG EAST (13054), Big Sky (13055), Big West (13057) | 5,884 | Big Ten Outdoor Championships (13056) — Big Ten schools ✅ |

Owner-reported symptom resolved: Jaurdin Mallory no longer shows the Utah Spring Classic, and her
NCAA DII 11.79 appears once. Her MIAA 100m still correctly shows **11.84 prelim + 11.79 final** —
two real races, different times, both preserved.

**Gotcha for the next run:** Big 12 survived the scripted pass because it became the *container*
for the other three on a tie-break (Big Ten and Big 12 both fully contained them). It had to be
cleared by hand afterwards. **When several meets hold identical blocks, "the container" is not
stable — verify what actually remains after a run rather than trusting the deletion list.**

**Still open:** 2 rename cases where the *correctly-named* meet is the copy — `NJCAA Region 1`
holds Kansas juco data that belongs to `Region 6/Jayhawk`, and `Conference Carolinas` holds
Oregon/Washington schools that belong to `Northwest (NWC) Conference`. Those need the data moved,
not deleted. Plus 50 mutual-pair meets (29,879 rows) awaiting the school-identity resolver, and
all pre-2026 seasons unscanned.


### U8 — SOLVED 2026-08-10: the scraper walks every table on the page

**My earlier hypothesis (two scrapers ingesting the same meet) was WRONG.** The tell was already
in the data: **82.9% of duplicate groups shared a `created_at` to the microsecond**, which two
separate runs cannot produce. One insert batch was emitting the athlete more than once.

**Proven against live markup** (2026 DI Outdoor Men's 200m):

```
tables on page: 5        (a combined view, plus one table per heat)
athletes appearing in MORE THAN ONE table: 23 of 23
   Jaiden Reid -> tables 0, 1, 4
   Israel Okon -> tables 0, 1, 3
```

Both engines iterate `$('table tbody tr')`, which walks **all** tables. So a single scrape emits
each athlete 2-3 times — same mark, same place, different round label. That is the origin of the
~370k `Finals`+`Heat N` rows removed in DUP-2, and the DB guard cannot stop them because the rows
legitimately differ in `round`.

**VERIFIED END-TO-END 2026-08-12** with `scrapers/tfrrs/meet-scraper/verify-no-duplicate-rounds.js` — real parse path, live 2026 NCAA DI Outdoor Championships, 113 rows across 4 events, **0 duplicate performances**, and genuine prelim/final pairs preserved (Jaiden Reid 19.63 final / 20.05 prelim). Long Jump collapsed 48 → 24, exactly half, every athlete having appeared in two tables. **Re-run this before any release touching the scrapers.**

**Fix:** `scrapers/shared/collapse_duplicate_rounds.js`, applied in **both** engines
(`scrape-meet-results.js` and `sync-weekend-results.js` — U1 is why it had to go in both).
Collapses rows sharing (athlete, event, normalized mark, place), keeping Finals > Preliminaries >
Heat N.

**Verified on the live page:**

```
raw rows scraped (all tables): 48
after collapse:                32   (collapsed 16)
still appearing twice: 9 athletes — every one a REAL prelim/final pair with different times
   Jaiden Reid   19.63/1st/Finals | 20.05/1st/Preliminaries
   Trelee Banks  20.02/3rd/Finals | 20.38/6th/Preliminaries
```

Duplicates gone, both real races kept. This is the recurrence risk closed before the Dec/Jan season.


### DUP-5 — 976 removed 2026-08-10, 707 deliberately kept

Athlete-history rows (`meet_id IS NULL`) are outside the `results_no_exact_duplicate` index,
which is partial on `meet_id IS NOT NULL`, and outside DUP-2's meet-scoped key. So nobody had
ever deduped them.

**Cause:** profile scrapes re-run. Sucar Tanelus held **4 copies of every mark**, created at
`04:09:58`, `04:10:24`, `04:10:33`, `04:10:48` — four passes inside 50 seconds on 2025-11-26,
all with NULL date, meet, place and round.

**Removed:** 976 rows across 148 athletes, keyed on
(athlete, event_type, mark, place, round, **date**). Zero groups remain on that key.
`results`: 3,313,168 → **3,312,192**.

**Deliberately kept: 707 rows in 560 groups**, of which **510 differ only by `date`.** Same
athlete, same event, same mark, on different days. For history rows `place` and `round` are both
NULL, so they cannot discriminate — and an athlete genuinely can repeat a mark on two days
(common in field events and round-number marks). Collapsing them would destroy real performances
on a guess. **Do not "finish" DUP-5 by dropping the date from the key.**


### DUP-1 — the resolver that finally works: host location vs school states

Every *structural* rule failed (size, date, stored link, cluster size). The signal that works is
**evidence about the meet itself**: `meets.location` holds the host city/state, and the REAL
meet's host state appears among its own schools' states. The copy's does not.

```
Jim Duncan Invitational     Des Moines, Iowa   schools IA/NE/SD   REAL
Jim Linthicum Invitational  Cupertino, Calif.  schools IA/NE/SD   COPY
Ed Jacoby Twilight          Boise, Idaho       schools ID/OR      REAL
St. Lawrence Twilight       Canton, N.Y.       schools ID/OR      COPY
```

Tool: `scrapers/resolve-copied-meets-by-location.js` (reports only, never deletes). TFRRS writes
AP-style abbreviations — `Ind.`, `Calif.`, `N.Y.` — not postal codes, so there is an explicit map;
anything unparseable is reported, never guessed.

**It corrected two calls the structural rules had made:** `North Atlantic Conference
Championships` (host ME, schools OR/WA) and `River States Outdoor Championships` (host OH, schools
CA/IA/NV) are both COPIES — earlier logic would have kept them and deleted the genuine
`Northwest (NWC) Conference` and `Fresno State Invitational`.

**Applied 2026-08-10 — 14 meets, 7,660 rows**, each gated on its rows surviving at a meet that is
not itself condemned (the mutual-pair trap):

| copy removed | data survives at |
|---|---|
| Lincoln University (Pa.) Open | Manchester Invitational (IN) |
| St. Lawrence Twilight | Ed Jacoby Twilight (ID) |
| North Atlantic Conference | Northwest (NWC) Conference (WA) |
| River States Outdoor Champs | Fresno State Invitational (CA) |
| Summit League Outdoor Champs | Patriot League Outdoor Champs |
| The Sun Conference Champs | Great Northeast Outdoor Champs |
| Bill Bippes Cougar Classic | Cougar Classic (IL) |
| Very Last Chance Meet | GVSU Last Chance Meet (MI) |
| Black Bear Last Chance | West Coast Last Chance (CA) |
| SPIRE Last Chance | St. Norbert Last Chance (WI) |
| Pittsbug State "Last Chance" | Trinity Last Chance (TX) |
| Cougar Invitational | Cougar Invitational (Concordia Chicago) |
| Red Raider Open | Raider Invitational |
| Big Red Classic | RedHawk Invitational |

**Still open:** ~35 further verdicts from the same run were lost to a truncated console read —
re-run the resolver to recover them. 5 unresolved: three meets have no `team_id` so there are no
school states to test, and `NJCAA Region 6/KJCCC` vs `Region 6/Jayhawk` are the same Kansas event
under two names (both host KS with KS schools), which location cannot separate. All pre-2026
seasons are unscanned.


### DUP-1 — 2026 season complete (2026-08-10): 23,766 rows across 33 meets

All removals gated on the rows surviving at a meet **not itself condemned**, backed up whole to
`results_d1_backup` with audit JSONs. Tools: `resolve-copied-meets-by-location.js` (reports
verdicts) → `apply-verified-copies.js --ids=… --apply` (enforces the survival gate, then deletes).

**⚠️ THE GATE IS ONLY AS STRONG AS THE CONDEMNED LIST YOU PASS IT.** Applying the copies in two
batches nearly caused a bad delete: `Mule Tune-Up` "survives at" `Bucknell Tune-Up`, but Bucknell
is itself a COPY that had been skipped in the earlier batch. Because it wasn't in the second
batch's `--ids`, the gate счёл it a legitimate survivor. **Always pass the full condemned list,
even when applying a subset.**

**Deliberately untouched — data with no correct home:** `Bucknell Tune-Up` (#11714, host PA) and
`Mule Tune-Up` (#11717, host ME) both hold the same 407 rows of IL/MI schools. Neither host state
matches, so both are copies, and no third meet holds the data. The genuine meet is either missing
from `meets` or unflagged. **This is a missing-meet problem, not a duplicate one** — deleting
either would be guessing, deleting both would destroy the results.

**Also unresolved:** three meets have no `team_id`, so there are no school states to test; and
`NJCAA Region 6/KJCCC` vs `Region 6/Jayhawk` are the same Kansas event under two names (both host
KS, both KS schools) — location cannot separate them.

**Performance note for extending this to pre-2026 (10,105 meets):** the container query
self-joins `results` on athlete + mark + place and repeatedly hit the statement timeout on meets
whose athletes carry a lot of history. Two meets had to be finished by checking containment
against a single known survivor instead of searching all of them. **That query needs an index or
a different shape before it is run at that scale — brute force will not survive it.**


### DUP-3 — the documented size was wrong by 98%, and acting on it would have destroyed real data

**DUP-3 was recorded as 43,037 duplicate relay rows on the key
(meet, event, team, place, mark). That key is invalid for relays.** A school enters multiple
squads (A/B/C/D), and when they all DNS they share `mark='DNS'` and `place=NULL` — identical on
every column in that key while being entirely different teams.

Real case, Chico Invitational 4x400m, four rows all `DNS` / NULL place / same `team_id`:

| row | squad |
|---|---|
| 216035 | Zach Blood, Cameron Bishop, Joey Bowser, Jamie Saunders |
| 216036 | Ryan Giglio, Keegan Henry, Elias Wiggins, Hunter Phillips |
| 216045 | Lucas Garin, Evan Schweitzer, Rylan Huryn, Walker Dorris |
| 216046 | Saul Jimenez, Kees Van Der Meer, James Woolery, Arlo Gagnon |

**Four separate squads.** A first version of the dedup script would have deleted 29,184 rows.
`relay_athletes` is **ON DELETE CASCADE**, so 37,561 legs would have gone with them — and
**34,822 of those (93%) named an athlete absent from the surviving row.** It was erasing real
people's races, not duplicates.

**Caught by** checking whether the doomed rows' athletes actually existed in the survivor, rather
than trusting that matching columns meant a matching performance.

**Correct rule: the lineup must be part of the key.** Two relay rows are the same performance only
if they name the same athletes. Rows with no lineup are left alone entirely — without one there is
no way to prove two rows are the same squad. On that key the true count is **674**, all removed.

**Generalisable lesson — stated carefully, because the first version of this line was wrong.**
`DNS`, `DQ`, `FS`, `DNF`, `SCR` **ARE results** (owner, 2026-08-12). The team was entered and in
the field; what happened to them is part of the meet record. They are never junk and never
deletion candidates.

What they are not is **identifying**. Four squads that all scratch produce four rows reading
`DNS` / NULL place, so those values cannot tell you *which* squad a row belongs to. That is a
statement about dedup keys only: **a status code may never act as identity.** For relays the
lineup supplies identity; for individuals the athlete does.


### DUP-4 — 12,518 empty duplicate athlete records removed (2026-08-10)

Owner-reported: searching "Mena Scatchard" returned four athletes. Two of them were **empty
shells** — no results, no relay legs, no PRs, no roster history, no external ids — sitting on
`school_id = 1835` (Unattached). 12,518 such records existed across the DB, every one duplicating
the name of an athlete who *does* have results. Removed; backup in `athletes_empty_backup`.

Scale: **37,694 of 151,376 athletes (25%) have no results at all.** Only the 12,518 that also
duplicate a real athlete's name were touched. The other ~22,000 hold nothing but do not duplicate
anyone — left alone.

**⚠️ CHECK INBOUND FOREIGN KEYS BEFORE DEFINING "EMPTY".** The first version of this test looked
only at `results` and `relay_athletes` and would have destroyed data for **2,792 athletes**:

| table | on delete | holds |
|---|---|---|
| `athlete_prs` | NO ACTION | scraped career bests — 189 of these are unreproducible by `v_athlete_prs` |
| `athlete_team_seasons` | **CASCADE** | roster history — **deletes silently** |
| `external_ids` | **CASCADE** | source id mappings — deletes silently (currently 0 rows) |
| `relay_athletes` | NO ACTION | relay legs |
| `results` | CASCADE | performances |

`athlete_prs` and `relay_athletes` would have raised an error and stopped the run;
`athlete_team_seasons` would have gone quietly. **Query `information_schema` for inbound FKs
before any delete** — this is the third time today the same trap appeared (relay legs, athlete
PRs, roster history).

**Still open — the real DUP-4:** cases like `Obiora Okeke`, where the Unattached record holds **3
genuine results** from athletic.net alongside the main record's 124. That is a *merge*, not a
delete, and it is really U2 (Unattached modelled per-person instead of per-competition). Also
`Mena Scatchard` still has two Stanford records with **different `tfrrs_athlete_id`s**
(7914548 with 93 results, 9188510 with 1) — CLAUDE.md §2 warns that one person routinely has two
TFRRS ids, so this needs corroboration, not an id comparison.


### DUP-1 deletions AUDITED 2026-08-12 — 33/33 correct

Every one of the 33 meets cleared was re-tested from `results_d1_backup`: reconstruct the deleted
rows' schools and check them against that meet's own host state. A genuine copy's host state is
absent from its own schools.

**31 clean. 2 flagged, both false positives.** "Big West" (host CA) and "Big Sky" (host OR) hold
Big Ten data, and the **post-expansion Big Ten includes USC/UCLA (CA), Oregon (OR) and Washington
(WA)** — so the host state matched by coincidence. Confirmed by listing the CA/OR schools in those
rows: **Oregon, UCLA, USC**. All 1,471 rows live at Big Ten Outdoor Championships (13056).

**No wrong deletions. DUP-1's 2026 pass is verified.**

⚠️ Limitation of the audit, for whoever runs it on pre-2026: a conference with a nationwide
footprint coincidentally matches many host states. A flag means "check the school **names**", not
"this was wrong". Tool: `scrapers/verify-dup1-deletions.js` (read-only).
