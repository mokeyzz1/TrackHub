# Public view contracts — 2026-09-05

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

Live definitions inspected for all four public views. Repository search covered tracked-source
JavaScript and TypeScript outside dependencies and generated scraper logs. No live changes applied.

| View | Current contract | Decision / remaining work |
| --- | --- | --- |
| schools_full | Institution fields plus current region/conference labels; division comes from schools.division | Preserve compatibility; compare legacy division text against canonical division_id before migrating its read expression. |
| teams_summary | Team display fallback plus school classification and count of historical roster rows | athlete_count is not a distinct person count. Decide and document an explicit population before changing its aggregation. |
| unprocessed_live_results | Unprocessed staging rows ordered by scrape time | Deferred by user. Identity maintenance scripts still inspect it, so preserve it. |
| v_athlete_prs | One ranked result per athlete/event/environment using typed marks or supplied points | Preserve source scores; separately verify points eligibility, legal-mark rules, and career-cache parity before treating it as complete PR authority. |

## Measured aggregation issue

`teams_summary` uses `count(ats.athlete_id)` across all `athlete_team_seasons` rows.
The live bridge has 1,795 team groups where row count exceeds distinct athlete count, representing
34,659 additional historical roster rows. These are not proven duplicates: different seasons can
correctly represent the same athlete. A future distinct count would mean all-time unique athletes,
not the current roster. Preserve roster history while specifying which count the consumer needs.

The source search found generated type declarations for `schools_full`, `teams_summary`, and
`v_athlete_prs`, but no direct runtime reference by those names. This does not prove there are no
external consumers or dynamic references. `unprocessed_live_results` has explicit consumers in
the identity promotion/merge/split scripts under `scrapers/athletic-net`.

## Completion boundary

Definitions and direct source-name references are reviewed. Column semantics, database dependents,
view ACLs/options, and external API compatibility must be closed before marking the view contracts
complete. This report makes no claim that inventory alone closes those checks.
