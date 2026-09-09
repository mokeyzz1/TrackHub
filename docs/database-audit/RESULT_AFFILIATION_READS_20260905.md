# Historical result affiliation reads

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

The two public performance functions now resolve school/division through `results.team_id` →
`teams.school_id`, preserving NULL when a result has no represented team. They no longer attribute
historical performances to `athletes.school_id`, which is a current/legacy person field.

This is a read-path correction only: no result, athlete, team, or school rows changed. The live
before-image was guarded by exact function-definition hashes; the migration applied as
`20260905230428` with one statement. Function ACLs, invoker security, search path, and signatures
are unchanged. A rollback file restores the exact prior definitions.

The isolated PostgreSQL checkpoint passed five tests: exact rollback equivalence, transfer
attribution, unknown-affiliation preservation, division filtering, role behavior for postgres/
anon/authenticated, unchanged result rows, and unchanged athlete school. The existing 25-test
database suite also passed. A live sample confirmed a transferred result is attributed to its
represented school. Security advisors remain unchanged at 13 findings.

Missing `team_id` remains unknown; it is not guessed from roster history or current school. This
checkpoint does not backfill data, change athlete profiles, alter scoring, or change relay tables.
