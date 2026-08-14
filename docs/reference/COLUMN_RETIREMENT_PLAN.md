# Column Retirement Plan

**What this is:** the definitive list of database columns that are superseded or dead but
**cannot be dropped yet** because live code still reads them. Each waits for the frontend
migration (or a scraper update) to remove its readers first. Audited 2026-07-15 against the
live DB (full pg_stats profile) and the codebase (grep of frontend/ + scrapers/).

**The rule (why nothing here is dropped yet):** the app SELECTs these columns today.
Dropping a column the app reads = instant production errors. Safe order is always:
1. add the replacement alongside (done), 2. move the readers (frontend migration),
3. drop the old column. Steps 1–2 must ship before anything below is dropped.

---

## Group A — replaced by the `divisions` dimension (added 2026-07-15)

| Column | State | Replacement | Readers |
|---|---|---|---|
| `schools.division` (text) | 99.9% populated, authoritative for now | `schools.division_id → divisions` | **28 refs** in frontend (typed `Division`, rendered in search UI, in generated `database.ts`) |
| `conferences.division` (text) | populated | `conferences.division_id → divisions` | frontend conference reads |
| `conferences.region` (text) | 99.8% null AND **semantically wrong** (a conference spans up to 7 regions — verified: ACC=7) | none — region belongs to schools, not conferences | check scrapers before drop |
| `schools.ncaa_region` (text) | **100% null** | `schools.region_id → regions` | 3 refs (type defs only) |
| `regions.region_name` division prefix ("DI ...") | in use | `regions.division_id` (drop the prefix from the name at retirement) | display code |

**Frontend migration must:** switch `Division` handling to read via `division_id`/join (or a
view), regenerate `database.ts` types, then drop the four text columns above.

## Group B — dead columns on `results` (verified against live data)

| Column | State | Replacement | Readers |
|---|---|---|---|
| `results.event_id` | 60% null, superseded | `event_type_id → event_types` | **38 refs** (mostly scrapers passing it through) |
| `results.season_code` | **100% null** — never populated | `meets.season` + `results.environment` | 18 refs (selects/types) |
| `results.meet_location` | **100% null** | `meet_id → meets.location` | 6 refs |
| `results.total_competitors` | **100% null** | none (unwanted — owner confirmed) | 4 refs |
| `results.mark_feet` | 92% null | derivable from `mark_meters` | 3 refs |
| `relay_results.event_id` | 82% null, superseded | `event_type_id` | shared scraper code |
| `results.is_season_best` | always false, never computed | **KEEP for now** — owner undecided; will become computed with PRs | — |

## Group C — superseded table

| Table | State | Replacement |
|---|---|---|
| `athlete_prs` (476k rows) | scraped; proven incomplete (missing whole events) & stale (wrong bests); `set_at`/`meet_name` 98% null | computed `v_athlete_prs` / `mv_athlete_prs` (migration `20260715_computed_athlete_prs.sql`, drafted). Retire after the app reads computed PRs. |
| `events` (0 rows) | empty per-meet schedule table | drop after `frontend/hooks/useMeetDetails.ts:47` stops fetching it (returns `[]` today; a drop would make it error) |

## NOT dead — do not drop (future social-app scaffolding, owner confirmed 2026-07-15)

`athletes.bio`, `athletes.profile_image_url`, `athletes.hometown`, `athletes.high_school`,
`athletes.grad_year`, `athletes.primary_events` — empty today because nobody logs in yet;
reserved for accounts / claimed-profile features. Also keep: `conference_memberships`
(empty M:N history — realignment tracking), `external_ids` (future multi-source ID home).

## Backfills wanted before the social launch (data quality, not retirement)

- `athletes.gender` — **28% null**; breaks gender-split PRs/rankings. Derivable from team
  gender (via `athlete_team_seasons`/`results.team_id`) and event types.
- `athletes.first_name`/`last_name` — **56% null**; split from `full_name`.
- 133 schools with division `'Other'` + 59 conferences with no division → classify.
- Split the catch-all "Independent(s)" conference into per-division rows (TFRRS-style),
  then enforce school.division == conference.division.
- DIII regions: DB has 9, NCAA has 10 — identify and add the missing one.
