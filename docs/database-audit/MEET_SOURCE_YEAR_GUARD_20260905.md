# Meet-source year boundary

The live `tfrrs_url` inventory contains 12 repeated source IDs on 27 meet rows. These are
identity review groups, not permission to merge. Eight groups span different stored years:

| TFRRS ID | Database meet IDs |
|---|---|
| 92756 | 2879, 8202 |
| 92920 | 2753, 6042 |
| 93136 | 2995, 9618 |
| 93145 | 2922, 6424 |
| 93549 | 6372, 11174 |
| 93948 | 2436, 3274, 11160 |
| 94971 | 1708, 6929, 8761 |
| 95227 | 1455, 2565, 11014 |
| 95531 | 12149, 12290 |
| 96401 | 12562, 12632 |
| 96626 | 12942, 13057 |
| 96652 | 12720, 12773 |

The last four groups are same-year schedule, multi-event or duplicate candidates requiring
source review. TFRRS [96652](https://www.tfrrs.org/results/96652/Penn_Relays) directly confirms
Penn Relays on April 23–25, 2026. Fetches for three other numeric-only source URLs were blocked
by the research tool; their source-page contents are not claimed verified.

## Implemented prevention, not historical repair

`scrapeMeet` used the stored database date in preference to the source page without checking
for a contradictory year. It now rejects an explicit year conflict immediately after fetching
the meet header, before requesting event results. It throws `TFRRS_MEET_YEAR_MISMATCH`, not an
empty-results success. Both regular and scoped callers share that boundary.

The page-date parser now recognizes full month names (the previously abbreviated-only parser
missed “April”), ranges with hyphens/en dashes, and rejects impossible calendar dates.
It still uses the range's start date; no new event-level dates or points are calculated.
Same-year date differences are not rejected by this narrow guard. Missing/unparseable source
dates remain a known validation gap, not proof that a link is correct. Same-year identity,
range semantics and all historical link repairs remain open under MODEL-01/ID-01.

All 244 ingestion tests pass. Tests cover full/abbreviated month names, ranges, leap days, invalid dates, a mocked full
scrape stopping after the header request, and acceptance of a same-year multi-day difference.
No live scraper, merge, schema migration or data rewrite was performed. Rollback is reverting
this code checkpoint; no before-image is required for a code-only guard.
