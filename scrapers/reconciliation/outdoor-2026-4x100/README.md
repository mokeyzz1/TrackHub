# Outdoor 2026 4x100 reconciliation

This folder is the only supported workflow for auditing and planning repairs to Outdoor 2026
4x100 results from TFRRS. It does not call the legacy recovery worker, Athletic.net, timing-system
adapters, or TrackScoreboard.

The workflow uses the existing private `ingest.event_recovery_queue` for meet/event identity,
leasing, retries, and scope isolation. Reconciliation-specific source-vs-local reports and
planned actions are stored under that queue row's `source_candidates.reconciliation` object; it
does not maintain a second job table.

The workflow distinguishes:

- a TFRRS event whose source and local facts match;
- a source-verified meet where 4x100 was not contested;
- missing TFRRS rows;
- extra or conflicting local rows;
- local relay rows with a broken team identity;
- unresolved TFRRS team identities;
- combined-event child records that require a verified canonical parent;
- standalone multi-event meets and preliminary meet records.

DNS, DNF, FS, DQ, SCR, NT, and the other mapped mark codes are valid results. They participate in
source comparison and are never treated as absent data.

## Commands

```bash
# One read-only truth check. No private or public rows are written.
node scrapers/reconciliation/outdoor-2026-4x100/cli.js audit --meet 12810

# Populate the dedicated private queue after its migration is applied. Every in-range season meet
# is represented; meets without a TFRRS URL are recorded as blocked rather than omitted.
node scrapers/reconciliation/outdoor-2026-4x100/cli.js prepare

# Verify cached TFRRS candidates for blocked meets without changing any database row.
node scrapers/reconciliation/outdoor-2026-4x100/cli.js discover

# Stage only page/date-verified candidates in the existing private queue. Jobs remain blocked and
# public meets.tfrrs_url is not changed.
node scrapers/reconciliation/outdoor-2026-4x100/cli.js discover --stage

# Continuously audit queued meets and save a private repair plan. Public facts remain unchanged.
node scrapers/reconciliation/outdoor-2026-4x100/cli.js run --max-jobs 0

# Explicitly audit only the privately staged, page/date-verified candidates.
node scrapers/reconciliation/outdoor-2026-4x100/cli.js run --staged --max-jobs 0

# Re-audit already-finished staged candidates after a private catalog/resolver change.
node scrapers/reconciliation/outdoor-2026-4x100/cli.js run --recheck-staged --max-jobs 0

# Re-audit all finished needs_review rows after a private catalog/resolver change.
node scrapers/reconciliation/outdoor-2026-4x100/cli.js run --recheck-needs-review --max-jobs 0

# Explicitly refresh one already-reviewed meet after a verified parser/source correction.
node scrapers/reconciliation/outdoor-2026-4x100/cli.js run --recheck-needs-review --force-recheck --meet 12771 --max-jobs 1

# Show outcomes.
node scrapers/reconciliation/outdoor-2026-4x100/cli.js summary
```

The first version deliberately has no public `apply` command. Public promotion will be added only
after the MIAA truth case, no-event cases, combined-event relationships, status-only results, and
the full season dry run all pass review.
