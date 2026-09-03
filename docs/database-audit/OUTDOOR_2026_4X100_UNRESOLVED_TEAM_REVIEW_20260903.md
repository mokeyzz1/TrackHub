# Outdoor 2026 4×100 unresolved source-team review

Generated 2026-09-03 from the private reconciliation queue. This is a profiling report only; it
does not create aliases or change public team/result rows.

The queue contains 744 unresolved source-team actions across 145 meets and 346 distinct source
team names. An exact, gender-aware comparison against active canonical school names produced zero
matches for all 518 unique source-name/gender combinations. These therefore require source-key or
research-backed mapping; name-only inserts would be unsafe.

## Highest-frequency unresolved names

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

The next mapping pass should use the source result/team URL, state or conference context, and the
existing `public.schools`/`public.teams` catalog together. Until that evidence is assembled, these
744 actions remain `needs_review` and no alias migration should be proposed.
