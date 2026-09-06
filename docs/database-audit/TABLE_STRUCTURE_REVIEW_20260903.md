# Table structure review — 2026-09-03

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

## Method

This review queried the live PostgreSQL catalogs for every non-system table: primary keys,
foreign-key edges, unique and check constraints, index count, RLS flags, policy count, and total
relation size. It was read-only.

## Structural strengths

- Canonical `public` fact/dimension tables have primary keys and RLS enabled.
- All `ingest` operational tables have primary keys, RLS enabled, and deliberate private grants.
- Foreign-key edges are present throughout the canonical and ingest model; the remaining risk is
  largely nullable linkage fields and legacy text duplicates, not an absence of all relational
  structure.
- The large `results` table has 15 indexes and `relay_results` has 6; index usefulness still needs
  workload validation before any index retirement.

## Structural risks and design questions

| Object | Live signal | Review required |
| --- | --- | --- |
| `public.results` | no table-level unique constraint; 4 FK edges; 15 indexes | define one canonical identity key that includes the correct event/round/source semantics |
| `public.relay_results` | no table-level unique constraint; 3 FK edges; 6 indexes | define parent identity and round policy consistently with individual results |
| `public.schools` | no unique constraint; 3 outbound and 4 inbound FK edges | school identity must be enforced only after collision/alias review |
| `public.conferences` | no unique constraint; 3 inbound FK edges | decide whether name/abbreviation is canonical and how historical changes are represented |
| `public.meets` | no unique constraint; 8 inbound FK edges | establish source-aware meet identity before adding uniqueness |
| `public.athletes` | no unique constraint; 8 inbound FK edges | use source identity/alias evidence, not name-only uniqueness |
| `public.results_athlete_merge_backup` | RLS disabled; no PK/index/policy | verify service-role-only ACL and keep isolated as an archive, or move to the private archive boundary |
| `public.*_backup` tables | no PK/index/policies by design | preserve as immutable before-images; do not expose through public roles |
| `public.events` | empty but has PK, FK, checks, indexes, and a public-read policy | decide whether to retire after all application readers are removed or repurpose as per-meet instances |
| `public.live_results` | 48 stale rows; has FK edges and public-read policy | isolate live-ingest lifecycle from finalized results before any cleanup |

## RLS and policies

The live catalog reports 23 policies, all in `public`. Canonical public tables expose read policies;
`push_tokens` and `unmapped_events` are service-role write surfaces; `waitlist` has a constrained
public insert policy. The private `ingest` tables have no row policies and rely on RLS plus explicit
service-role/postgres grants.

The managed schemas (`auth`, `storage`, `realtime`, and `vault`) are Supabase-owned surfaces. They
are cataloged but are not candidates for application-level redesign. Any security finding there
must be handled as a platform configuration issue, not by changing their tables casually.

## Disposition rule

No missing unique constraint, missing index, disabled RLS flag, or empty table is automatically a
defect. Each must be evaluated against row semantics, code references, foreign-key dependencies,
permissions, and operational lifecycle. The target cleanup plan will explicitly classify every
table as canonical, improve, consolidate, archive, retire-after-migration, managed/leave untouched,
or owner decision required.

## Post-cleanup catalog checkpoint — 2026-09-04

The structure review was rechecked after the latest safe waves:

- The nine historical backup tables now live in private `archive`; the former
  `public.results_athlete_merge_backup` RLS exception is no longer in the public schema.
- `public.events` and its empty-table indexes/sequence were retired after the frontend dependency
  was removed and the exact rollback test passed.
- `public` now has 20 tables, 4 views, and 22 RLS policies; `ingest` remains 10 private RLS tables.
- `public.live_results` is unchanged at 48 stale rows and remains deferred by product priority,
  with its compatibility view and permissions preserved.

No new structural exception was introduced by this checkpoint; unresolved uniqueness, nullable
linkage, and lifecycle questions remain tracked in the open-decisions register.

## MODEL-01 structural review — 2026-09-05

This section supersedes stale structural assumptions above, not the historical evidence itself.
Read-only live catalogs now show 31 application tables and four public views, containing 404
columns (359 table columns and 45 public-view columns). All 52 foreign keys touching public/ingest
stay within those schemas. Four views have 58 recorded column dependencies. No application FK to
archive/auth/storage/realtime/vault was found; that does not mean there are no logical, RPC, or
external service dependencies.

The per-column purpose/disposition and exact relationship definitions are in
[model_review_20260905.json](model_review_20260905.json), linked from the existing master register.
This is a structural first pass, not a declaration that every consumer or existing row is correct.
Existing measured profiles are reused; no new bulk data scan, DDL, repair or product feature was run.

### What makes sense and should stay separate

- A meet is the container for both individual and collective relay results. Keep the two fact
  tables and the relay participation bridge; combine reads, not four copies of a relay fact.
- Schools, competition teams, people, season memberships and represented team on a result are
  different entities. They should not be consolidated into one table.
