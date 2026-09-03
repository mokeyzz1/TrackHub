# Table structure review — 2026-09-03

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
