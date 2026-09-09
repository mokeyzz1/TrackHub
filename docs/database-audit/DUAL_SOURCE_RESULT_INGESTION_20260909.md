# Dual-source canonical result ingestion — 2026-09-09

> Supporting evidence for `ING-03` in the [database master checklist](MASTER_CHECKLIST.md).

## Completed contract

- Completed meets run every stored TFRRS and Athletic.net result source in deterministic order.
- Both providers normalize into the same private observation and canonical-fact writer.
- Matching observations link to one result; unique observations may add one result.
- A known represented-team disagreement is quarantined and cannot relabel the canonical fact.
- A named but unresolved team is quarantined instead of publishing a teamless collegiate result.
- Meet status counts both new and already-linked facts; `results_source` is derived from source links
  and becomes `mixed` when more than one provider backs the meet.

## Preservation and verification

Migration `20260909041600_allow_mixed_result_sources` only expands the existing check constraint and
changes its column comment. It rewrites no result, relay, athlete, team, or meet row. Its exact
rollback refuses to erase a real `mixed` state. Forward/rollback/forward rehearsal passed, the
migration was applied atomically, and the live ledger contains it once.

Verification: 267 ingestion tests, three workflow-safety tests, and the PostgreSQL 17 isolated
suite passed (26 ingestion contracts plus affiliation, collegiate-history, and roster-evidence
contracts). The integration test proves one cross-provider fact has two source links and proves a
team conflict remains private.

## Explicit boundary

No historical result audit or repair ran in this checkpoint. The scheduled workflow change is in
the branch but is not deployed until the branch is published. Structured enrichment (Q/q, splits,
and provider annotations) and deterministic historical repair remain later checklist work.
