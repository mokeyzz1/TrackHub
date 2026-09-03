# Whole-database open-decisions register — 2026-09-03

The database audit is not complete merely because every table has a disposition. This register
keeps every semantic or operational question visible, with the evidence required before a write
can be approved. “Held” means no production mutation is authorized for that item yet.

| ID | Area | Current evidence | Decision / next gate | Status |
| --- | --- | --- | --- | --- |
| DB-01 | Person vs affiliation | `Unattached` school 1835 contains 48,124 athletes, 56,046 results, and 21 relay parents; `athlete_team_seasons` has zero linked rows. | Add explicit nullable/typed affiliation semantics in parallel; preserve placeholder until deterministic backfill and rollback pass. | Foundation applied; shared/TFRRS dual-read live; dual-write and backfill held |
| DB-02 | `Other` division | 129 schools / 245 teams / 5,654 athletes; examples include real colleges and universities. | Do not reinterpret `Other`; classify only source-reviewed cohorts. | Decided: no bulk remap |
| DB-03 | School duplicate identity | 71 normalized-name groups / 115 extra rows; no automatic merge is safe from name alone. | Produce per-group source/state/URL evidence and reviewed merge maps. | Held |
| DB-04 | Athlete identity | 6,549 normalized name+school groups / 9,884 extras; collisions are not proof of duplicate people. | Use source IDs, aliases, gender, dates, and provenance; keep ambiguous identities separate. | Held |
| DB-05 | Meet identity | No normalized name+date duplicate groups in the bounded live check; source URL duplicates remain. | Define source-aware meet key and reconcile URL aliases before uniqueness. | Held |
| DB-06 | Result identity | `results` has 3.4M+ rows and no table-level unique constraint; event/meet/team links are nullable. | Define source/event/round identity key; dry-run duplicate partitions before any constraint. | Held |
| DB-07 | Relay identity | `relay_results` has 200K+ rows, nullable meet/team links, and no table-level unique constraint. | Define relay-parent key and preserve unknown/unattached relay states. | Held |
| DB-08 | Season taxonomy | Multiple live conventions (`Indoor YYYY`, `Outdoor YYYY`, `XC YYYY`, `Summer YYYY`, lowercase variants); `Unattached` results have NULL `season_code`. | Map deterministic values, retain raw text, hold ambiguous/NULL values. | Mapping drafted; held |
| DB-09 | Environment | Outdoor/indoor/XC and 258,521 NULL result environments. | Backfill only from deterministic source/meet context; do not infer all NULLs. | Held |
| DB-10 | Round taxonomy | `Final` and `Finals`, `Prelim` and `Preliminaries`, numbered heats, and NULLs coexist. | Canonicalize with raw preservation; require source evidence for NULL/ambiguous rounds. | Held |
| DB-11 | Event model | `events` is empty, has no database dependents, and has one frontend reader that always receives an empty set. | Retire after frontend reader migration, type/tests, repository search, and exact-structure rollback test. | Decision made; implementation held |
| DB-12 | PR authority | `athlete_prs` has 475,523 rows and 98.2% NULL provenance fields; `v_athlete_prs` has 851,775 canonical buckets, while existing migration evidence found scraped-only career-best pairs. | Keep and reconcile the cache; migrate readers/writers, close missing-result gaps, then retire only after full-season comparison and rollback. | Evidence captured; held |
| DB-13 | Live-results lifecycle | `live_results` has 48 stale 2025 rows, all unprocessed/unfinalized and unlinked to athlete/team/meet; a compatibility view and active readers/writers remain. | Migrate lifecycle, archive exact rows privately, then retire table/view with rollback. | Evidence captured; implementation held |
| DB-14 | Unmapped events | 46 raw labels have been seen 1,484 times; highest frequency is 172; no canonical event link is stored. | Add reviewed resolution/retention state while keeping raw labels and service-role writes. | Evidence captured; held |
| DB-22 | Reference identities | `external_ids` has 356 verified athlete-source rows, with no duplicate source keys; entity-specific columns are currently unused. | Keep one shared portability map; add school/team/conference rows only from reviewed evidence. | Evidence captured; held |
| DB-15 | Ingest queues | Meet-level queue has 2,573 rows with coverage states; event-level queue has 10,608 rows with event/lease/retry fields and distinct outcomes. | Keep separate; only add a compatibility interface after lifecycle tests, never merge by name. | Evidence captured; decided separate |
| DB-16 | Backup archives | All nine backup tables deny anon/authenticated SELECT and grant only postgres/service_role; eight have RLS enabled, while `results_athlete_merge_backup` is the sole RLS exception. | Keep archives; optionally harden the exception with a reversible service-role policy after restore tests. | Evidence captured; security gate |
| DB-17 | Migration history | Five directly-applied cleanup migrations were verified and repaired into the live ledger; timestamp-drifted and provenance-uncertain files remain. | Continue by explicit baseline/alignment; never replay or mark uncertain migrations, including the paused 4×100. | Partial reconciliation; affiliation foundation recorded; held |
| DB-18 | Access control | Canonical public reads are policy-backed; private ingest uses grants; only one application archive lacks RLS. | Recheck grants for archive exception and add policy tests before archive changes. | Held |
| DB-19 | Managed schemas | `auth`, `storage`, `realtime`, `vault`, GraphQL, and extensions are platform-owned. | Leave untouched; document findings as platform configuration issues. | Decided |
| DB-20 | Performance | Large facts have many indexes but usefulness has not been workload-validated. | Use query plans/observed workload before dropping or adding indexes. | Held |
| DB-21 | Historical affiliation | 7,357 bridge rows (5,655 athletes) link a historical team to a different current athlete school. | Treat `athlete_team_seasons` as historical evidence; never overwrite it during current-school cleanup. | Evidence captured; held |
| DB-23 | Private evidence retention | Observations (156,385), quarantine (9,648), source links (41,214), runs (1,497), and cleanup archive (138,911) are active provenance/control-plane data. | Preserve append-only history; define retention only after source-link and rollback requirements are closed. | Evidence captured; held |

## Completion rule

An audit wave is complete only when each applicable row is either **decided with evidence** or has a
review owner and a reproducible gate. No schema/data write should be generated for a row marked
Held. This register is intentionally additive: it does not create a database table or change live
data.
