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

# Populate the dedicated private queue after its migration is applied.
node scrapers/reconciliation/outdoor-2026-4x100/cli.js prepare

# Continuously audit queued meets and save a private repair plan. Public facts remain unchanged.
node scrapers/reconciliation/outdoor-2026-4x100/cli.js run --max-jobs 0

# Show outcomes.
node scrapers/reconciliation/outdoor-2026-4x100/cli.js summary
```

The first version deliberately has no public `apply` command. Public promotion will be added only
after the MIAA truth case, no-event cases, combined-event relationships, status-only results, and
the full season dry run all pass review.
