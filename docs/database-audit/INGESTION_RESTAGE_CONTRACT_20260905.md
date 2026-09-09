# ING-02b: immutable normalized observations within a run

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

The real PostgreSQL regression reproduced silent mixed-version evidence: restaging the same
run/source ID with a new mark updated the shared source payload, but left the old normalized mark
on the observation. The previous upsert changed only decision fields and returned success.

The store now permits a same-run conflict only when all immutable normalized fields match using
NULL-safe row comparison. Exact retries preserve the canonical writer's decision/target instead
of resetting it. Conflicting input causes a transaction rollback, including the source-record
upsert, and an explicit error. A new interpretation requires a new run and appropriate review.
Actual PostgreSQL affected-row counts, not input counts alone, enforce this boundary.

Verification: failing-before/passing-after PostgreSQL regression verifies original normalized mark
and payload survive the rejected restage. Exact restaging after promotion retains the `insert`
decision. All 234 ingestion tests and nine PostgreSQL tests (eight scenarios plus parent) pass.
Tests use the isolated schema-only archived fixture described in ING-02a, not live data.

Scope limitation: shared `source_records.payload` can still change across different runs; immutable
per-run raw-payload snapshots are not yet modeled. Payload-only differences with identical
normalized fields are not rejected by this change. Those cases need a separate schema/provenance
design and migration. No historical payload can be reconstructed from missing evidence by guessing.
This checkpoint does not approve automatic corrections to already-linked public results.

No schema migration or production write was needed. Revert this code checkpoint to undo the
behavior change; no live before-image is required. Previously mixed records are not automatically
repaired by the code. Historical impact remains unmeasured.
