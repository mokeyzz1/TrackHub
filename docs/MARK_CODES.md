# Mark codes — every non-numeric value in `mark_raw`

**These are RESULTS, not missing data** (owner, 2026-08-12). A letter code means the athlete or
squad was entered and in the field, and it records what happened to them. They belong in the
database and on the page. **Never treat a mark code as junk, absent data, or a deletion
candidate.**

The only thing they are not is *identifying*: four squads that all scratch produce four rows
reading `DNS` with a NULL place, so a mark code can never act as identity in a dedup key. Identity
comes from the lineup (relays) or the athlete (individuals).

Counts measured 2026-08-12.

## Confirmed codes

| code | meaning | results | relays | notes |
|---|---|---|---|---|
| `DNS` | Did Not Start | 44,529 | 2,242 | entered, didn't start |
| `NT` | **No Time** — not available or not known | 38,819 | 11,276 | a real result; see the correction below |
| `DNF` | Did Not Finish | 17,906 | 1,457 | |
| `NH` | No Height | 12,722 | — | vertical jumps only (HJ, PV) |
| `NM` | No Mark | 9,855 | — | horizontal jumps / throws |
| `FOUL` | fouled attempt | 6,283 | — | field events |
| `DQ` | Disqualified | 2,117 | 534 | |
| `ENR` | **En Route** — a split taken during a longer race | 1,833 | — | confirmed empirically: appears only in 13.1k, 8k, 6.2k, 6k, 5000m, 4M, 4k, 3M, 3k, and the DB also holds events literally named "1500 M Run En Route" |
| `FS` | False Start | 720 | 5 | |
| `SCR` | Scratched — formally withdrawn | 384 | 4 | |
| `ND` | No Distance | 188 | — | throws / horizontal jumps |
| `NP` | **No Points** | 65 | — | confirmed empirically: appears *only* in decathlon, heptathlon, pentathlon — a multi-eventer who did not score |
| `NWI` | **No Wind Indication** | 26 | — | no wind gauge was used. Does NOT mean zero wind. Really a wind annotation that landed in `mark_raw`. |
| `Z` | unknown | 1 | — | single row, likely junk |

athletic.net also documents `DNR` (Did Not Run); none are currently in the DB.

## A correction worth keeping

`DATA_ISSUES_TRACKER.md` M1 previously described `NT` as "the parser's fallback value, vs genuine
`DNS`/`DQ`/`FS`". **That was wrong** — `NT` means *No Time* and is as legitimate as any other
code. The scrapers read it from the page; they do not invent it.

The real M1 signal is not the presence of `NT` but an event where **every** team is timeless with
3+ teams, which is physically impossible and therefore a parse failure.

## 🔴 Known bug: doubled codes (21,692 rows)

| stored value | should be | rows |
|---|---|---|
| `NM  NM` | `NM` | 11,452 |
| `NH  NH` | `NH` | 10,240 |

Two spaces, value repeated. Appears only in field events (HJ, LJ, PV, SP, TJ), so a scraper
concatenated a cell with itself. Tracked as **M8**.

⚠️ Normalising these is **not** a plain UPDATE: `mark_raw` is part of
`results_no_exact_duplicate`, so collapsing `NM  NM` → `NM` can collide with an existing row.
Handle it the way `backfill-null-event-types.js` does — delete the row that would collide instead
of updating it.

## Sources

- [athletic.net — Abbreviations and Symbols](https://support.athletic.net/article/9ke50mc11t-athletic-net-abbreviations-and-symbols)
- [Wikipedia — Athletics abbreviations](https://en.wikipedia.org/wiki/Athletics_abbreviations)
- [World Athletics — Terms and Abbreviations (PDF)](https://worldathletics.org/download/download?filename=WA_Terms__Abbreviations_EN+-+July+2023v2.pdf&urlslug=Terms+and+Abbreviations)
- [NCAA — Wind and scoring in track and field, explained](https://www.ncaa.com/news/trackfield-outdoor-women/article/2024-06-25/wind-and-scoring-track-and-field-explained)
