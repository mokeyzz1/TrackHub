# Invalid history-claim review — 2026-09-02

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

## Decision

Thirty legacy history rows were incorrectly claimed by newer meet observations before the
history-date guard was hardened on 2026-08-29. These are not duplicate rows to delete. Each
affected row currently combines two distinct performances:

- the existing `public.results` row retains the older performance's date, meet name, place, and
  sometimes team/round formatting;
- its linked `ingest.source_records` payload and claim observation describe a newer performance
  at the meet now stored in `results.meet_id`.

The preservation-safe repair is to split each collision into two facts: return the historical row
to its original unlinked state and insert the newer source-backed result from the observation.

## Scope proof

The review begins from every observation with:

```text
decision = claim
decision_reason = unlinked_history_exact_match
canonical_result_id IS NOT NULL
```

The restored baseline contains exactly:

| Evidence | Count |
|---|---:|
| Affected historical result rows | 30 |
| Distinct linked source records | 30 |
| Source links | 30 |
| Referencing observations | 62 |
| Original claim observations | 30 |
| Existing canonical conflicts for the replacement facts | 0 |

All 30 claims occurred from 2026-08-20 through 2026-08-29 08:51 EDT, before commit `bb77232`
(`require dated history before result claims`) at 09:40 EDT. All 30 canonical rows disagree with
their source observation on historical versus target meet identity; 25 also differ on place, 26
on round, 18 on team, and 6 on mark presentation.

The original integrity detector exposed only 10 because those rows have both a historical date and
a dated linked meet. The other 20 historical rows have a NULL date, so the date-difference query
could not see them even though their historical meet names still conflict with the source meet.

## Root cause

The pre-fix matcher allowed a `null` date-distance result through the JavaScript comparison
`null <= 7`. That could happen for an undated legacy row and for date values the old parser could
not normalize. A same-athlete/event/mark collision could therefore claim an unrelated history row.

The current matcher explicitly requires a non-NULL distance no greater than seven days. Its shared
matcher and ingestion-contract suite passes all 20 tests, including rejection of undated and distant
history rows.

## Proposed repair

`supabase/migrations/20260902100000_split_invalid_history_claims.sql` is a guarded, replay-safe
repair proposal. It is not applied to the live database.

The proposal:

1. Requires the exact reviewed set of 30 result IDs and one distinct source link per row.
2. Refuses to run if provenance counts, claim decisions, meet links, or replacement conflicts drift.
3. Archives 30 results, 30 source links, and 62 observations (122 rows total) in the existing
   `ingest.fact_cleanup_archive` under operation key
   `20260902_split_invalid_history_claims`.
4. Sets only the historical rows' incorrectly claimed `meet_id` values back to NULL.
5. Inserts 30 current-meet results from their normalized observations and stored source payloads.
6. Moves each source link and all 62 related observations to its new current-meet result.
7. Reclassifies the 30 original claim observations as repaired inserts while preserving the old
   versions in the cleanup archive.

No table, policy, column, or public API is created. Exact historical meet enrichment is deferred:
nine dated rows have a strong same-name/same-date candidate meet, but restoring the original
unlinked state first avoids mixing defect repair with a separate identity decision.

## Transactional validation

The proposal was executed inside a transaction against the isolated restored PostgreSQL 17 copy.
Before rollback, validation showed:

| Check | Result |
|---|---:|
| Total results | 3,507,248 (original 3,507,218 + 30 preserved splits) |
| Historical rows returned to unlinked state | 30 |
| Archived pre-change rows | 122 |
| Reclassified claim observations | 30 |
| Result/meet date mismatches remaining | 0 |

The transaction was then rolled back. The local database returned to exactly 3,507,218 results,
zero rows under the proposed operation key, and all 30 original claim observations. The live
Supabase database remains unchanged.

The companion `rollback_invalid_history_claim_split.sql` restores the archived links,
observations, and historical meet assignments and removes only the inserted split rows if an
approved live application ever needs to be reversed.
