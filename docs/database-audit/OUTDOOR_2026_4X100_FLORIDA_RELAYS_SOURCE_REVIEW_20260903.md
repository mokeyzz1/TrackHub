# Outdoor 2026 4x100 Florida Relays source-identity review

Date: 2026-09-03  
Scope: `outdoor-2026-4x100-source-reconciliation-v1`  
Status: private review only; no public rows, aliases, or result facts changed.

## Finding

The Pepsi Florida Relays private queue contains 21 unresolved-source actions for six labels.
Five are Florida high-school programs. “United States” is not a school: TFRRS lists it as an
open/international relay with squads A–D and no athlete names. None of these labels should be
mapped to a college varsity team or used to create a generic school row.

| Source label | Actions | Evidence-backed interpretation | Safe holding decision |
|---|---:|---|---|
| Miami Norland | 3 | Miami Norland Senior High School, Florida | Hold as scholastic |
| Niceville | 3 | Niceville High School, Florida | Hold as scholastic |
| Oakleaf | 3 | Oakleaf High School, Orange Park, Florida | Hold as scholastic; confirm canonical school record |
| Rickards | 4 | James S. Rickards High School, Tallahassee, Florida | Hold as scholastic |
| Rockledge | 4 | Rockledge High School, Florida | Hold as scholastic |
| United States | 4 | TFRRS open/international relay squads A–D; no athletes in retained payload | Hold as open/international, not a school |

Representative retained source URLs:

- [2026 Pepsi Florida Relays compiled results](https://tf.tfrrs.org/results/95329/2026_Pepsi_Florida_Relays)
- [Men's 4x100 source page](https://www.tfrrs.org/results/95329/6002612/2026_Pepsi_Florida_Relays/Mens-4-x-100-Relay)
- [Women's 4x100 source page](https://www.tfrrs.org/results/95329/6002611/2026_Pepsi_Florida_Relays/Womens-4-x-100-Relay)
- [United States relay listing](https://www.tfrrs.org/results/95329/m/2026_Pepsi_Florida_Relays)

## Evidence reviewed

- [Miami Norland athletics](https://www.miaminorlandshs.org/apps/pages/index.jsp?type=d&uREC_ID=269850)
  identifies boys/girls varsity track and field at Miami Norland Senior High School. Its event
  calendar also places the school at the Pepsi Florida Relays.
- [Niceville High School Track and Field](https://nhstf.com/) identifies itself as the official
  site for the Florida high-school track program.
- [Oakleaf's FHSAA classification listing](https://s3.amazonaws.com/fhsaa.org/documents/2024/7/9/Girls_Track_Field_2024_26.pdf)
  lists Oakleaf (Orange Park) among Florida high-school track schools.
- [Rickards High track and field](https://rickards.leonschools.net/track-and-field) identifies
  the Tallahassee high school's track program; the school's athletics page states it competes
  under the Florida High School Athletic Association.
- [Rockledge High athletics](https://www.brevardschools.org/o/rhs/page/athletics) identifies
  Rockledge High School in the Brevard district; its handbook lists boys/girls varsity track
  coaches.
- TFRRS's [men's meet results](https://www.tfrrs.org/results/95329/m/2026_Pepsi_Florida_Relays)
  explicitly shows “United States” squads A–D in a separate 4x100 section, with no athlete names,
  alongside “Unattached” and Brazil. This is a meet-entry category, not a canonical school.

## Safe next step

Keep all 21 actions in private `manual_review`. The five school labels may be mapped only after
the canonical school catalog and campus are verified. Preserve “United States” as a non-school
open/international identity; do not add it to `public.schools` or `public.teams`, and do not
promote its results as collegiate or scholastic school results.

