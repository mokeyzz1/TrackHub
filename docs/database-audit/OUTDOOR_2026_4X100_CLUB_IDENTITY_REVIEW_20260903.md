# Outdoor 2026 4×100 club and institution identity review

Generated 2026-09-03. This is research and review material only; it does not create school/team
rows, aliases, or public result changes.

## Evidence-backed identities

These seven labels account for 29 unresolved 4×100 source actions. They are not interchangeable
with ordinary varsity-school aliases.

| Source identity | Actions | Identity classification | Evidence |
|---|---:|---|---|
| G.C. Foster | 4 | Jamaican college/institution | [G.C. Foster College Track & Field](https://gcfc.edu.jm/track-field/), [TFRRS Penn Relays](https://www.tfrrs.org/results/96652/Penn_Relays) |
| Garden State TC | 4 | Independent track club | [TFRRS Rider Invitational](https://www.tfrrs.org/results/95713/Rider_Invitational), [TFRRS Millrose Games](https://www.tfrrs.org/results/94600/5771637/118th_Millrose_Games/Womens-Distance-Medley-Relay) |
| GVSU Track Club | 4 | Grand Valley State student club; separate from varsity Grand Valley St. | [GVSU club page](https://www.gvsu.edu/clubsports/cross-country-track-club-23), [TFRRS 4×100 result](https://tfrrs.org/results/92963/5919809/GVSU_Al__Sue_Owens_Classic/Mens-4-x-100-Relay) |
| University of Minnesota Club | 6 | University student club; separate from varsity Minnesota | [TFRRS meet result](https://tf.tfrrs.org/results/95292/5982778/Meet_of_the_Unsaintly/5000-Meters), [University club-sports directory](https://recwell.umn.edu/programs/sport-clubs) |
| UTech | 4 | University of Technology, Jamaica | [UTech Department of Sports](https://www.utech.edu.jm/campus-life/department-of-sports/), [Penn Relays compiled results](https://api.tfrrs.org/results/96652/Penn_Relays) |
| Virginia Tech Running Club | 4 | Virginia Tech student club; separate from varsity Virginia Tech | [TFRRS Liberty Open result](https://www.tfrrs.org/results/92677/m/2026_Liberty_Open), [Virginia Tech varsity catalog context](https://www.tfrrs.org/teams/tf/VA_college_m_Virginia_Tech.html) |
| AC Training | 3 | Independent Chicago training club | [AC Training organization page](https://actrainingtnf.wixsite.com/ac-trainingtf), [TFRRS result search](https://upload.tfrrs.org/results/94353/5793172/2026_Blue_Demon_Alumni_Classic/60-Meters) |

## Catalog comparison

The live catalog already contains active varsity schools for Grand Valley State (school 483),
Minnesota (school 174), and Virginia Tech (school 341), with separate gendered varsity teams. It
does not contain a club-team row for any of the three source clubs, and it has no matching school
or team rows for G.C. Foster, Garden State TC, UTech, or AC Training.

The correct decision is therefore semantic, not a relay alias:

- Do not map a club result to its university’s varsity team.
- If club results are to be represented, define a reviewed club/institution identity model first,
  including ownership, gender handling, and authoritative source URL fields.
- Only then consider canonical team rows or aliases and re-run the private reconciliation.

Until that model decision is approved, all 29 actions remain `needs_review`. No public relay repair
should use the existing varsity IDs as substitutes.