- Source identities, immutable payload versions, observations, canonical links and quarantine
  describe different stages. Keep them separate; their similar-looking IDs are not redundant.
- Current conference classification and historical membership are different relationships.
  The existing historical bridge should be used, not duplicated or filled from guesses.
- Scraped career PR evidence and the derived imported-result PR view remain complementary.
  A derived view is not an equivalent replacement for source-only career marks.
- Recovery queues have different grains. Preserve the paused event queue without running it.
- Waitlist and notification tokens are independent product data. No competition relationship or
  feature change is justified. Deferred live staging and its view stay untouched.
- Archive rows are historical before-images, not live entities. Do not add cascading references
  to current rows or consolidate them into public facts.

### Structural problems, ordered by domain dependency

| Order | Problem / evidence | Target decision before implementation |
|---|---|---|
| 1 | athletes.school_id and teams.school_id are required. teams is unique on school_id/gender and only permits M/F. Existing team_name/team_type do not remove that coupling. | Decouple person identity and non-collegiate affiliation from institution after migrating readers/writers. Keep current-school compatibility and history; define team identity before relaxing uniqueness. |
| 2 | results.team_id is competition affiliation, athlete_team_seasons is season membership, but get_weekly_performances joins schools through athletes.school_id. | Historical performance reads must use represented affiliation when known, not silently attribute old performances to a transferred athlete's current school. Define honest fallback for unresolved affiliation. |
| 3 | results mixes combined-event totals and component marks under one event_type_id; no explicit parent/component reference exists. | Define aggregate instance and ordered component relationships, with separate source-supplied totals/component scores. Never recalculate points or infer component identity from mark magnitude. New additive structure may be justified here, after source mapping proof. |
| 4 | Canonical relay parent/participation already exists, but shared writer still creates results compatibility rows. No direct public FK ties those compatibility rows to a relay parent. | Adopt parent-plus-participation as authoritative; migrate existing consumers before any compatibility-row removal. All athlete profiles must retain participation. |
| 5 | results has environment; relay_results has no equivalent field. Meets season, roster season_code and copied dates serve different purposes. | Define one shared season/environment contract without calendar-year-only assumptions or guessing unknown history. |
| 6 | event_id remains in results/relay_results although public.events is retired; several reads still join by copied text. | Prefer meet_id/event_type_id, preserve unlinked history fallback, and retire legacy event_id only after all consumer proof. No new generic events table merely to reconnect an obsolete field. |
| 7 | relay_results.team_id, relay_athletes.athlete_id and athlete_prs.athlete_id are integer references to bigint identities. external_ids has nullable alternative targets but no exactly-one-target CHECK. | Plan consistent identity widths; measure and enforce one canonical target per mapping only after examining all writers and provider namespaces. No current corrupt row is inferred from missing CHECK alone. |
| 8 | conference_memberships has only optional year bounds; unique key does not prevent overlapping intervals. Region sport scope and event environment labels remain incomplete. | Define temporal/sport semantics before constraints or enrichment. Current pointers cannot reconstruct history. |

### Current code evidence and limits

- frontend/services/database-supabase.ts: getSchoolMeets and getSchoolTopPerformances read both
  fact tables by represented team; the former caps input facts before deduplicating meet IDs.
- Same file: scopeMeetFactQuery prefers meet_id; getRelayEventsByMeet still uses copied name/date;
  getAthleteRelays uses relay_athletes -> relay_results -> teams/schools and retains parent identity.
- Same file: getAthletePRs reads results and parses marks client-side; it does not consume
  v_athlete_prs. Fixing a database view alone therefore does not establish app PR correctness.
- scrapers/shared/canonical_fact_writer.js explicitly inserts relay parents, participation and
  legacy results rows. Its temporary relay team columns also use integer types.
- scrapers/shared/source_athlete_identity_resolver.js combines private aliases, verified external
  IDs and direct provider pointers. Other writer generations still require individual tracing.
- scrapers/shared/event_resolver.js consumes all five event catalog columns and alias mappings.
- Both live public.get_weekly_performances and get_top_performances were checked for the
  current-school join: both contain JOIN schools s ON a.school_id = s.school_id and neither
  references r.team_id. No live function was changed.
- Public view dependencies were re-read live: schools_full depends on schools/regions/conferences;
  teams_summary also depends on teams/athlete_team_seasons; v_athlete_prs depends on results/event_types;
  unprocessed_live_results depends on live_results.

No file-name search count is treated as proof of an active consumer or proof of no consumer.
Procedural SQL, dynamic references, generated types and external clients are explicit remaining
coverage. Every column has a first-pass interpretation, but field-specific write/read behavior
is still required before its disposition can be marked verified. MODEL-01 remains open.

Supabase schema-review guidance informed distinguishing declared FK edges from logical links,
view dependencies and delete propagation. It did not trigger any schema or index change.
