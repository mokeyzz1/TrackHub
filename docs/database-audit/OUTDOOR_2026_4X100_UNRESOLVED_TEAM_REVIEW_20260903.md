# Outdoor 2026 4×100 unresolved source-team review

Generated 2026-09-03 from the private reconciliation queue. This is a profiling report only; it
does not create aliases or change public team/result rows.

The queue contains 536 unresolved source-team actions across 78 meets and 313 distinct source
team names. An exact, gender-aware comparison against active canonical school names produced zero
matches for the unresolved set. A read-only re-fetch of all 227 source event pages recovered three
unique-prefix resolutions (`Highland` F → team 2003, `Hudson` M → team 2016, and `Marion` F → team
2066). Including historical inactive teams in the private resolver resolved additional exact
identities; the remaining actions require source-key or research-backed mapping. Name-only inserts
would be unsafe.

## Highest-frequency unresolved names (initial snapshot)

| Source name | Gender | Actions | Meets |
|---|---:|---:|---:|
| Catholic | F | 8 | 6 |
| Oswego State | F | 7 | 3 |
| Wis.-La Crosse | M | 7 | 5 |
| Clackamas CC | M | 6 | 6 |
| Wis.-La Crosse | F | 6 | 4 |
| Wis.-Oshkosh | M | 6 | 4 |
| Clackamas CC | F | 5 | 5 |
| Rochester | M | 5 | 3 |
| SW Oregon CC | M | 5 | 5 |
| Washington U. | F | 5 | 3 |
| Wis.-Stout | M | 5 | 5 |
| ADM, Adel | F | 4 | 1 |
| Allegheny | M | 4 | 4 |
| Brockport St. | M | 4 | 4 |
| Bryn Mawr | F | 4 | 3 |
| Cortland St. | M | 4 | 3 |
| Everett CC | F | 4 | 4 |
| G.C. Foster | M | 4 | 2 |
| Garden State TC | M | 4 | 2 |
| GVSU Track Club | M | 4 | 3 |

After the historical-team resolver recheck, the current leading unresolved names are:

| Source name | Gender | Actions | Meets |
|---|---:|---:|---:|
| Clackamas CC | M | 6 | 6 |
| Clackamas CC | F | 5 | 5 |
| SW Oregon CC | M | 5 | 5 |
| ADM, Adel | F | 4 | 1 |
| Everett CC | F | 4 | 4 |
| G.C. Foster | M | 4 | 2 |
| Garden State TC | M | 4 | 2 |
| GVSU Track Club | M | 4 | 3 |
| Mt. Hood CC | F | 4 | 4 |
| United States | M | 4 | 1 |
| University of Minnesota Club | M | 4 | 2 |
| UTech | M | 4 | 2 |
| Valley, WDM | F | 4 | 1 |
| Waukee NW | F | 4 | 1 |
| AC Training | M | 3 | 2 |
| Everett CC | M | 3 | 3 |
| Mt. Hood CC | M | 3 | 3 |
| Pleasant Valley | F | 3 | 1 |
| SE Polk | F | 3 | 1 |
| SW Oregon CC | F | 3 | 3 |

The next mapping pass should use the source result/team URL, state or conference context, and the
existing `public.schools`/`public.teams` catalog together. Until that evidence is assembled, these
536 actions remain `needs_review` and no alias migration should be proposed.

See the [source-key review packet](</Users/mk/Projects/track-meet-tracker/docs/database-audit/OUTDOOR_2026_4X100_SOURCE_KEY_REVIEW_20260903.md>)
for the three recovered candidates. They remain unapproved and unchanged.

## Source-key catalog hold

A focused re-fetch of the highest-frequency names recovered authoritative keys such as
`Catholic`, `Oswego_State`, `Wis_La_Crosse`, `Wis_Oshkosh`, `Rochester`, `Washington_U`, and
`Wis_Stout`. Their matching school records exist, but every corresponding gendered team row is
currently inactive. `Clackamas_CC` and `SW_Oregon_CC` have no matching school/team record at all.
These are catalog-identity issues, not safe alias opportunities; they require a separate reviewed
school/team decision before any 4×100 repair can use them.
