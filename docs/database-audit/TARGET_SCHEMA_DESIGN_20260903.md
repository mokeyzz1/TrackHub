# Target schema design — 2026-09-03

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

This is the proposed destination for the database-wide cleanup. It is design-only: no DDL,
backfill, or data mutation is included.

## Core design rule

Separate a person from an affiliation. An athlete can compete as collegiate, club, scholastic,
international, alumni, or unattached across different meets and seasons. A relay team can have a
team identity without implying that every athlete belongs to a college.

## Critical current mismatch

`public.athletes.school_id` is currently `NOT NULL`, and `public.teams.school_id` is currently
`NOT NULL`. That means the current schema requires every athlete and team to be represented through
a school-shaped row, even when the source identity is a club, high school, country, alumni group, or
unattached competitor.

This must not be “fixed” by creating fake schools. The target design must choose one of these
evidence-backed paths before applying changes:

1. Make athlete/team school links nullable and use `athlete_team_seasons` plus an explicit team
   classification/display identity for affiliations; or
2. Introduce a generalized organization/affiliation dimension only if code and data review prove
   that the existing school/team model cannot represent those identities safely.

The choice is still open. Existing 4x100 classifications must not decide it.

## Target public layers

### People and affiliations

- `athletes` is the person dimension: stable identity, source IDs/aliases, optional profile data,
  and no forced collegiate affiliation.
- `teams` is an affiliation/competition identity with gender, type, display name, and optional
  organization link.
- `schools` remains the collegiate/institutional dimension unless the organization review proves it
  must be generalized.
- `athlete_team_seasons` records time-bounded affiliation; it is not a duplicate athlete table.

### Meets and events

- `meets` is the canonical meet identity and date range.
- Source URLs, source records, and import status remain provenance/operational concerns and should
  be linked rather than copied into every fact.
- `event_types` is the canonical event catalog; `event_aliases` is the source-label mapping.
- Season and environment semantics must be consistent across meets, results, and relays. A new
  season dimension is a design option, not an automatic migration requirement.

### Facts

- `results` is the individual-performance fact table.
- `relay_results` is the relay-parent fact table.
- `relay_athletes` is the relay-leg bridge.
- Canonical IDs (`athlete_id`, `team_id`, `meet_id`, `event_type_id`) are authoritative; raw names,
  event text, and copied meet text are provenance/display fallbacks.
- Nullable links represent explicit states until a deterministic repair or classification exists.

## Column-level target changes to evaluate

| Current field | Target direction | Gate before change |
| --- | --- | --- |
| `athletes.school_id NOT NULL` | decouple person from mandatory school affiliation | classify all non-collegiate/history identities and migrate readers |
| `teams.school_id NOT NULL` | support typed/display-only affiliations where appropriate | inventory club/scholastic/international team rows and code assumptions |
| `results.event_name`, `relay_results.event_name` | retain raw provenance; use `event_type_id` as canonical | complete alias coverage and quarantine unknown labels |
| `results.event_id`, `relay_results.event_id` | retire after reader migration | prove no active writer/reader depends on legacy event instances |
| `results.season_code` | replace or populate from one season policy | reconcile meet season labels and cross-year seasons |
| `results.meet_name`, `meet_location` | retain only as source/display fallback | migrate reads to `meet_id` and verify historical provenance |
| `results.mark_seconds`, `mark_meters`, `mark_feet` | define typed measure policy; retire redundant representation where safe | compare all source formats and derived values |
| `results.is_pr`, `is_season_best` | derive from validated facts | migrate PR/ranking consumers and define legal-mark rules |
| `athlete_prs` | replace with validated derived view/materialized strategy | migrate every reader and compare outputs |
| `meets.results_*` status fields | separate operational state from meet identity if warranted | map all writers and define state machine |

## Target private layers

Keep `ingest.runs`, `source_records`, `observations`, `source_links`, `quarantine`, aliases,
recovery queues, and `fact_cleanup_archive` private. These layers provide provenance, review, and
rollback; they should not be collapsed into public fact tables merely to reduce table count.

## Target integrity rules

- All canonical foreign keys remain validated.
- Add uniqueness only after collision populations are classified and a canonical identity key is
  proven (especially athletes, schools, meets, and facts).
- Replace destructive cascade shortcuts with explicit reassignment/archival workflows where data
  preservation requires it.
- Keep raw source values for auditability while preventing them from being mistaken for canonical
  identity.
- Enforce one controlled writer contract for canonical facts.
- Keep public roles read-only except for explicitly validated user actions.

## Design completion criteria

The target schema is not ready to implement until:

1. Every current table and column has a disposition in the matrix.
2. Non-collegiate affiliation behavior is resolved without fake-school records.
3. Every legacy reader/writer has a migration or retirement path.
4. Backfill feasibility and row-level impact are quantified.
5. Each change has a dry-run, archive, rollback, and invariant test plan.
