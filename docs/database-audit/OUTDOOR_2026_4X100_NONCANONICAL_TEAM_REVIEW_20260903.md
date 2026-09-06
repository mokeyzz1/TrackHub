# Outdoor 2026 4×100 non-canonical team review

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

Generated 2026-09-03 from the private reconciliation queue. This is a review packet only; it
does not update `public.relay_results` or `public.teams`.

## Held candidate

| Meet | Meet ID | Local relay ID | Local mark | Source team | Proposed team ID | Source round |
|---|---:|---:|---|---|---:|---|
| Larry Byerly Invitational | 12502 | 234341 | 50.10a | Clark College | 2408 | Finals |

The lineup, mark, and round match exactly, and the relay has four valid legs. The proposal is held
because team `2408` (`Clark`, gender F, TFRRS key `Clark_College`) is currently inactive. The
existing `ingest.team_aliases` row for the exact source key is already verified, so this is not a
name-resolution problem.

Reactivating or replacing that team is a broader identity decision: team `2408` is referenced by
253 public individual results and 6 public relay results. No relay-only update should bypass that
decision.

The guarded proposal remains in
[`outdoor_2026_4x100_team_link_plan.sql`](</Users/mk/Projects/track-meet-tracker/docs/database-audit/outdoor_2026_4x100_team_link_plan.sql>),
but it must stay held until the team identity is reviewed.
