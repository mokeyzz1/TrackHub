# Dependency and foreign-key review — 2026-09-03

## Live FK posture

All application foreign keys queried from `public` and `ingest` are validated. The canonical
result model currently has these enforced links:

- `results.athlete_id → athletes`
- `results.team_id → teams`
- `results.meet_id → meets`
- `results.event_type_id → event_types`
- `relay_results.meet_id → meets`
- `relay_results.team_id → teams`
- `relay_results.event_type_id → event_types`
- `relay_athletes.relay_result_id → relay_results`
- `relay_athletes.athlete_id → athletes`

The ingest control plane also has validated links from observations, source links, queues,
quarantine, and aliases into canonical facts and execution records. This corrects older draft
documentation that described some of these FKs as absent; the target plan must use the current
live catalog as the authority.

## Cascade-risk findings

Several existing delete actions are materially destructive and must constrain cleanup design:

- `athletes.school_id → schools` uses `ON DELETE CASCADE`.
- `teams.school_id → schools` uses `ON DELETE CASCADE`.
- `athlete_team_seasons` cascades from both athlete and team.
- `results.athlete_id → athletes` uses `ON DELETE CASCADE`.
- `relay_athletes.relay_result_id → relay_results` uses `ON DELETE CASCADE`.
- `events.meet_id → meets` uses `ON DELETE CASCADE`.
- `live_results` links use `ON DELETE SET NULL`.

Therefore, a “duplicate cleanup” cannot simply delete a school or athlete. It must first reassign
or reconcile all dependent rows, archive before-images, validate counts, and only then remove an
empty duplicate if the cascade impact is proven safe.

## Current views and semantic dependencies

- `public.schools_full` joins schools to regions and conferences but exposes the legacy text
  `schools.division` field.
- `public.teams_summary` also exposes legacy `schools.division` and counts
  `athlete_team_seasons` rows.
- `public.unprocessed_live_results` is a filtered projection of the stale `live_results` table and
  exposes raw event/name fields.
- `public.v_athlete_prs` derives PRs from canonical results, but its points logic extracts digits
  from `mark_raw`; component-like marks can therefore be interpreted as points without an explicit
  multi-event component model.

These views are part of the application contract. Column retirement or table disposition must
migrate their readers and definitions before changing the underlying fields.

## Disposition implications

The presence of validated FKs is healthy, but nullable foreign-key values still represent distinct
domain states (history, unattached athletes, unresolved source identities, or missing data). The
cleanup plan must not convert every nullable FK to `NOT NULL` without first classifying those
states. Likewise, cascade actions should be reviewed as part of the target model rather than used
as a shortcut for consolidation.
