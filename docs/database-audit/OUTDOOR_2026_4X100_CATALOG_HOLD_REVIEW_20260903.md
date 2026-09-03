# Outdoor 2026 4×100 catalog-hold review

Generated 2026-09-03 from the private reconciliation queue. This is a read-only classification;
it does not create teams, aliases, or public result changes.

## Finding

The current unresolved set contains **536 source-team actions** across **78 meets**, represented by
**439 source-name/gender pairs** and **313 distinct source names**. Each pair was compared against
all gendered canonical rows in `public.teams`, including inactive historical teams, using the same
normalization as the private resolver.

| Exact catalog classification | Name/gender pairs | Actions |
|---|---:|---:|
| Active canonical match | 0 | 0 |
| Inactive historical canonical match | 0 | 0 |
| Ambiguous exact match | 0 | 0 |
| No exact catalog row | 439 | 536 |

This means the earlier inactive-team holds (Catholic, Oswego State, Wisconsin affiliates, and
similar identities) were resolved by the historical-team pass and are no longer part of the
unresolved bucket. The remaining rows cannot be safely fixed with a name-only alias because the
catalog has no exact gendered identity for them.

## Highest-frequency remaining gaps

| Source name | Gender | Actions | Meets |
|---|---:|---:|---:|
| Clackamas CC | M | 6 | 6 |
| Clackamas CC | F | 5 | 5 |
| SW Oregon CC | M | 5 | 5 |
| Everett CC | F | 4 | 4 |
| G.C. Foster | M | 4 | 2 |
| Garden State TC | M | 4 | 2 |
| GVSU Track Club | M | 4 | 3 |
| Mt. Hood CC | F | 4 | 4 |
| United States | M | 4 | 1 |
| University of Minnesota Club | M | 4 | 2 |
| UTech | M | 4 | 2 |
| AC Training | M | 3 | 2 |
| Everett CC | M | 3 | 3 |
| Mt. Hood CC | M | 3 | 3 |
| SW Oregon CC | F | 3 | 3 |
| Virginia Tech Running Club | M | 3 | 1 |
| ADM, Adel | F | 2 | 1 |
| Bishop Moore | M | 2 | 1 |
| Bullis | F | 2 | 1 |
| Centennial | M | 2 | 1 |

## Required evidence before any mapping

For each proposed identity, review the authoritative TFRRS result/team URL, meet state or
conference context, and the existing `public.schools`/`public.teams` catalog. High-school teams,
clubs, unattached groups, and colleges can share short labels, so a global alias based only on this
display name would be unsafe.

No alias migration or public team-link repair should be proposed from this packet alone.
