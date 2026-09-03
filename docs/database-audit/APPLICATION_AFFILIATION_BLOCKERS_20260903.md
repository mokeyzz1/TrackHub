# Application affiliation blockers — 2026-09-03

This inventory is a code-level companion to the live `Unattached` evidence packet. It identifies
where the current application treats `school_id` as the identity and where a nullable/typed
affiliation change would otherwise break reads or writes.

## Writers that currently require the placeholder

| Area | Current behavior | Migration consequence |
| --- | --- | --- |
| `scrapers/shared/athlete_resolver.js` | Uses constant `UNATTACHED_SCHOOL_ID = 1835`; name-only athletes are inserted with that school. | Must write a nullable person row plus an explicit affiliation only when a source team is known. |
| `scrapers/tfrrs/meet-scraper/import-meet-results.js` | Resolves unknown/no-team athletes to 1835 and creates rows with `school_id`. | Needs dual-write/typed source-team handling before relaxing the FK. |
| `scrapers/tfrrs/meet-scraper/sync-weekend-results.js` | Repeats the same fallback for new athletes and result imports. | Must migrate together with the legacy importer to avoid split semantics. |
| `scrapers/tfrrs/meet-scraper/import-new-athletes.js` | Inserts a required `school_id`. | Needs an explicit null/affiliation decision for source rows without an institution. |
| `scrapers/athletic-net/import_meet_results.js` | Uses the `Unattached` constant for Athletic.net athletes lacking a canonical school. | Must retain raw source label and avoid converting every non-collegiate source to one school. |
| `scrapers/trackscoreboard/import_meet_results.js` | Carries `athlete_school_id` from identity resolution; null is already possible in intermediate data. | Good candidate for dual-read/dual-write tests, but final writes must be audited. |
| roster upload/rescrape scripts | Build teams by `school_id + gender` and insert/update athletes by school. | Existing school-derived team key cannot represent club/scholastic/international teams. |

## Readers and identity logic that assume school context

- `scrapers/shared/conservative_identity_resolver.js` filters candidates by `school_id` and joins
  every team to `schools`.
- `scrapers/shared/source_athlete_identity_resolver.js` exposes nullable `school_id` in its internal
  result shape, but callers and database writes still commonly expect a school.
- Athletic.net and TFRRS reviewed-identity/alias tools join `athletes` to `schools` for evidence and
  use school-scoped name matching.
- `scrapers/rosters/upload_to_supabase.js` constructs the team lookup as
  `school_id + gender`, then writes that derived team to `athlete_team_seasons`.
- `public.schools_full` and `public.teams_summary` expose school-derived display values; their
  consumers need a compatibility projection if teams can have no school.
- Several migration files and repair scripts use literal `1835` or exclude it as a special case;
  these must be reviewed before changing the placeholder’s meaning.

## What can be changed safely first

1. Keep all existing columns and the `Unattached` row unchanged.
2. Add replacement affiliation metadata alongside current columns (team display name/type and raw
   source label) with nullable defaults.
3. Update shared resolvers and both TFRRS import paths behind feature flags/tests so new writes use
   the replacement fields while legacy reads continue to work.
4. Add fixtures for collegiate, club, scholastic, international, mixed/open relay, and truly
   unattached individual cases.
5. Only after dual-read/dual-write coverage is green, prepare a nullable-FK migration and a
   deterministic backfill with before-images.

## Explicit non-goals

- Do not delete or bulk-reassign school 1835.
- Do not map `division = 'Other'` to a non-collegiate type.
- Do not infer a person’s affiliation from a relay label without source evidence.
- Do not change production data as part of this inventory.
