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
| DUP-3 | **Duplicate relay rows** | **43,037 extra rows (42,305 groups)** measured 2026-08-09 | Same meet+event+team+place+identical mark. Pre-existing (not from the athletic.net import, which was dup-guarded). The count rose from ~40,618 partly because linking previously-invisible relays (F5, M3) *surfaces* duplicates that were always there but unlinked. **Run DUP-3 dedup after the relay linking work, not before.** |
| DUP-4 | **Duplicate athlete records** | 294 cross-school + ~646 ambiguous + 3 conflict clusters | Root cause is U2 below. Visible in-app (e.g. "Obiora Okeke", "Mena Scatchard"). |
| DUP-5 | **Duplicate athlete-history rows** (`meet_id IS NULL`) | **1,524 groups / 1,683 extra rows** | Found 2026-08-10 while building the dedup guard — a non-partial unique index could not be created because of them. **Not covered by `results_no_exact_duplicate`**, which is partial on `meet_id IS NOT NULL`. These are the dual-purpose rows that power athlete history rather than meet pages, so DUP-2's meet-scoped key never saw them. Same rule should apply, keyed on (athlete, event_type, mark, place, round) without `meet_id`. |

## 🟠 OPEN — missing / incomplete data

| # | Issue | Size | Notes |
|---|---|---|---|
| M1 | **Relay events with no time at all** | **RESCOPED 2026-08-09: 212 events / 1,091 rows / 157 meets** — not "619 meets" | The old figure counted every meet holding *any* timeless 4x100, which swept in legitimate DNFs. The real signal is an event where **every** team is timeless (≥3 teams) — physically impossible, so a parser failure. 4x100 177 events · 4x400 30 · 4x800 4 · DMR 1. The 83% 4x100 share matches the F7 colon bug. **Leave partial-DNF events alone — 4,901 of them are genuine.** ⚠️ **Only 61 of the 157 meets (39%) still have a results link** (14 TFRRS · 52 athletic.net); 96 have none and are unrecoverable (§1b moving window). Realistic ceiling ≈ 420 rows — **low value, do it last.** Also note `NT` (11,282 rows) is the parser's fallback value, vs genuine `DNS`/`DQ`/`FS`/`SCR`. |
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
| M6 | **Meets with no results link** | 137 (2025-26) · 671 all-time | **Structurally limited** — USTFCCCA's directory is a moving window, so old links are gone (CLAUDE.md §1b). Don't grind; mark `results_status='unavailable'`. |

## 🟡 OPEN — modelling / structural

| # | Issue | Notes |
|---|---|---|
| U1 | **Two scraper engines with copy-pasted logic** | The relay colon bug (F7) existed **separately in two files**. One shared engine = fix once. |
| U2 | **Unattached modelled per-person, not per-competition** | `athletes.school_id=1835` instead of `results.team_id` → one person's unattached and college records look like two athletes. Root cause of DUP-4. |
| U3 | **No per-event source fallback** | TFRRS broke on DII 4x100 while athletic.net had it perfectly. Current rule is per-meet; needs to be per-event. |
| U4 | **`get_top_performances` uses regex, not `event_type_id`** | Home-screen leaderboard normalizes events by hand-written regex and infers indoor by "has a 60m event" — misses athletic.net short codes. Best first target for the frontend migration. |
| ~~U4b~~ | ~~Athlete progression & season bests split one event into several~~ | **FIXED 2026-08-09 — see F13.** |
| U8 | **Source of the `Finals`+`Heat N` duplicates is still UNIDENTIFIED** | **The biggest recurrence risk before Dec/Jan.** DUP-2 removed ~370k of these, and the DB guard does NOT prevent them (the rows legitimately differ in `round`). A single scraper pass over one event page emits **one row per athlete**, so it cannot produce the pair — the duplication happens somewhere else. **Leading hypothesis: the same meet ingested by BOTH `scrape-meet-results.js` and `sync-weekend-results.js`**, each labelling the round from a different view (see U1 — two engines, copy-pasted logic). **Test it** against a meet known to have produced the pairs, before the season starts. A round-label fix was applied 2026-08-10 (label now taken from the cell the mark came from) but verified to change 0 of 48 rows on a live page — latent hardening, *not* the cause. |
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
