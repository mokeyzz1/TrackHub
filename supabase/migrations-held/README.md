# Held migration history — do not automatically execute

These 39 tracked files were preserved byte-for-byte outside the automatic `supabase/migrations`
directory. They have no matching production ledger entry, and include superseded drafts,
operations whose effects are reported or evidenced already, and unapplied repairs. Moving them
does not declare them applied, abandoned, or safe to run. The manifest records every source path,
hash, disposition, evidence and required follow-up. Git retains their full history.

The unrelated untracked LAI alias migration was intentionally left in its existing location.
It must be reviewed before any deployment; the preflight rejects unknown active SQL.

To resume an item: inspect current state, define the remaining intended delta, preserve before-
images, test forward/rollback behavior, and generate a fresh migration through the CLI. Do not
copy a historical cleanup blindly into the deployment queue. For a path-only rollback of this
checkpoint, move each file back to its manifest `from` path; no database action is required.

The old `apply_reviewed_4x100_team_links` pending label was stale: live checks on 2026-09-05 found
24 full before-images and 24 surviving linked parents. Its exact ledger provenance remains
unresolved, so it is held instead of replayed. No new relay repair was performed.
