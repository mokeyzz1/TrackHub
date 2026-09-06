# Recent migration filename alignment

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

MIG-01a is complete. MIG-01 as a whole remains open.

Full SQL diffs against the live ledger showed only three explanatory comment blocks omitted
from production; executable SQL is unchanged. Local file contents are unchanged by these moves:

| Name | Previous local version | Recorded live version / new local version |
|---|---|---|
| repair_source_backed_relay_athlete_links | 20260904210000 | 20260904220438 |
| harden_trigger_helper_execute_acl | 20260904230000 | 20260904221054 |

Verification: `git diff --summary` identifies 100% identical renames. The destination versions
were read directly from the live ledger and are unique in the local directory. No SQL executed,
no live ledger entries changed, and no data backup was needed. Rollback: restore the two old local
filenames; this does not undo their already-applied database changes. This alignment does not
certify the semantic correctness of the earlier relay repair; ID-01 still reviews its evidence.

The read-only full inventory before these moves found 124 local SQL files (including one unrelated
untracked file), 85 live entries, eight duplicate local version prefixes, and two live names absent
locally. Nineteen local files exactly matched live SQL bytes; 64 had a matching name requiring
further comparison; 41 had no matching name. Hash mismatches alone are not SQL differences.
`migration_inventory_20260905.json` is a dated pre-alignment snapshot, not a replay manifest.

Do not run an indiscriminate database push against this directory. The remaining entries require
statement-level reconciliation and a clean deployment/baseline test under MIG-01.
