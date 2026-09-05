# MIG-01b: verified history alignment

Completed scope: reusable read-only comparison, 27 content-preserving filename alignments,
and restoration of one historical migration to its own ledger SQL. No production mutation.

The comparison covers all 124 current SQL files, including the unrelated untracked file, against
85 live ledger entries. It preserves string literals, quoted identifiers and dollar-quoted bodies
while ignoring outer comments/spacing. It is deliberately conservative; lexical equality is
not deployment authorization. Raw production SQL exports remain outside the repository.

The initial comparison found 51 lexical matches, 33 matching names requiring SQL review, and
40 files without a lexical/name match. `migration_comparison_20260905.json` records that
pre-alignment evidence. Of 28 mismatched filenames, 27 were unambiguous moves to the recorded
live name/version. `migration_filename_moves_20260905.json` records every old/new path and
original SHA-256; automated tests prove their SQL bytes did not change.

The remaining case was a rewritten historical file: `20260821115738_recompute_open_recovery_quarantines.sql`
contained the SQL from the later `20260821115931_fix_recovery_queue_source_regex.sql` migration.
The former was restored to the original ledger SQL, including its historical regex defect;
the latter remains the corrective migration. Both now match their own recorded fingerprints.
Do not apply the earlier migration alone to production. This is history reconstruction, not a
request to restore the old defect to the running database.

Verification: eight reconciliation tests and two master-register tests pass. Git checks show
27 byte-identical moves; the remaining historical edit is tested against its recorded ledger
fingerprint. No data backup is needed for repository-only changes. Rollback is reverting this
checkpoint, which restores previous filenames/content without affecting database state.

MIG-01 remains open: same-name differences, local-only migrations, remaining duplicate version
prefixes and the deployment/baseline integration test still require resolution. No migration
push or ledger repair is authorized by this comparison output.

Reproduce: export `version,name,statements` read-only from the live ledger to a private local JSON
file, then run `node docs/database-audit/reconcile_migrations.js /absolute/path/to/export.json`.
The tool only reads files and prints a report; it never connects to a database or writes SQL.
