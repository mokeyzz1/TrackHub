# Preserve unmapped-event review evidence on database errors

The resolver previously ignored lookup/insert/update errors and cleared every in-memory miss
after attempting a flush. That could discard review evidence during a database failure.

It now stops on explicit database errors, retains failed and not-yet-attempted entries, and
removes only acknowledged counts. Misses arriving while the request is in flight remain pending.
Existing counts are converted to checked numeric values rather than concatenating strings.

All 250 ingestion tests pass. Three new fault-injection tests verify lookup failure/no write, partial write failure/retry,
and new misses during a numeric increment. These supplement three catalog-loading tests.
This is code-only error handling, not an atomic database counter: concurrent workers can still
lose increments through the existing read/modify/write pattern, and a lost response after a
successful write remains ambiguous. Those require a separate database-level idempotent design.
No live queue entries or canonical results were changed; rollback is reverting this checkpoint.
