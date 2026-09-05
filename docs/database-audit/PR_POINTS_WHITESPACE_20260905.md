# API-01a: consistent supplied-points whitespace handling

Applied live as `20260905184656_fix_pr_view_supplied_points_filter`. The view keeps its columns,
invoker security, time/distance ranking, component exclusion and deterministic tie-breaking. Only
the points token recognition/extraction changes to a shared POSIX whitespace convention. No source
score is calculated, summed, re-scored, or rewritten. No public table rows were modified.

## Corrected finding

An initial interpretation of escaped catalog text incorrectly suggested ordinary annotated totals
were rejected. The current-schema PostgreSQL fixture disproved that: an ordinary `7499` already
appears. The real reproduced defect is that the old whitespace filter accepts a leading tab while
`trim()`-based extraction does not read that score. A tied earlier tab-prefixed achievement is then
not selected correctly. The new extraction recognizes the same whitespace as the filter.

Live measurement: 15,797 eligible supplied totals across 3,206 athletes; **zero** leading-tab totals
and **zero** differences between the old/new extracted tokens in current eligible rows. Consequently
this is a preventive correctness fix with a regression test, not evidence that thousands of PRs
were repaired. Post-change view returns 6,882 athlete/event/environment point PR rows for those
3,206 athletes. No before/after count increase is claimed. The API view is not currently wired as a
runtime frontend reader, so no visible UI change is promised.

## Tests and preservation

All 14 PostgreSQL tests pass (13 scenarios plus parent). The points fixture includes plain and
annotated supplied totals, a leading-tab total, earlier tied achievements, time/distance components,
status results and malformed suffixes. It proves the original chooses the later plain score, the
replacement chooses the earlier tied supplied score, and components/statuses are excluded. The
replacement retains `security_invoker=true`. The preserved-schema rollback restores the original
selection while retaining the separately fixed security boundary; rollback DDL is tested inside
the synthetic transaction. No live rollback was executed.

`rollback_pr_points_filter_20260905.sql` preserves the SELECT from the strict pre-change schema
restore and retains invoker security. Use only for a demonstrated regression: it restores the old
whitespace behavior. Historical SQL files remain unchanged. Targeted migration application did
not execute the unrelated LAI draft or held history. Broader legal-PR rules, explicit multi-event
parent/component modeling and incomplete historical coverage remain separate open items.
