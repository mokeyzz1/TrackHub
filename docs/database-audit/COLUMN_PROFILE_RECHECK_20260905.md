# Application-column profile recheck

The repaired `quality_scan.sql` completed against live data in approximately 20 seconds with a
90-second statement timeout. Only session-local temporary metric storage was created; no
permanent table, result or source row was changed. Saved aggregate evidence:
`column_profile_20260905.json`. No user-level values are included.

Coverage: all 359 ordinary-table columns across 31 public/ingest tables. Automated comparison
against the object register proves exact coverage of this scope with no duplicate metric rows.
The 45 view columns, archive schemas and managed platform schemas are not included in this
profile. Each table's counts are exact as read; this is not a transaction-wide consistent
snapshot across all tables and does not establish distinctness or semantic correctness.

## Findings and preservation decisions

- 23 columns in nonempty tables are entirely NULL. Keep them pending purpose/consumer review;
  absence of values does not mean absence of purpose. Athlete profile fields and deferred live
  features are among them. This is a review signal, not a high-confidence deletion finding.
- All 156,385 historical observation snapshot hashes are NULL and the newly added version
  table is empty. The branch's new ingestion path has not been run against production. Never
  backfill unknown historical versions from the latest payload.
- All 1,497 run code revisions are NULL: high-confidence reproducibility gap, not missing
  performance data. Preserve runs; verify build-ID capture on future worker deployment.
- `year_in_school` has 11,920 empty strings out of 127,357 affiliation rows (9.36%);
  athlete `class_year` has 11,746 out of 151,537 rows (7.75%). One of 12,978 meet locations is
  empty. Normalization requires reader/writer review; do not replace unknown class years by guesses.
- Results contain 3,419,178 rows; 562,033 lack a meet ID (16.44%) and 401,563 lack a team ID
  (11.74%). Missing attribution is not an orphan FK and must not be guessed from names. Source
  identity/coverage review remains the route to repairs.

No trend is inferred from this single recheck. No all-null column was removed and no empty
string normalized. Next: attach purpose/consumer decisions to individual columns, prioritize
identity-linked attribution and ingestion reproducibility, then expand profiling coverage.
The data-quality skill informed these grain, confidence and preservation limits. Rollback is
not needed for read-only metric capture; the saved aggregate report can be regenerated.
