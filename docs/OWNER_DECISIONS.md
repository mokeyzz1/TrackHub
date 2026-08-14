# Owner decisions, corrections and techniques — do not re-derive these

**Every item here came from the owner.** They were scattered across CLAUDE.md, six memory files
and a dozen docs, so they kept getting rediscovered — costing time and, worse, producing
"discoveries" the owner had already explained. One place now. Read it before proposing anything.

If you find yourself reasoning toward a conclusion listed here, stop: it is already decided.

---

## Domain facts I got wrong until corrected

**Heats ARE preliminaries.** "Heat 2" = prelim heat 2, a subdivision of the round, not its own
round. There is no Final 1/2/3. Many meets are **timed finals** — you run once, in a heat seeded
slowest to fastest, and that heat IS the final, so one run legitimately carries both a `Heat N`
and a `Finals` label. Measured: 78% of events producing such a pair were timed finals.

**Mark codes ARE results.** `DNS` `DNF` `DQ` `FS` `SCR` `NT` — the athlete or squad was entered and
in the field, and what happened to them is part of the meet record. **Never junk, never deletion
candidates.** They are only *non-identifying*: four squads that all scratch produce four identical
rows, so a status code can never act as identity in a dedup key. Full list: `MARK_CODES.md`.

**Competing at two meets in one day is NORMAL** when they are close by. Texas Relays and the
Bobcat Invitational are ~30 miles apart and athletes do both. A multi-day meet also spreads its
rows over a date window that overlaps nearby one-day meets. Only *different states* is suspicious.

**Unattached is PER-COMPETITION, not per-person.** Competing without representing a school **at
that meet**. Mostly post-collegiate athletes. **They are real athletes and will be in the app** —
the "Unattached cleanup" means linking them to their collegiate records, **not purging**.

**TFRRS has ALL college meets**, regardless of which timing company ran them. Its ~99% share is
**chronology, not superiority** — it was simply scraped first. Never frame the two sources as
either/or.

**TFRRS ID is not a same/different-person signal.** One person routinely has two
`tfrrs_athlete_id`s (transfers, re-scrapes). Do not penalise an ID conflict when deduping.

**Seasons:** Indoor (Dec–Mar) · Outdoor (Mar–Jun) · XC (Aug–Nov). Never split by calendar year.

**4x1500m and 4x1000m are genuinely distinct events** — do not approximate them together.

---

## Standing directions

**Scrapers are the foundation — harden them so the DB never drifts back.** Fix the scraper first,
*then* backfill. (2026-07-15)

**Both sources, together. Link both, make one primary.** TFRRS keeps identity and the historical
archive; athletic.net leads on new meets for its richer detail — **big Q vs small q qualifying**,
splits, wind. (2026-08-12)

**Fuzzy matching is allowed for OLD meets IF the matches are reviewed before commit.** It is
banned as an unchecked default because it mismatches meets, but a verified fuzzy match is an
accepted recovery path. *(This is the TFRRS recovery cascade — already sanctioned, not a new idea.)*

**Link columns are intentional — stop dumping everything into `meet_url`.**
`meet_url` = live/timing link · `tfrrs_url` = TFRRS results · `athletic_net_results_url` =
athletic.net · `wa_results_url` = World Athletics. **Results links leak into `meet_url`; check
periodically.**

**The owner is not reviewing changes individually** ("letting you just cook", 2026-08-10). That is
only workable while every destructive change is reversible and recorded in `RECOVERY.md`.

**No `Co-Authored-By` lines in commits.**

**Don't tell the owner to stop, rest, or call it a night.**

---

## Techniques the owner invented that worked

**Infer a meet's environment from its OTHER events.** A meet with a 60m is indoor, so its 200m is
indoor too. Layered recovery: event → date → recovered-date → meet-mates → meet-season →
name-keyword.

**Use athlete overlap to match hard meets.** If the same athletes appear in both, it is the same
meet — stronger than any name similarity.

**AI-judge pass for ambiguous athlete duplicates.** ~6,480 same-name groups are neither provably
same nor provably different. Rules handle the definitive cases; feed the rest (name, school,
tfrrs id, timeline, events, meets) to a judge. Owner's idea, still the plan for DUP-4's tail.

**Verify a new pipeline on ONE meet before batching.** Used for the athletic.net build; it is why
the tranche-1 duplicate disaster was caught at 42 meets instead of 4,000.

---

## Priorities in the owner's own framing

1. **Backend quality first**, then frontend/marketing. Season starts **Dec 2026 / Jan 2027**.
2. **Missing meet results for 2025 and 2026** was the original P0.
3. **Community build** — accounts, claimed profiles, better UI — is the next product, and it is a
   **separate track** from the scraper work. Only U2 + the DUP-4 merges actually block it.
4. **Scale target: 10k–20k+ users.**

---

## Bugs the owner found by using the app

Every one of these was invisible in SQL and obvious on screen. **The owner opening the app is the
best detector this project has.**

| reported | turned out to be |
|---|---|
| missing 4x100 relays | colon bug (F7) — and 463 meets still hold the broken data |
| athlete showing a meet she never attended | DUP-1, 33 meets holding another meet's results |
| duplicate results on a profile | DUP-2, 452,752 rows |
| "100" and "100 Meters" as separate events | 25,093 athletes affected |
| transferred athletes showing old school | 5,446 corrected |
| DII 4x100 showing one DNF where 24 teams ran | M1 — the repair path built 2026-08-14 |
