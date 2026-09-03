# Whole-database open-decisions register — 2026-09-03

The database audit is not complete merely because every table has a disposition. This register
keeps every semantic or operational question visible, with the evidence required before a write
can be approved. “Held” means no production mutation is authorized for that item yet.

| ID | Area | Current evidence | Decision / next gate | Status |
| --- | --- | --- | --- | --- |
| DB-01 | Person vs affiliation | `Unattached` school 1835 contains 48,124 athletes, 56,046 results, and 21 relay parents; `athlete_team_seasons` has zero linked rows. | Add explicit nullable/typed affiliation semantics in parallel; preserve placeholder until deterministic backfill and rollback pass. | Evidence captured; held |
| DB-02 | `Other` division | 129 schools / 245 teams / 5,654 athletes; examples include real colleges and universities. | Do not reinterpret `Other`; classify only source-reviewed cohorts. | Decided: no bulk remap |
| DB-03 | School duplicate identity | 71 normalized-name groups / 115 extra rows; no automatic merge is safe from name alone. | Produce per-group source/state/URL evidence and reviewed merge maps. | Held |
| DB-04 | Athlete identity | 6,549 normalized name+school groups / 9,884 extras; collisions are not proof of duplicate people. | Use source IDs, aliases, gender, dates, and provenance; keep ambiguous identities separate. | Held |
| DB-05 | Meet identity | No normalized name+date duplicate groups in the bounded live check; source URL duplicates remain. | Define source-aware meet key and reconcile URL aliases before uniqueness. | Held |
| DB-06 | Result identity | `results` has 3.4M+ rows and no table-level unique constraint; event/meet/team links are nullable. | Define source/event/round identity key; dry-run duplicate partitions before any constraint. | Held |
| DB-07 | Relay identity | `relay_results` has 200K+ rows, nullable meet/team links, and no table-level unique constraint. | Define relay-parent key and preserve unknown/unattached relay states. | Held |
| DB-08 | Season taxonomy | Multiple live conventions (`Indoor YYYY`, `Outdoor YYYY`, `XC YYYY`, `Summer YYYY`, lowercase variants); `Unattached` results have NULL `season_code`. | Map deterministic values, retain raw text, hold ambiguous/NULL values. | Mapping drafted; held |
| DB-09 | Environment | Outdoor/indoor/XC and 258,521 NULL result environments. | Backfill only from deterministic source/meet context; do not infer all NULLs. | Held |
| DB-10 | Round taxonomy | `Final` and `Finals`, `Prelim` and `Preliminaries`, numbered heats, and NULLs coexist. | Canonicalize with raw preservation; require source evidence for NULL/ambiguous rounds. | Held |
| DB-11 | Event model | `events` is empty but still read by frontend; `event_types`/aliases are populated. | Decide whether `events` remains per-meet scheduling or retires after reader migration. | Owner decision |
| DB-12 | PR authority | `athlete_prs` is populated while `v_athlete_prs` computes from results; mark parsing is unsafe for multi-events. | Migrate readers, validate component-event semantics, then retire/retain with explicit authority. | Held |
| DB-13 | Live-results lifecycle | `live_results` has 48 stale rows and a compatibility view. | Isolate active ingest from finalized facts; retire view only after reader removal and retention decision. | Held |
| DB-14 | Unmapped events | Review telemetry exists separately from canonical aliases. | Make unknown labels enter a private review path and define retention/resolution states. | Held |
| DB-15 | Ingest queues | `recovery_queue` and `event_recovery_queue` overlap in name but differ in granularity/lifecycle. | Compare lifecycle contracts before considering a shared interface; do not merge by name. | Held |
| DB-16 | Backup archives | Public backup tables are immutable before-images without PK/index/policies; `results_athlete_merge_backup` has RLS disabled. | Verify ACLs, move/restrict only through a tested archive boundary, and retain until decisions close. | Security gate |
| DB-17 | Migration history | Repository and `supabase_migrations` include out-of-band/ambiguous operations. | Reconcile by postconditions and provenance; never mark a migration applied from filename alone. | Held |
| DB-18 | Access control | Canonical public reads are policy-backed; private ingest uses grants; only one application archive lacks RLS. | Recheck grants for archive exception and add policy tests before archive changes. | Held |
| DB-19 | Managed schemas | `auth`, `storage`, `realtime`, `vault`, GraphQL, and extensions are platform-owned. | Leave untouched; document findings as platform configuration issues. | Decided |
| DB-20 | Performance | Large facts have many indexes but usefulness has not been workload-validated. | Use query plans/observed workload before dropping or adding indexes. | Held |

## Completion rule

An audit wave is complete only when each applicable row is either **decided with evidence** or has a
review owner and a reproducible gate. No schema/data write should be generated for a row marked
Held. This register is intentionally additive: it does not create a database table or change live
data.
