# ING-02c: explicit source-correction workflow — 2026-09-08

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md). This is an
> operator workflow design and isolated implementation; no production correction was applied.

## Contract

`apply_source_correction.js` reuses the existing private control-plane records. It requires:

1. one `ingest.observations` row whose decision is `quarantine`;
2. an open `ingest.quarantine` row with reason `source_correction_required`;
3. a non-null observation snapshot whose `(source_record_id, source_snapshot_hash)` exists in
   immutable `ingest.source_record_versions`;
4. exactly one existing `ingest.source_links` target; and
5. an explicit `--operation-key`; `--dry-run` previews the exact plan and `--commit` is required
   for the applying invocation.

The command locks the review and canonical target in a `READ COMMITTED` transaction, refuses a
reused operation key, inserts the complete canonical before-image into the existing
`ingest.fact_cleanup_archive`, updates only the changed supported fact fields, marks the
observation `claim` with reason `source_correction_applied`, and resolves the quarantine with the
operator/operation note. A failed target assertion rolls back the archive and every update.

The supported first slice is an individual result or relay parent with changes to meet, event,
mark, place, date, or explicitly resolved team. Athlete identity changes, entity-kind changes,
relay-leg corrections, and lineup changes are rejected; they need identity/participation review,
not a generic fact update. No new table or migration was added.

## Why this is safe

- It never inserts a replacement fact or deletes the old fact.
- The private before-image archive is keyed by operation, table, and primary key and can restore the
  exact previous row with the existing archive conventions.
- Immutable evidence and the original observation remain available after resolution.
- `source_links` continues to point to the same canonical fact, so downstream readers do not see a
  second row for the correction.
- The command is not callable by the public API; it requires the private ingestion connection.

## Verification

`apply_source_correction.test.js` covers argument/commit gating, immutable-snapshot and open-
quarantine validation, unsupported identity/relay-lineup changes, successful archive/update/
resolution ordering, and transaction rollback when the canonical update assertion fails. The
tests use a fake PostgreSQL client and do not connect to Supabase or mutate live data.

## Remaining boundary

This closes the missing operator apply mechanism for snapshot-backed corrections, not historical
recovery. Legacy observations without snapshots and the measured 918 observation-to-canonical-meet
discrepancies remain held. They require a source-backed evidence review or an explicit reject,
never reconstruction from the mutable latest `source_records.payload`.

Example:

```sh
INGEST_DATABASE_URL='postgresql://…' node scrapers/recovery/apply_source_correction.js \
  --observation-id 123 --operation-key correction_20260908_001 --dry-run

# only after reviewing that plan:
INGEST_DATABASE_URL='postgresql://…' node scrapers/recovery/apply_source_correction.js \
  --observation-id 123 --operation-key correction_20260908_001 \
  --operator 'reviewer' --commit
```
