# Meet source-page snapshot review — 2026-09-04

This is a source-page identity check for the ten duplicated TFRRS URL keys found in the live
`public.meets` scan. The pages were checked on 2026-09-04 through TFRRS/DirectAthletics. A current
page identity is evidence about URL reuse; it is not permission to merge or reassign historical
facts. No production rows or schema objects were changed.

## Snapshot register

| TFRRS URL | Page identity observed | Production rows using the URL | Disposition |
| --- | --- | --- | --- |
| [`/results/92756`](https://www.tfrrs.org/results/92756) | Mrs. G Invitational, 2026 (event pages show the 2026 edition) | 8202 (2023-02-04), 2879 (2025-02-07) | Reused/unstable URL; keep both historical parents |
| [`/results/92920`](https://www.tfrrs.org/results/92920) | Walter Cramer Invitational, Feb. 6, 2026, Olivet Nazarene Student Rec. Center, Bourbonnais, IL | 2753 (2022-02-05), 6042 (2023-02-04) | Reused/unstable URL; keep both historical parents |
| [`/results/93136`](https://www.tfrrs.org/results/93136) | Big Dawg Invitational, Feb. 7, 2026, UW-Stevens Point, Stevens Point, WI | 9618 (2022-02-05), 2995 (2025-02-08) | Reused/unstable URL; keep both historical parents |
| [`/results/93145`](https://www.tfrrs.org/results/93145) | Marshall Invitational, Feb. 6–7, 2026, Marshall-Chris Cline Athletic Complex, Huntington, WV | 2922 (2023-02-10), 6424 (2024-02-09) | Reused/unstable URL; keep both historical parents |
| [`/results/93549`](https://www.tfrrs.org/results/93549) | Maday Classic, Feb. 14, 2026, UW-Superior, Superior, WI | 11174 (2022-02-12), 6372 (2025-02-15) | Reused/unstable URL; keep both historical parents |
| [`/results/93948`](https://www.tfrrs.org/results/93948) | Howie Ryan Invitational, Feb. 13, 2026, Houston-Yeoman FH, Houston, TX | 11160 (2020-02-14), 3274 (2022-02-11), 2436 (2025-02-14) | Reused/unstable URL; keep all three historical parents |
| [`/results/94971`](https://www.tfrrs.org/results/94971) | Tyson Invitational, Feb. 13–14, 2026, Arkansas-Randal Tyson Track Center, Fayetteville, AR | 6929 (2020-02-14), 8761 (2021-02-12), 1708 (2022-02-11) | Reused/unstable URL; keep all three historical parents |
| [`/results/95227`](https://www.tfrrs.org/results/95227) | SDSU Indoor Classic, Feb. 13–14, 2026, Sanford-Jackrabbit Athletic Complex, Brookings, SD | 11014 (2021-02-13), 1455 (2022-02-11), 2565 (2025-02-14) | Reused/unstable URL; keep all three historical parents |
| [`/results/95531`](https://www.tfrrs.org/results/95531) | SNHU Spring Invitational, Mar. 26, 2026, Southern New Hampshire, Manchester, NH | 12290 (2026-03-26), 12149 (2026-03-28) | Mar. 26 row is page-date aligned; Mar. 28 remains a segment/duplicate candidate |
| [`/results/96401`](https://www.tfrrs.org/results/96401) | 2026 Bauer Open, Apr. 15, 2026, South Dakota Mines, Rapid City, SD | 12632 (2026-04-15), 12562 (2026-04-18) | Apr. 15 row is page-date aligned and owns the staged private records; Apr. 18 remains held |

The exact page snapshots support a simple rule: a numeric TFRRS results URL is not a historical
meet key in this dataset. The first eight URLs currently resolve to later editions than every
production row that reuses them. The final two contain same-season date conflicts, so page-date
alignment narrows ownership but does not settle whether the other row is a second segment, a source
copy, or an import error.

## Cross-check against private lineage

- Nine URL groups have no private `ingest.source_records`, so the current-page identity cannot be
  used to rewrite old facts.
- `/results/96401` has 24 private TFRRS source records, all linked to meet 12632 (Apr. 15). Meet
  12562 (Apr. 18) has no linked private records. This is ownership evidence for the staged rows,
  not a deletion or reassignment instruction.
- The previously measured canonical overlaps remain unchanged: three historical URL pairs have
  byte-equivalent individual sets while relay sets differ; the source-page check does not resolve
  those fact-set conflicts.

## Disposition and next gate

Do not add a unique index on `tfrrs_url`, populate `tfrrs_meet_id` from the URL number, merge meet
parents, or move result/relay rows based on this snapshot. Preserve both parents and raw URLs. The
next safe step is a source-aware alias/ownership map that can represent a URL reused across editions
and can be tested against private source records before any reversible reassignment plan is drafted.

## Sources

The page links in the register are the official TFRRS results pages (served by DirectAthletics). The
bounded pass also used the linked event pages where the summary page was not indexed directly. The
retrieval date is recorded so a later audit can distinguish a changed live page from the evidence
captured here.
