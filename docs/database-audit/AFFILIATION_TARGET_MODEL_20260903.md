# Affiliation target model — 2026-09-03

## Proposed relationship

```text
athletes (people)
    │
    └──< athlete_team_seasons >── teams (competition affiliations)
                                      │
                                      └── schools (optional collegiate institution)

results.team_id ──────────────── optional team affiliation
relay_results.team_id ────────── optional relay affiliation
results.athlete_id ───────────── required person identity
```

## Core changes

### `athletes`

- Keep one row per person/source-resolved identity.
- Make `school_id` nullable after readers and writers are migrated; retain it temporarily as a
  legacy/current-institution field if needed for compatibility.
- Do not create a fake school for unattached, club, international, or scholastic people.
- Preserve source IDs and aliases in the existing identity/provenance layers.

### `teams`

- Keep one row per competition affiliation/gender where that distinction is meaningful.
- Make `school_id` nullable for non-collegiate affiliations.
- Add an explicit display name and affiliation type if current school-derived naming cannot represent
  the source label. Candidate types: `collegiate`, `club`, `scholastic`, `international`, `open`,
  `unattached`, and `other`.
- Allow mixed/open relay identities without pretending they are men's or women's collegiate teams.

### `schools`

- Keep as the collegiate/institutional dimension unless later evidence proves a generalized
  organization table is required.
- Do not repurpose `division = 'Other'` as a non-collegiate bucket.
- Keep the existing `Unattached` row during migration; retire it only after dependent facts have
  been moved to explicit nullable/team affiliations and rollback is verified.

### `athlete_team_seasons`

- Make this the time-aware affiliation history.
- Permit an athlete to have different affiliations across seasons.
- Preserve historical team membership rather than overwriting a person’s current identity.

### Facts

- Individual `results.team_id` remains nullable for legitimate unattached/history performances.
- Relay `relay_results.team_id` can reference a collegiate, club, scholastic, international, open,
  or other explicit team type.
- Raw source team labels remain in provenance/alias records even after canonical resolution.

## Examples

| Real-world case | Athlete | Team | School |
| --- | --- | --- | --- |
| Collegiate runner | person row | college team | required institution |
| Club runner | person row | named club team | NULL |
| High-school runner | person row | named scholastic team | NULL or reviewed institution |
| International relay | person rows | country/international team | NULL |
| Unattached individual | person row | NULL for individual result | NULL |
| Unattached relay label | person rows | explicit open/unattached relay team if needed | NULL |
| Athlete changing schools | one person row | multiple season/team bridge rows | historical affiliations preserved |

## Safe implementation order

1. Add replacement team name/type fields alongside current fields.
2. Inventory and classify all placeholder/non-collegiate labels.
3. Update scraper writers and frontend readers to use team affiliation and season history.
4. Make `athletes.school_id` and `teams.school_id` nullable only after dependency tests pass.
5. Migrate deterministic rows and archive before-images.
6. Reconcile or retire the `Unattached` placeholder only when it is empty and rollback is tested.
7. Add constraints and indexes for the new identity rules after collision review.

No schema or data change is included in this design document.
