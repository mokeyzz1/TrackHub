# Athlete classification evidence audit — 2026-09-08

## Technical summary

The database can safely describe **observed collegiate history** and **representation at a
specific performance**. It cannot yet safely declare a person's current career stage,
post-collegiate status, professional status, or athletics eligibility. Those concepts require a
dated evidence model; they must not be inferred from `Unattached`, `class_year`, `is_active`, or a
missing team link.

This checkpoint is read-only. It changes no schema and no athlete, result, relay, roster, school,
or team row. Reproducible queries are in `athlete_classification_evidence_audit.sql`.

## Measured findings

The live population contains 151,537 athletes: 104,793 currently point to a collegiate school,
46,742 point to the Unattached placeholder, and two point to the one club school. Existing
relationship evidence identifies 106,724 athletes with some collegiate history. That includes
1,931 athletes whose current placeholder is Unattached but who have a collegiate result or relay.
Another 1,636 athletes point to a collegiate school without a stored roster season, collegiate
individual result, or collegiate relay; their current school link is the only local evidence.

The status-like profile fields cannot support current-stage classification:

- `grad_year` is NULL for all 151,537 athletes.
- `is_active` is true for 151,532 athletes and false for only five, so it is not a career-stage flag.
- `class_year` is populated for 77,818 collegiate athletes but is a source label, not a dated
  eligibility determination.
- `athlete_team_seasons` covers 91,351 athletes and only seasons 2024–25 and 2025–26. All 127,357
  rows say `active`, so that column does not distinguish present, former, or inactive athletes.

Provider coverage is uneven. TFRRS IDs exist for 104,712 of 104,793 collegiate-linked athletes
(99.92%) but only 2,037 of 46,742 Unattached-linked athletes (4.36%). Athletic.net URLs cover
85,188 collegiate-linked athletes and 14,623 Unattached-linked athletes. Provider IDs identify a
source record; they do not prove current career stage or person equivalence by themselves.

Performance affiliation is usable but incomplete. Individual results contain 3,419,178 rows;
3,017,668 connect to a collegiate school through `team_id`, while 401,362 (11.74%) have no team
relationship. A missing team therefore means **affiliation unknown**, not Unattached. Explicit
`team_type` is also sparse: 3,507 of 3,622 teams have NULL `team_type`, although their school link
still supplies institutional context.

## Classification rules supported by the evidence

| Concept | Safe automatic evidence | Must not be used alone |
|---|---|---|
| Observed collegiate history | Dated collegiate roster, individual result, relay result, or reviewed source profile | Current `school_id` without provenance |
| Current collegiate participation | Current-season roster or current-season collegiate performance with dated source evidence | Old class year, `is_active`, logo, or historical school |
| Scholastic participation | Dated scholastic roster/result tied to a reviewed scholastic organization | Age, meet participation, or school-like name |
| Post-collegiate stage | Explicit reviewed source evidence or an owner-reviewed transition after the collegiate interval | Unattached result, elapsed time, or presumed graduation |
| Professional status | Explicit authoritative professional/sponsored status with effective dates | Fast mark, prize meet, club, country, or Unattached label |
| International representation | Country/national-team affiliation on that performance | Nationality inferred from name or location |
| Unattached representation | Explicit source affiliation on that performance | NULL `team_id` or athlete-level placeholder school |

Career stage, professional status, and performance representation are independent axes. For
example, one person may be post-collegiate, professional, and represent Unattached in one race.

## Why eligibility is excluded

NCAA eligibility depends on enrollment, age, exceptions, academic requirements, and an
institution's determination. Rules also changed for athletes entering from 2026–27. The current
database does not contain enough of those inputs and should not present an inferred eligibility
decision as fact. The future model will store observed status evidence, not calculate governing-body
eligibility.

## Next implementation checkpoint

Add a dated athlete-status evidence layer that preserves source and confidence, while retaining
result/relay representation separately. Backfill only deterministic historical evidence first.
Current, post-collegiate, professional, and unresolved states remain unchanged until their required
evidence exists. Writers must dual-write evidence before any legacy `athletes.school_id` behavior is
relaxed.

Required automated tests: non-overlapping effective intervals per status axis, accepted values,
source/evidence presence, deterministic replay, conflict hold behavior, result affiliation remaining
independent of career stage, RLS/grant coverage, and backward-compatible reads.
