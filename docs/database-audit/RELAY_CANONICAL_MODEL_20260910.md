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

The zero values were verified immediately after schema deployment: the migration prepared the
private relationship shape, but no updated ingestion run or historical backfill had used it.
Existing public result and relay facts were not rewritten. Schema deployment did not perform a
RELAY-02 repair.

### Product rollout decision — 2026-09-10

The app-reader release remains intentionally postponed. The user plans to include this reader
change in the larger future UI rebuild rather than publish an Expo update now. Both reader and
writer code were merged into `main` at merge commit `5a22cbd` after the exact merged tree passed
local unit, workflow, migration-history and PostgreSQL integration checks.

This makes the writer **code-active but not yet observed data-active**: scheduled ingestion now
contains the canonical implementation, but the two new provenance columns were still empty at the
post-migration verification point because no qualifying relay ingestion had populated them. The
owner accepted merging before the app release because the product is currently in cross-country
season and expects indoor track to begin around December.

Until the future app release is confirmed:

- do not publish an Expo update or submit a new mobile build for RELAY-01;
- do not run RELAY-02 historical reconciliation.

Existing compatibility relay rows were preserved, so historical relay screens in the installed app
continue operating as before. If an unexpected relay is ingested before the app update, the new
canonical fact will not receive a compatibility copy in `public.results` and may therefore be absent
from the old app's meet-event list. That is an accepted temporary seasonal risk, not a claim that
the two readers are equivalent.

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

The nullable private columns and indexes can safely remain without affecting existing readers. A
schema rollback is not currently necessary; any future removal must first confirm whether scheduled
ingestion has populated relay-membership links.
