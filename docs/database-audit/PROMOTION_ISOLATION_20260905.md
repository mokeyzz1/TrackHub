# ING-02f: make promotion snapshot semantics explicit

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

Canonical promotion now begins with `BEGIN ISOLATION LEVEL READ COMMITTED`. Its advisory-lock
design requires candidate/source-link SELECTs after the lock wait to see the transaction that just
committed. An inherited repeatable-read snapshot can violate that assumption. This is specific to
this writer's locking protocol, not a claim that weaker isolation is universally preferable.

Live inspection reports a read-committed default today, so this is configuration-change resilience,
not a claim that production currently runs at the wrong isolation level. A real PostgreSQL fixture
connection set to repeatable-read reproduced the mismatch before the change. The fixed writer
explicitly uses read committed and completes its synthetic promotion. All 20 PostgreSQL tests pass
(19 scenarios plus parent), including concurrent duplicates and staging order. The 236-test shared
ingestion command also passes. No global database setting, live row or schema was changed.

Behavior follows [PostgreSQL 17 transaction-isolation documentation](https://www.postgresql.org/docs/17/transaction-iso.html):
read committed takes a new snapshot for each statement, while repeatable read retains a transaction
snapshot. Rollback is reverting this code checkpoint, which would restore reliance on session
defaults. Uncoordinated direct writers and broader workload isolation remain explicit open review.
