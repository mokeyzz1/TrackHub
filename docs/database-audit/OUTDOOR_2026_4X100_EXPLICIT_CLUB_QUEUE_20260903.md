# Outdoor 2026 4×100 explicit club queue

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

Generated 2026-09-03 from the private reconciliation queue. This is a classification packet only;
it does not create club rows, aliases, or public result changes.

## Scope

The remaining unresolved set includes **26 explicitly club-labeled identities** covering **53
actions**. Every row remains unresolved because the current catalog has no exact gendered identity
for the source label. These names should be treated as clubs/non-varsity entries, not aliases for
similarly named varsity teams.

## Parent-campus clubs already confirmed

These clubs have independent evidence and a parent university already present in the catalog:

| Club identity | Actions | Parent school in catalog | Evidence |
|---|---:|---|---|
| University of Minnesota Club | 6 | Minnesota (school 174) | [TFRRS result](https://tf.tfrrs.org/results/95292/5982778/Meet_of_the_Unsaintly/5000-Meters), [UMN sport clubs](https://recwell.umn.edu/programs/sport-clubs) |
| GVSU Track Club | 4 | Grand Valley State (school 483) | [GVSU club page](https://www.gvsu.edu/clubsports/cross-country-track-club-23) |
| Virginia Tech Running Club | 4 | Virginia Tech (school 341) | [TFRRS result](https://www.tfrrs.org/results/92677/m/2026_Liberty_Open) |
| OSU Running Club | 4 | Oregon State not yet confirmed in this catalog pass | [club site](https://osurunning.wixsite.com/home/about) |
| UO Running Club | 3 | Oregon not yet confirmed in this catalog pass | [club site](https://www.uorunning.com/about), [UO club sports](https://calendar.uoregon.edu/group/club-sports-running) |
| Brown University Running Club | 2 | Brown not yet confirmed in this catalog pass | Source label requires club-page verification |
| Northeastern Club Running | 2 | Northeastern not yet confirmed in this catalog pass | Source label requires club-page verification |
| Ohio State Running Club | 2 | Ohio State not yet confirmed in this catalog pass | [club site](https://www.osuclubrunning.org/) |
| UB Run Club | 2 | Buffalo not yet confirmed in this catalog pass | [UB cross-country/track club](https://ubrunningclub.wixsite.com/ubxctc) |
| URI Club Track and Field | 2 | Rhode Island not yet confirmed in this catalog pass | [club site](https://uriclubtrackandfield.wordpress.com/) |
| MSU Running Club | 1 | Michigan State not yet confirmed in this catalog pass | Source label requires club-page verification |
| University of Georgia Club XC | 1 | Georgia not yet confirmed in this catalog pass | Source label requires club-page verification |

The parent-school relationship does not authorize mapping these rows to varsity teams. A separate
club identity is required.

## Independent or source-only club labels

| Club identity | Actions | Meets |
|---|---:|---:|
| Garden State TC | 4 | 2 |
| AC Training | 3 | 2 |
| Delaware TC | 2 | 1 |
| Bowling Green Track Club | 1 | 1 |
| Holy Rollers Club | 1 | 1 |
| JennaStrong Track Club | 1 | 1 |
| Maryland Club Running | 1 | 1 |
| Michigan Running Club | 1 | 1 |
| Moore Elite Track Club | 1 | 1 |
| Northwood Athletic Club | 1 | 1 |
| Shocker Track Club, Inc | 1 | 1 |
| Shreveport Speed Track Club | 1 | 1 |
| SU Running Club | 1 | 1 |
| Woody Track Club | 1 | 1 |

## Required model decision

The current `public.teams` table has no club/non-varsity discriminator and requires every team to
point to a `school_id`. Before any public repair, decide whether clubs should be represented as
school-backed club teams, independent organizations, or a separate identity type. Until then,
these 53 actions remain private `needs_review` work and no varsity team ID should be substituted.
