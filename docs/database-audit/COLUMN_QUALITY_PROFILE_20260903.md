# Column quality profile — 2026-09-03

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

## Method

The existing read-only [`quality_scan.sql`](./quality_scan.sql) was run against all data-bearing
tables in `public` and `ingest`. For every column it computed the exact table total, NULL count,
empty-string count, and null rate. No data was changed.

This is a quality signal, not an automatic deletion list. A column that is empty may be reserved,
optional by design, a staging field, or genuinely obsolete; its code readers and semantic role must
be reviewed before changing it.

## High-confidence unused or reserved signals

The following columns are currently 100% NULL in their populated tables:

- `ingest.runs.code_revision`
- `ingest.source_records.payload_hash`
- `public.athlete_team_seasons.jersey_number`
- `public.athletes.bio`, `grad_year`, `high_school`, `hometown`, `primary_events`,
  `profile_image_url`
- `public.external_ids.conference_id`, `school_id`, `team_id`
- `public.live_results.athlete_id`, `meet_id`, `team_id`, `team_name`
- `public.meets.wa_results_url`
- `public.results.season_code`, `total_competitors` (and `meet_location` is effectively empty)
- `public.schools.ncaa_region`
- `public.teams.athletic_net_url`, `coach_name`

These are candidates for explicit “reserved,” “replace,” or “retire-after-readers-migrate” statuses,
not immediate drops. Several profile fields are intentionally reserved for future user features.

## Core linkage and completeness signals

The current canonical fact tables still contain important optionality that must be explained before
stronger constraints are added:

| Object/column | Rows | NULLs | Rate | Interpretation to resolve |
| --- | ---: | ---: | ---: | --- |
| `public.results.meet_id` | 3,419,178 | 562,033 | 16.44% | history/unlinked imports versus repairable meet identity |
| `public.results.date` | 3,419,178 | 422,761 | 12.36% | source/date provenance and history policy |
| `public.results.team_id` | 3,419,178 | 401,563 | 11.74% | unattached/club/history semantics versus missing team resolution |
| `public.results.environment` | 3,419,178 | 258,521 | 7.56% | derive from meet/event where safe; quarantine ambiguity |
| `public.results.event_id` | 3,419,178 | 2,283,713 | 66.79% | legacy field superseded by `event_type_id` |
| `public.relay_results.meet_id` | 200,736 | 22,865 | 11.39% | relay history and source linkage |
| `public.relay_results.team_id` | 200,736 | 31,344 | 15.61% | relay team identity and unattached semantics |
| `public.relay_athletes.athlete_id` | 450,685 | 3,359 | 0.75% | unresolved relay legs requiring provenance review |
| `public.athletes.gender` | 151,537 | 31,211 | 20.60% | possible derivation from team/event, but not blind filling |

The distinction between optional-by-domain and missing-by-error is central to the target schema.
For example, an unattached performance may legitimately lack `team_id`, while a meet-linked college
result generally should not.

## Derived/legacy field signals

- `public.athlete_prs.set_at` is 98.21% NULL and `meet_name` is 98.20% NULL, supporting the existing
  plan to make PRs derived from canonical results rather than a second scraped fact store.
- `public.results.mark_feet` is 91.30% NULL and appears derivable from metric marks; this requires
  reader migration before retirement.
- `public.results.wind` is 92.08% NULL; absence is expected for non-wind events, so this is not a
  blanket data defect.
- `public.meets.source_url` is 99.97% NULL while source-specific URL columns are populated for
  some sources; the model should clarify whether `source_url` is a canonical fallback or dead field.
- `public.conferences.region` is 99.82% NULL, while region belongs to schools rather than a
  conference-wide record; this requires semantic review rather than backfill.

## Next required review

Each signal above will be joined to constraints, policies, code readers, source provenance, and
actual value distributions. The disposition will be recorded as one of: keep as-is, improve,
backfill, replace, consolidate, archive, retire after migration, managed/leave untouched, or owner
decision required. No column will be dropped based on NULL rate alone.
