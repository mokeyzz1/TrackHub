# Outdoor 2026 4x100 master batch review

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

Date: 2026-09-03  
Scope: `outdoor-2026-4x100-source-reconciliation-v1`  
Status: private audit plus one guarded team-link promotion; no result rows, aliases, or missing
source facts were promoted.

The first reviewed promotion has since been applied separately: migration `899f78a` linked 24
exact-round local relay rows to their already-canonical teams and archived every original row.
The remaining plan below is still private; no missing-result inserts or identity aliases were
promoted.

## Batch outcome

The entire unresolved identity set is now covered in one review boundary: **536 actions, 313
distinct source names, and 78 meets**. The private queue remains unchanged and every action is
still held for review.

Current queue outcomes:

| Outcome | Meets | Source results | Missing | Extra | Broken-team |
|---|---:|---:|---:|---:|---:|
| Matched | 227 | 2,365 | 0 | 0 | 0 |
| Repair-ready | 130 | 1,882 | 402 | 313 | 49 |
| Needs review | 88 | 2,028 | 292 | 147 | 164 |
| Not contested | 37 | 0 | 0 | 0 | 0 |
| Blocked | 265 | 0 | 0 | 0 | 0 |

Identity-family triage of all 536 unresolved source-team actions (labels are counted per
meet/context where the same display name can legitimately recur):

| Family | Labels/contexts | Actions | Handling |
|---|---:|---:|---|
| Drake scholastic (non-MS) | 135 | 203 | Hold as source schools/squads; verify campus and division |
| Middle school | 43 | 78 | Keep separate from high-school and college identities |
| Club/open | 38 | 58 | Keep separate from varsity college teams |
| College/community college | 36 | 50 | Verify canonical school before promotion |
| Country/international | 10 | 16 | Preserve as open/national entries, not schools |
| Alumni/unattached | 4 | 5 | Preserve status; do not attach to current varsity |
| Other/ambiguous | 80 | 126 | Requires source-page and campus evidence |

The family totals sum to all 536 unresolved actions. They are triage buckets, not automatic
mapping approvals.

## 2026-09-10 targeted recovery checkpoint

The owner resumed the narrow Outdoor 2026 4x100 recovery while leaving the broader historical
relay/UI migration postponed. Discovery was consolidated into this supported private workflow;
the unfinished `--missing-4x100` mode in the legacy public-link matcher was not retained.

All 265 blocked meets were checked against the cached TFRRS catalog and live candidate pages.
Candidates had to pass name and date verification and one-page/one-meet ownership checks. The
result was 101 privately staged candidates, 38 page-verification rejections, 26 ambiguous names,
91 with no candidate, four local multi-claims, and five URLs already owned by another meet. The
101 staged candidates have fingerprint `a5acc3564b4e06207ec9de557ee66450`.

The source-vs-local audit processed all 101 staged candidates: 27 matched, 56 became repair-ready,
and 18 require review. The current full private queue is:

| Outcome | Meets | Source results | Missing | Extra | Broken-team |
|---|---:|---:|---:|---:|---:|
| Matched | 254 | 2,584 | 0 | 0 | 0 |
| Repair-ready | 186 | 2,537 | 563 | 482 | 78 |
| Needs review | 106 | 2,311 | 361 | 220 | 202 |
| Not contested | 37 | 0 | 0 | 0 | 0 |
| Blocked | 164 | 0 | 0 | 0 | 0 |

No public meet, result, relay, athlete, team, or alias row changed. Public promotion still needs
before-images, exact affected-ID assertions, a rollback rehearsal, and explicit review of held
identity cases.

## Review packets

- [Overall unresolved source-team profile](OUTDOOR_2026_4X100_UNRESOLVED_TEAM_REVIEW_20260903.md)
- [Drake scholastic structure](OUTDOOR_2026_4X100_DRAKE_SCHOLASTIC_STRUCTURE_REVIEW_20260903.md)
- [Florida Relays scholastic/open identities](OUTDOOR_2026_4X100_FLORIDA_RELAYS_SOURCE_REVIEW_20260903.md)
- [Other scholastic source identities](OUTDOOR_2026_4X100_SCHOLASTIC_SOURCE_REVIEW_20260903.md)
- [Non-Drake identity-type triage](OUTDOOR_2026_4X100_NON_DRAKE_IDENTITY_TYPE_REVIEW_20260903.md)
- [Club identity review](OUTDOOR_2026_4X100_CLUB_IDENTITY_REVIEW_20260903.md)
- [Explicit club queue](OUTDOOR_2026_4X100_EXPLICIT_CLUB_QUEUE_20260903.md)
- [Catalog hold review](OUTDOOR_2026_4X100_CATALOG_HOLD_REVIEW_20260903.md)
- [Rollback for the applied 24 team links](rollback_reviewed_4x100_team_links.sql)

## Safety decision

Do not add a new table, bulk alias migration, or generic source-name mapping. The existing
private queue is sufficient for the batch plan. Further promotion should be a reviewed,
transactional operation limited to identities with verified source keys, canonical campus,
gender, and division. Ambiguous names, middle-school records, open/international relays, and
club identities stay private until the application’s school/team model explicitly supports them.
