# SEC-01a: restore the PR view's caller-policy boundary

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

Live inspection found `v_athlete_prs.reloptions=NULL`, despite the August hardening migration
setting `security_invoker=true`. A later replacement failed to preserve that boundary. The advisor
flagged the view as security-definer. The base `results` and `event_types` tables have SELECT grants
and public-read policies for anon/authenticated; preserving ordinary public reads is intentional.

Applied only `ALTER VIEW public.v_athlete_prs SET (security_invoker=true)` with a five-second lock
timeout, recorded as `20260905184307_restore_pr_view_invoker_security`. No SELECT definition, row,
column, grant or base-table policy changed. This targeted migration did not execute unrelated SQL.
Pre-change schema is preserved in the current-schema backup; prior reloptions were NULL. A metadata
rollback would RESET the option, but that restores the insecure boundary and is not recommended.

Verification: 13 PostgreSQL tests pass (12 scenarios and parent). In an isolated schema clone,
anon and authenticated read exactly the same synthetic PR rows before/after this option. Temporarily
restricting the fixture's base-table SELECT policy then hides those rows through the view for both
roles. Transaction rollback restores all test policy changes. No live policy was altered for tests.
Live catalog now reports `security_invoker=true`; the follow-up advisor no longer reports the
[security-definer view finding](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view).

The two warnings on the intentional `register_push_token` RPC remain separate review items. Do not
remove a working public registration endpoint merely to clear its advisory without reviewing its
authorization/abuse model. Repo search found the PR view in generated frontend types, but no runtime
reader; therefore this change is not a claim of a visible app feature or UI deployment.

Correction after deeper validation: escaped catalog output initially suggested ordinary totals were
rejected, but the restored PostgreSQL schema accepts them. The confirmed defect was inconsistent
whitespace handling between filtering and extraction. See PR_POINTS_WHITESPACE_20260905.md; do not
interpret this checkpoint as evidence that all ordinary point totals were missing. Entire PR semantics (wind legality,
source completeness and multi-event component identity) are not certified by this security fix.
