# MIG-01d: preserve unverified SQL outside automatic deployment

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

39 tracked local-only SQL files were moved byte-for-byte to `supabase/migrations-held/`.
The manifest records their original paths, hashes, disposition, prior evidence and next action.
This is a deployment-boundary change, not an assertion that every effect is applied or absent.
The 85 recorded migrations remain in the active directory with unique versions. Unknown SQL
must be reviewed and tested before it enters the deployment queue.

The fresh check corrected a stale audit claim: operation `20260903_reviewed_4x100_team_links`
has 24 archived originally-unlinked parent rows; all 24 parents survive with nonnull team IDs.
It is classified as archive evidence present / ledger provenance unresolved, not unapplied.
No before-images were found for `20260902_split_invalid_history_claims`; that repair stays held.
No public or private database rows were modified.

`npm run db:history-preflight -- /path/to/fresh-ledger-export.json` verifies active filenames,
versions, approved local bytes and live statement fingerprints. It rejects missing, duplicate,
edited or unreviewed entries. It does not execute SQL, certify an empty-database replay, or grant
deployment permission. Snapshot approvals must be deliberately extended for reviewed new changes.

18 automated history/coverage tests pass. All 39 moved files match their original SHA-256.
The current worktree preflight intentionally fails on exactly one item: the unrelated untracked
`20260829180000_add_lai_athletic_net_team_aliases.sql`. It was preserved in place and excluded
from this commit. Do not push this worktree until that file is reviewed. Isolated tests and
read-only schema review can continue without executing it.

Rollback: revert this repository checkpoint to restore all paths; no live rollback is needed.
Full migration integration and the baseline for existing pre-migration tables remain MIG-01e.

Workflow reference: Supabase's [local development guide](https://supabase.com/docs/guides/local-development/overview)
describes capturing existing remote schema before deployment and validating migrations locally.
The [backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
distinguishes schema/data restoration from preserving migration history.
