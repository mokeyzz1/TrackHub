# Event measurement domain

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

Migration `20260905201510_enforce_event_measure_domain.sql` constrains the existing
`event_types.measure` column to time, distance, points or explicit unknown, and disallows NULL.
No new table, scoring calculation, reclassification or performance rewrite is involved.
The resolver and ingestion contract already distinguish these measurement kinds.
Unknown remains explicit so unresolved classifications can remain held for review.

## Evidence and preservation

Before: 67 catalog rows (54 time, nine distance, three points, one unknown), zero invalid or
NULL values. The column was nullable and the named check absent. Before and after full-row
ordered JSON digest: `4728d90d26185096daf14b272850bb13`. All 67 rows are unchanged.
After: NOT NULL true; `event_types_measure_check` validated. Lock timeout five seconds and
statement timeout 60 seconds bound the targeted DDL. Existing schema backups are retained.

All 25 disposable PostgreSQL tests pass, including a transaction that verifies row preservation,
all four accepted kinds, NULL rejection (23502), invalid/empty kind rejection (23514), and
rollback of the schema restrictions. No synthetic test row was inserted into production.
Live ledger contains one SQL statement-array element whose MD5 matches the local file:
`69f1e9c189cb4a538daa932db0e4402d`. SHA-256 and lexical fingerprint are in the approved manifest.
Security advisors remain 13 findings: 11 intentional private-ingest no-policy informational
notices and the two existing public push-registration definer warnings; no new findings.

## Rollback and boundaries

If a demonstrated regression requires rollback, in a bounded transaction drop only
`event_types_measure_check` and run `ALTER TABLE public.event_types ALTER COLUMN measure DROP NOT NULL`.
This restores the prior permissiveness without deleting rows. The rollback was tested locally.
The CHECK alone does not reject NULL; this is why NOT NULL is separate, as documented in
[PostgreSQL constraints](https://www.postgresql.org/docs/17/ddl-constraints.html).

This checkpoint does not certify category/environment labels, event identities or all catalog
consumers. Those remain MODEL-01 review items. The data-quality workflow kept measured domain
coverage separate from semantic correctness; it did not infer classifications from marks.
