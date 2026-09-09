# ING-02c: historical source-recovery decision — 2026-09-08

> Final scope decision for the [database master checklist](MASTER_CHECKLIST.md). This is a
> read-only decision; no historical fact or evidence row was rewritten.

The source-version migration deliberately did not backfill old observations. The live read-only
audit on 2026-09-08 found no open `source_correction_required` quarantines and no eligible
snapshot-backed correction. The legacy observation workload has `source_snapshot_hash IS NULL`;
its current `ingest.source_records.payload` is a mutable latest payload and is not evidence of
what an earlier run consumed.

The 918 observation-to-canonical-meet discrepancies measured in
`RUN_RELATIONSHIPS_20260905.md` therefore remain explicitly held. They are not automatically
reconstructed, relinked, or marked resolved. Existing observations, source links, canonical facts,
and before-image archives remain preserved.

Future recovery path:

1. obtain a new source scrape or durable source snapshot;
2. stage it through the controlled adapter, producing a new immutable version;
3. review any changed linked facts with `SOURCE_CORRECTION_WORKFLOW_20260908.md`; and
4. apply only exact, source-backed corrections with an operation key and before-image.

If no source evidence can be recovered, the discrepancy remains a documented non-repairable
historical hold. Interrupted-run semantics and these held discrepancies continue under ING-02h;
they are not a reason to weaken the source-version contract.
