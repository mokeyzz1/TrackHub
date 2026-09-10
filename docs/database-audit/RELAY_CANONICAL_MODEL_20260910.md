# Canonical relay model checkpoint — 2026-09-10

> Evidence for RELAY-01 in the [database master checklist](MASTER_CHECKLIST.md).

## Contract

- `public.relay_results` stores one team performance.
- `public.relay_athletes` stores ordered participation in that performance.
- `public.results` stores individual performances; relay membership is not an individual fact.
- `ingest.source_links.relay_athlete_id` gives each new `relay_leg` source record an exact private
  provenance target. Existing legacy `relay_leg -> result_id` links remain valid until RELAY-02.

## Implemented

- The shared canonical writer no longer inserts new relay-leg copies into `public.results`.
- Parent and leg replays remain idempotent. Missing or ambiguous parent/slot relationships are
  quarantined instead of guessed, including historical duplicate leg slots.
- The meet screen combines individual events from `results` with relay events from
  `relay_results`; relay projections are excluded from the individual event query.
- Event display uses canonical `event_types.code` while raw source labels remain preserved.
- Collegiate app filtering remains enforced for both individual and relay event lists.

## Preservation and rollout

The migration is additive. It adds two private provenance columns, their foreign keys/indexes and
target-consistency checks. It does not update or delete public facts. The 112,724 relay-classified
rows measured in `public.results` remain unchanged for RELAY-02 classification.

### Live migration checkpoint — 2026-09-10

Migration `20260910114719_add_relay_leg_canonical_provenance.sql` is applied to production and is
recorded once in `supabase_migrations.schema_migrations`. Live verification confirmed:

- `ingest.observations.canonical_relay_athlete_id` and
  `ingest.source_links.relay_athlete_id` exist as nullable private columns;
- both foreign keys are validated and use `ON DELETE RESTRICT` against
  `public.relay_athletes(relay_athlete_id)`;
- both partial indexes exist and all four target-consistency checks are validated; and
- both new columns contain zero non-null values.

The zero values are intentional: the migration prepared the private relationship shape, but no
updated ingestion run or historical backfill has used it. Existing public result and relay facts
were not rewritten. Schema readiness therefore does not mean writer activation or RELAY-02 repair.

Do not activate the new writer in production before releasing the updated app reader: installed
older builds still discover relay events through compatibility rows in `results`. The safe order is
migration (complete), updated app reader, then canonical writer activation.

### Product rollout decision — 2026-09-10

The app-reader release is intentionally postponed. The user plans to include this reader change in
the larger future UI rebuild rather than publish an Expo update now. The reader implementation stays
committed on this branch and must not be released independently unless the user later requests it.

Until that future app release is confirmed:

- do not publish an Expo update or submit a new mobile build for RELAY-01;
- do not activate the canonical relay writer in scheduled or manual production ingestion; and
- do not run RELAY-02 historical reconciliation.

The deployed nullable private schema may remain idle safely. The existing app and compatibility
relay rows continue operating as they did before this checkpoint.

## Verification

- 269 ingestion tests pass.
- 27 PostgreSQL 17 isolated integration tests pass.
- The regression proves one relay parent, one membership, one leg-provenance link, zero individual
  result copies, and idempotent replay.
- Focused frontend lint reports zero errors.
- A read-only anonymous live API probe returned canonical relay codes through the new relationship
  shape for an existing meet.
- Production received only the additive private migration described above; no public fact rows or
  historical relay relationships were changed.

Before writer activation, the two nullable private columns and indexes can safely remain without
affecting existing readers. A schema rollback is not currently necessary; any future removal must
first confirm that no relay-membership links have been populated.
