# MIG-01c: statement-aware history restoration

Completed repository-only checkpoint. No SQL executed against production.

The earlier comparator joined the live ledger's statements array using only newlines. Several
CLI-recorded statements omit terminators, producing false differences. The comparator now
preserves array boundaries and adds missing terminator tokens. Quoted values and function bodies
remain unchanged. Tests cover missing/present terminators and trailing comments.

Four actual historical rewrites were restored to the SQL recorded for their own versions:

| Version | Difference in edited local history | Subsequent correction preserved |
|---|---|---|
| 20260829224504 | Source merging and usable-source conditions were inserted into the original queue definition; it contained two ELSE branches | 20260830023000, then 20260830024500 |
| 20260830023000 | Usable-source logic was backported into the source-preservation migration | 20260830024500 |
| 20260831090000 | Queued-attempt cap was backported into the older retry function | 20260831164109 |
| 20260831162736 | Corrected URL regex was backported into the original routing migration | 20260831163739 |

These restored historical files must run only in their full ordered history, never individually
against production. The running corrected functions were not replaced. Recovery manifests store
before-file hashes and ledger fingerprints; regression tests also pin the subsequent correction
files to unchanged bytes. Git preserves the complete previous file contents.

Recovered `20260810125242_20260810_map_remaining_event_aliases.sql` from its already-existing live
ledger entry. This is restoration of a missing historical file, not a new migration or data repair.

Current comparison: 125 local files, 85 live ledger entries; 84 lexical matches, one manually
verified comment-only difference (the relay-link repair, covered by MIG-01a), and 40 files without
a ledger match. One of those 40 is the unrelated untracked LAI alias file; it remains untouched.
The previous comparison snapshot is historical evidence, not the current pending-work count.

Verification: 13 tests pass across reconciliation and master-checklist suites; `git diff --check`
passes. This proves the stated file/fingerprint contracts, not a complete deployment replay.
Rollback: revert this checkpoint's repository changes. No live backup is necessary because no
live mutation occurred. MIG-01 remains open for the 40 unmatched files and deployment testing.
