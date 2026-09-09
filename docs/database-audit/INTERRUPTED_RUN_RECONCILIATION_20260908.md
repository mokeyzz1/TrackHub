# Interrupted-run reconciliation

## Scope

`ING-02h` covers two separate concerns: interrupted ingestion-run metadata and historical
observation-to-canonical-meet discrepancies. This checkpoint addresses only the first concern;
it does not rewrite observations, source evidence, meets, results or relays.

The September 8 live recheck found exactly the two candidates recorded in
`RUN_RELATIONSHIPS_20260905.md`:

- `06f0a782-1648-43b3-ae65-1d9628111037`
- `0e4eb796-7a79-49d8-9fb3-0d2232b4f274`

Both are PT Timing `dry_run` rows started August 31, remain `running`, have no `finished_at`,
have zero `ingest.observations`, and are not referenced by `ingest.recovery_queue`. Their scopes
report 189 source observations, but that is importer-reported metadata—not staged evidence—and
the empty observation boundary is why they are eligible for this metadata-only reconciliation.
The exact before-image is preserved in
`interrupted_run_reconciliation_before_20260908.json`.

## Guarded command

`reconcile_interrupted_runs.js` accepts one or more explicit UUIDs only. It defaults to a
read-only transaction and prints an eligibility plan. A commit requires `--commit` plus an
operator name and refuses the entire request if any selected run is missing, not a dry run, not
`running`, younger than the threshold, has observations, or is referenced by the recovery queue.
The default age threshold is 24 hours and is a review guard, not a batch selector.

The reviewed reconciliation was applied on September 9, 2026 (UTC) with operator tag
`codex-ing-02h-review`. Both rows now have `status = 'aborted'`, a finish time, the
`interrupted_run_reconciled:codex-ing-02h-review` marker, and a structured reconciliation
record in `metrics`. A postcondition query confirmed zero observations and zero queue references
for both rows.

For reproducibility, the approved metadata-only command was:

```sh
node scrapers/recovery/reconcile_interrupted_runs.js \
  --run-id 06f0a782-1648-43b3-ae65-1d9628111037 \
  --run-id 0e4eb796-7a79-49d8-9fb3-0d2232b4f274 \
  --operator <reviewer> --commit
```

The update changes only `ingest.runs.status` to `aborted`, sets `finished_at`, appends a
reconciliation marker to `error_message`, and records operator/reason/count metadata in the
existing `metrics` JSON. It does not touch public facts or create a table/migration. The
transaction is all-or-none and locks the selected run rows before rereading counts. A dry run
rolls back; a commit path requires exact `RETURNING` row-count assertions.

## Historical discrepancy hold

The 918 observed-meet/canonical-meet discrepancies remain held. They are not proven incorrect
facts, and all lack historical source-version hashes. The mutable latest source payload cannot
reconstruct the original observation. They require source-native meet IDs and exact affected fact
review before any correction; no target-meet equality constraint or historical rewrite is part of
this checkpoint.

## Verification and rollback

The focused tests prove UUID/operator gating, dry-run rollback, all-or-none eligibility, lock-mode
selection and the exact metadata update. The before-image permits a reviewed inverse update of
the two run rows if the owner later rejects the reconciliation. No public result or relay rollback
is needed because none is written by this operation.
