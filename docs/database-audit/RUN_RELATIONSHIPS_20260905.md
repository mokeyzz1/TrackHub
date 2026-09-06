# Run and observation relationship review

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

Read-only live inspection on September 5; reproducible queries in `run_relationship_scan.sql`.
No statuses, target IDs, source evidence or canonical results were changed.

## Run lifecycle

1,497 runs: 289 succeeded commits, 176 partial commits, 1,027 succeeded dry runs,
three failed dry runs and two running dry runs. Only the two running rows lack a finish time.
Both are PT Timing dry runs from August 31 with zero observations:
`06f0a782-1648-43b3-ae65-1d9628111037` and `0e4eb796-7a79-49d8-9fb3-0d2232b4f274`.
They are candidates for interrupted-run review, not proven dead solely by age. There is no
claim here that a process-liveness check or automatic abort is implemented.

## Provenance relationships

Across all 156,385 observations: zero source mismatches against their runs (mixed runs allowed),
zero source mismatches against source records, zero individual observations pointing to relay
facts, and zero relay-parent observations pointing to individual facts.

There are 918 historical observation-to-fact meet discrepancies, grouped below. These are
not 918 proven incorrect results. Legacy relay-leg compatibility facts remain individual rows.

| Observed meet → linked fact meet | Entity | Observations | Distinct facts |
|---|---|---:|---:|
| 12683 → 12743 | relay leg | 36 | 36 individual |
| 12743 → 12683 | relay parent | 27 | 9 relay |
| 12773 → 12720 | relay leg | 684 | 684 individual |
| 12773 → 12720 | relay parent | 171 | 171 relay |

12683/12743 are Cougar Invitational records dated April 25. 12773 is “130th Penn Relays”
dated April 25; 12720 is “Penn Relays,” April 23–25. Similar names/dates do not establish
merge authority. All discrepant observations lack historical version hashes; the latest
source payload is not proof of the original run's payload.

Next evidence required: prior reconciliation/source-native meet IDs, exact affected fact IDs,
and the intended distinction between original observation targets and canonical meet mapping.
Do not blindly enforce target-meet equality or rewrite immutable history to silence this scan.
Read-only rollback: none needed. Relationship remediation remains open under MODEL-01/ID-01.
