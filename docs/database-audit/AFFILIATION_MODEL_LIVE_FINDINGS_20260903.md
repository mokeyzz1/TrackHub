# Affiliation model live findings — 2026-09-03

## The mandatory-school problem is real

The live schema requires `athletes.school_id` and `teams.school_id`. The consequence is visible in
production data:

- `public.schools.school_id = 1835` is named `Unattached`.
- It has no division, city, or state.
- It owns two teams and 48,124 athletes.
- The row is acting as a placeholder organization so people can satisfy the mandatory school FK.

This is not a reason to delete the `Unattached` data. It is evidence that person identity and
competition affiliation are coupled too tightly in the current schema.

## “Other” is not a safe non-collegiate bucket

The 129 schools with `division = 'Other'` have 245 teams and 5,654 athletes. The populated examples
include clearly collegiate institutions such as North Central (Ill.), Marian (Ind.), Concordia
(Neb.), SUNY Geneseo, Guelph, and British Columbia. Therefore `Other` cannot be reclassified as
club, scholastic, international, or unattached without source-by-source review.

## Target implication

The improved model must let an athlete exist as a person independently of a collegiate school, while
still preserving historical affiliation. A safe design must support:

- unattached athletes with no institution;
- club and open teams;
- high-school and scholastic teams;
- international/country teams;
- collegiate school teams;
- athletes who move between those affiliations across seasons;
- relay participation that may be team-linked even when an individual school is not.

The preferred direction is to make affiliation explicit and time-aware through the existing team /
season bridge wherever possible. A generalized organization table should be introduced only if the
code/data review proves that nullable school links plus typed/display affiliations cannot represent
the needed states cleanly.

## Safety requirements

Before changing the mandatory school FK:

1. Inventory all athletes and teams under `Unattached`, `Other`, and other placeholder-like rows.
2. Classify source identities and preserve raw labels.
3. Migrate readers and writers to the new affiliation semantics.
4. Archive before-images and test all dependent results, relays, and seasons.
5. Remove or retire placeholder rows only after they are empty and rollback is verified.

No affiliation rows were changed by this review.
