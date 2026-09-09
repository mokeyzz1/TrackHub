# Meet source-ownership candidate review — 2026-09-04

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

This read-only pass joins the existing private `ingest.source_links` records to the canonical meet
parents in each known collision group. It measures current promotion/lineage, not an automatic truth
judgment: an unlinked source record is not evidence that a meet has no source data, and a linked row
is not permission to delete another parent. No production rows or schema objects were changed.

## Ownership evidence

| Candidate | Canonical target with links | Current source evidence | Safe interpretation |
| --- | --- | --- | --- |
| AthleticLIVE `66223` | Meet 12914 (Bill Kincaid Invitational) | 5 linked TFRRS source records; meet 12747 has none | Current promoted lineage favors 12914, while the live page currently names Jenna Strong; keep both parents |
| AthleticLIVE `67952` | Neither 12620 nor 12587 | No linked source records | Page-level two-day identity is informative, but no canonical reassignment is supported |
| AthleticLIVE `70965` | Meet 12937 (Marauders Tune-Up) | 20 linked Athletic.net source records; meet 12936 has none | Current promoted lineage and page identity favor 12937; keep 12936 until its facts are source-mapped |
| Athletic.net `639904` | Neither 11911 nor 11912 | No linked source records | The page is explicitly combined-events; retain the parent-mapping hold |
| Athletic.net `651507` / Grubbys name-date | Meet 12325 / 12472 split by source | 11 Athletic.net links to 12325 and 11 TFRRS links to 12472 | Two source lineages describe one duplicate candidate; union/survivor work must preserve both paths |
| TFRRS `96401` | Meet 12632 (Bauer Open, Apr. 15) | 21 linked TFRRS records; meet 12562 has none; 3 of 24 source records are currently unlinked/untyped | Linked lineage favors 12632, but the three unlinked records remain preserved review evidence |

The remaining TFRRS URL groups and the South Coast name/date pair have no private source links in
the current control plane. Their source-page snapshots and canonical fact-set fingerprints remain
the only evidence, so they stay held.

## Why this does not justify a new table

The existing `source_records`, `source_links`, `observations`, `quarantine`, and cleanup archive
already provide the required raw payload, promotion status, canonical target, review state, and
before-image boundary. A separate meet-alias table would duplicate a contract that has not yet been
defined and could make a reused URL look unique. The next design artifact should be a reversible,
source-aware mapping built from these existing surfaces—not a live schema addition.

## Disposition

Keep all collision parents and all unlinked source evidence. Do not reassign facts, merge meets, add
URL uniqueness, or mark the three `96401` records complete. A future repair plan may use the linked
lineage as one input, but must also compare source payloads, dates, event keys, and relay/individual
coverage and must archive every before-image before a write.

The reproducible queries are in `meet_source_ownership_scan.sql`.
