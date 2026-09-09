# Preservation gate recheck — 2026-09-05

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

SAFE-01 is complete for the baseline-availability gate, not a claim of a fresh production backup.

- Owner-schema dump SHA-256 still matches `4cf900535e1558928926ef9a0855d0cfb89e45e9c178bd5728f6712155ef3de8`.
- Full dump SHA-256 still matches `43347b410e323ab224f523b69ee4924be9f5f64294a41ef1b3483568f8f0f7bd`.
- PostgreSQL 17 `pg_restore --list` successfully reads both archives.
- The isolated restore directory remains present. Prior actual restore verification and its
  scope are documented in `RESTORE-VERIFICATION-20260902.md`; no new restore was performed today.
- This is a September 2 baseline. It cannot roll back every subsequent change by itself.
- Before each live mutation, capture current affected rows and dependent rows as needed, test the
  exact reversal, and record affected IDs. A broader migration needs a fresh appropriate backup.
- Full managed-platform recovery still needs a compatible Supabase environment; the plain
  PostgreSQL owner-schema restore did not prove a complete managed-platform disaster recovery.

No database writes were required for this check. Recovery artifacts remain ignored by git;
only metadata and evidence are committed. No change to undo for this checkpoint.
