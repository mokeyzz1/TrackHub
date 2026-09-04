# Athletic.net source-page snapshot review — 2026-09-04

This is a read-only check of the five duplicated Athletic.net URL keys found in production. The
live AthleticLIVE or Athletic.net page was opened on 2026-09-04 and its visible title, date, venue,
and linked static meet (when present) were recorded. A page identity is evidence about source reuse;
it is not a merge or reassignment instruction. No production rows or schema objects were changed.

## Snapshot register

| Athletic.net URL | Page identity observed | Production rows using the URL | Disposition |
| --- | --- | --- | --- |
| [`live.athletic.net/meets/66223`](https://live.athletic.net/meets/66223) | Jenna Strong - Wilmington College Invitational, Apr. 4, 2026, Wilmington College, OH; static meet link `649028` | 12747 Jenna Strong Invite (2026-04-25), 12914 Bill Kincaid Invitational (2026-04-25) | Live page is a different edition/date and one of two names; treat URL as a reused alias and keep both parents |
| [`live.athletic.net/meets/67952`](https://live.athletic.net/meets/67952) | 2026 Pacific Coast Athletic Conference Prelims and Finals, Apr. 15 and Apr. 18, 2026, Cuyamaca College, El Cajon, CA; static meet link `638651` | 12620 Prelims (2026-04-15), 12587 Championships (2026-04-18) | One source meet deliberately spans two date segments; preserve both fact parents until a parent/segment model is proven |
| [`live.athletic.net/meets/70965`](https://live.athletic.net/meets/70965) | Marauders Tune-up, Apr. 29, 2026, MDU Resources Community Bowl, Bismarck, ND; static meet link `662662` | 12937 Marauders Tune-Up (2026-04-28–30), 12936 U-Mary Senior Day Open (2026-04-29) | Page aligns to the Marauders row; the U-Mary row remains a separate held candidate |
| [`www.athletic.net/TrackAndField/meet/639904/results`](https://www.athletic.net/TrackAndField/meet/639904/results) | New England Division III Indoor Championships [Combined Events], Feb. 27–28, 2026, Tufts University, Medford, MA | 11911 Combined Events (2026-02-28), 11912 Championships (2026-03-01) | Source page supports the combined-events parent; the main championship row must not inherit this URL without mapping evidence |
| [`www.athletic.net/TrackAndField/meet/651507/results`](https://www.athletic.net/TrackAndField/meet/651507/results) | Grubbys Easter Classic, Apr. 4, 2026, South Dakota Mines O'Harra Stadium, Rapid City, SD; live results link `66161` | 12325 `Grubbys` (2026-04-03), 12472 `Grubby's` (2026-04-03) | Same source page and near-date pair confirm a duplicate candidate, but the 194/202 overlap and split source lineage require a union/survivor plan |

## What the pages establish

- Numeric/live Athletic.net IDs are not safe historical meet keys. ID `66223` currently names a
  different 2026 meet than either production row, while the static page for the same number also
  resolves to an older high-school meet.
- ID `67952` is a useful example of a single source meet with multiple competition days. The two
  production rows are not automatically duplicates just because they share a page.
- ID `70965` has one page-date/name alignment and one conflicting production parent; the disjoint
  canonical fact sets already measured in the meet scan support keeping both until source ownership
  is settled.
- ID `639904` is explicitly a combined-events page. The main championship row is a parent-mapping
  problem, not a missing-results row.
- ID `651507` is the strongest duplicate candidate, but the source page alone cannot decide which
  four differing individual rows and three differing relay rows survive. Athletic.net and TFRRS
  source links must be unioned without losing provenance before any cleanup.

## Disposition and next gate

Keep all five URL groups as aliases and preserve every meet/result/relay row. Do not add a unique
constraint on `athletic_net_results_url`, overwrite names/dates from the current page, or reassign
facts from one parent to another. The next safe step is a source-aware ownership map using the
existing private source records and cleanup archive; only then can a reversible union plan be
drafted for `651507` or a segment/parent mapping for `67952` and `639904`.
