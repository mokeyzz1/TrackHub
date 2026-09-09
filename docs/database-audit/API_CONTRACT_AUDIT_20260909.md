# API-01 public read-contract audit

## Scope

This checkpoint verifies the database-facing API surfaces after the earlier affiliation, status,
points, and team-summary fixes. It covers every current public view, every application-owned public
RPC, and the repository's actual frontend consumers. No table, view, function, policy, or row was
changed.

## Live view contract

The live catalog contains eight application-owned public views. Each has `security_invoker` enabled.
Five are deliberately public read surfaces; three compatibility/processing views remain private.
`school_competition_profiles` is one of the public surfaces and exposes only the normalized
competition hierarchy.

| View | Columns | Anonymous/authenticated read | Definition hash | Decision |
| --- | ---: | --- | --- | --- |
| `school_competition_profiles` | 13 | allowed | `3f8a49462d7e93265c5dc0fc62223508` | public normalized school competition profile |
| `schools_full` | 11 | denied | `5be3fb6aefb2b9dad303dc95e192885d` | private compatibility view; no frontend consumer |
| `teams_summary` | 7 | denied | `2c55f85157b88abc3553ceccb3b8836f` | private compatibility view; distinct all-time athlete count |
| `unprocessed_live_results` | 17 | denied | `6372607a9b6e7d82aa83ddffcb4fb6df` | private identity-maintenance surface; live tracking deferred |
| `v_athlete_collegiate_history` | 9 | allowed | `2d1c0288839b37fc902d49640eba5007` | one row per athlete; evidence flags only |
| `v_athlete_current_status` | 9 | allowed | `f9e5183ee16bc66368a9b14c10d2f569` | confirmed current status only |
| `v_athlete_prs` | 10 | allowed | `8da14286c24349953419d869d6c3a8ee` | typed best-result buckets; supplied points preserved |
| `v_athlete_status_summary` | 14 | allowed | `9db6a1bce734840fb8a9dc82e03ecc66` | additive combined athlete-status contract |

Live parity checks returned 1,847 schools and 1,847 competition-profile rows with unique school
IDs; 151,534 athlete rows in each of `v_athlete_collegiate_history`,
`v_athlete_current_status`, and `v_athlete_status_summary`, all with unique athlete IDs. The
history view had zero inconsistent flag/classification rows. The current-status view returned zero
confirmed status rows, which is expected because the confirmed status-period table is intentionally
empty; provisional/private evidence does not leak into the public API. Competition profiles have
3 schools without a primary membership, 6 without a primary organization, and 672 without a
primary competition level; these are honest unresolved hierarchy states, not duplicate rows.

The earlier `API-01a` points audit remains authoritative for `v_athlete_prs`: the view selects
leading source-supplied aggregate scores only when typed component marks are NULL, and does not
calculate replacement multi-event totals. `API-01b` independently verified all 3,516 team-summary
counts against distinct `athlete_team_seasons` athletes while preserving every historical row.

## RPC boundary and role checks

The five public functions retain pinned `search_path` values. `detect_timing_platform`,
`get_top_performances`, and `get_weekly_performances` are invoker-security read RPCs executable by
`anon` and `authenticated`; `register_push_token` is the one validated security-definer write RPC;
the timestamp trigger helper is not browser-executable. Bounded anonymous-role reads returned
151,534 status-summary rows, one PR sample, and valid zero-row results for the requested recent
leaderboard window. Authenticated reads returned 151,534 history rows and the same public PR
surface. Private views returned PostgreSQL `42501 permission denied` for the anonymous role.

## Application consumers

Repository search confirms the frontend calls `get_top_performances` for the leaderboard and reads
canonical `results` for athlete performances/PRs; it does not read the private compatibility views
or the scraped `athlete_prs` table directly. Relay screens read `relay_results` plus
`relay_athletes`, preserving one collective relay performance with athlete participation links.
The status-summary view is additive and ready for later UI adoption. No UI rebuild or live-tracking
work is part of this checkpoint.

## Completion and remaining decisions

API-01 is complete: public relationships, row parity, role visibility, supplied-score semantics,
historical affiliation reads, and existing app consumers are verified. No duplicate API table or
new RPC was needed. Remaining product choices—UI adoption, wind-legal PR refinement, current
versus all-time roster counts, and the unresolved competition-level labels—remain explicitly
separate from this contract checkpoint and do not authorize data rewrites.

Evidence reused: `VIEW_CONTRACT_REVIEW_20260905.md`, `RESULT_AFFILIATION_READS_20260905.md`,
`PR_POINTS_WHITESPACE_20260905.md`, `TEAM_SUMMARY_COUNTS_20260905.md`,
`ATHLETE_PRS_DISPOSITION_EVIDENCE_20260903.md`, and `FUNCTION_ACCESS_REVIEW_20260904.md`.
