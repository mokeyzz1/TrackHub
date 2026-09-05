# ING-02g: truthful orchestration error reporting

The controlled ingestion orchestrator previously attempted to mark a run failed even when its
canonical writer had returned successfully and only the status UPDATE failed. A failed error
report could also replace the original exception. Run creation occurred outside the cleanup
boundary, so a creation failure bypassed owned-store closure.

The code now distinguishes completed work from status reporting. A reporting failure after
successful staging/promotion is surfaced with its cause, run ID, metrics and committed flag;
it does not attempt to relabel that completed work failed. Work failures are still reported
failed when possible. Dual reporting/cleanup failures retain both exceptions and the original
cause. Run creation is covered by owned-store cleanup; borrowed stores remain caller-owned.

Verification: six focused orchestration tests and all 241 ingestion tests pass. These are
fault-injection unit tests, not a claim of a production outage recovery exercise. No live rows,
schema or configuration changed. Revert this code checkpoint for rollback; no data backup is
needed for this code-only change.

Open: hard process termination can still leave a run running. A lost COMMIT response can leave
its outcome uncertain. Atomic run finalization, reconciliation of interrupted runs, direct
writer coverage and operator recovery remain under ING-02; this does not claim to solve them.
