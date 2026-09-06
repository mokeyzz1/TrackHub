# Preservation-first schema migration waves — 2026-09-03

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

This is the proposed execution order for improving the live database. Each wave is independently
dry-run, validated, archived, and reversible. No wave is authorized merely because it appears in
this document.

## Wave 0 — Freeze and establish truth

- Keep the 4x100 workflow paused.
- Pause/gate unattended canonical fact writers while structural changes are prepared.
- Reconcile repository migrations with `supabase_migrations.schema_migrations` and all archived
  out-of-band operations.
- Capture a fresh backup/restore checkpoint and invariant baseline.

Exit gate: production schema, data counts, security posture, and writer commit are reproducible.

## Wave 1 — Make reads and writes authoritative

- Move frontend reads from copied meet/event text to `meet_id` and `event_type_id`.
- Remove ignored filter arguments and add pagination to large fact reads.
- Route every canonical writer through one controlled transaction contract.
- Preserve raw source fields for provenance while preventing them from acting as identity keys.

Exit gate: code search and runtime tests show no untracked writer or legacy reader for the fields
being changed.

## Wave 2 — Resolve affiliation semantics

- Decide whether nullable school links plus typed/display affiliations are sufficient, or whether a
  generalized organization dimension is truly required.
- Ensure club, scholastic, international, alumni, and unattached identities do not require fake
  college schools.
- Preserve historical team/season relationships in `athlete_team_seasons` and source aliases.

Exit gate: every current athlete/team identity has a documented classification and migration path.

## Wave 3 — Normalize seasons, environments, rounds, and events

- Introduce one canonical season policy and map every existing season value.
- Backfill deterministic environments; hold ambiguous NULLs.
- Normalize round vocabulary while retaining raw round text and heat numbers.
- Expand event aliases before adding event types; quarantine unknown labels.
- Define multi-event component semantics before changing PR/ranking calculations.

Exit gate: value mapping coverage reaches 100% or every exception is explicitly quarantined.

## Wave 4 — Reconcile identities and canonical facts

- Resolve school, athlete, team, and meet collisions using source IDs, dependencies, and evidence.
- Reassign dependent rows before retiring duplicates; never rely on destructive cascades as a merge
  mechanism.
- Repair deterministic nullable links and retain unresolved history/unattached states.
- Apply uniqueness constraints only after the candidate population passes dry-run checks.

Exit gate: before/after row counts, source links, relay legs, and public read outputs match expected
results; rollback restores the exact prior state.

## Wave 5 — Derived data and legacy retirement

- Migrate all PR/ranking readers to validated derived data.
- Reconcile `athlete_prs` against `v_athlete_prs` and retire the scraped table only after parity
  tests.
- Retire legacy columns (`event_id`, copied meet fields, unused season fields, redundant measures)
  only after reader/writer removal.
- Decide the future of `events` and `live_results` after their readers and lifecycle are explicit.

Exit gate: repository search, generated types, frontend tests, scraper tests, and production read
checks show no dependency on retired objects.

## Wave 6 — Archive and security boundary cleanup

- Move or isolate public backup tables behind a private archive boundary if restore requirements are
  satisfied.
- Preserve `fact_cleanup_archive` as append-only rollback evidence.
- Review policies, grants, function search paths, and service-role boundaries after each structural
  move.

Exit gate: public roles cannot mutate or read private/archive data beyond the intended contract.

## Wave 7 — Performance and operational cleanup

- Review unused/overlapping indexes using measured query workloads.
- Add missing FK indexes only where query plans justify them.
- Vacuum/analyze after large reconciliations.
- Add invariant, migration-replay, and backup-restore tests to prevent regression.

Exit gate: workload benchmarks and integrity checks improve or remain neutral, with rollback ready.

## Non-negotiable safety rules

- No destructive action without a verified before-image archive.
- No `DROP TABLE` or `DROP COLUMN` while a code reader/writer remains.
- No uniqueness or `NOT NULL` constraint until the full candidate population is classified.
- No schema addition merely to hold temporary audit state.
- Every unresolved question is documented and blocks the relevant wave until decided.
