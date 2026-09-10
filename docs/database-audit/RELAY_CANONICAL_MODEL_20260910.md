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

Do not activate the new writer in production before releasing the updated app reader: installed
older builds still discover relay events through compatibility rows in `results`. The safe order is
migration, updated app reader, then canonical writer activation.

## Verification

- 269 ingestion tests pass.
- 27 PostgreSQL 17 isolated integration tests pass.
- The regression proves one relay parent, one membership, one leg-provenance link, zero individual
  result copies, and idempotent replay.
- Focused frontend lint reports zero errors.
- A read-only anonymous live API probe returned canonical relay codes through the new relationship
  shape for an existing meet.
- No production schema or data was changed during this checkpoint.

Rollback before activation is a code revert plus removal of the additive migration from the
undeployed branch. After schema deployment, the two nullable private columns and indexes can remain
without affecting existing readers; dropping them requires first confirming no new membership links
exist.
