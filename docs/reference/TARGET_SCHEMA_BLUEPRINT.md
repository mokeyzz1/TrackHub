# Target Schema Blueprint (the "north star")

Draft for review — **nothing here is applied yet.** This is the agreed destination we build
toward, migration by migration. Goal: a clean, portable, self-documenting PostgreSQL schema that
any developer or agent can understand at a glance and that can move to AWS RDS unchanged.

## Design principles
1. **One authoritative link for everything** — foreign keys, not matching by text strings.
2. **Canonical dimensions** — events, seasons, environments defined once; everything references them.
3. **Enforced integrity** — FKs + unique constraints so bad data (dup meets/athletes, orphan
   results) is impossible, not just discouraged.
4. **Derived, not trusted** — computed facts (PRs, season bests, rankings) are calculated from
   results, not scraped flags we hope are right.
5. **Portable & migration-defined** — the whole schema rebuilds from versioned migrations in the
   repo; no Supabase-only features we can't export.

## Current state (what we're fixing)
- 19 tables; **6 are empty** (`events`, `event_entries`, `meet_entries`, `conferences`,
  `conference_memberships`, `regions`, `external_ids`) — ghost tables that confuse readers.
- **`results.event_name` is free text** — 1,135 distinct values for ~45 real events
  (`200`/`200m`, `LJ`/`Long Jump`, `SP`/`Shot Put`, `60H`, `8k`…).
- **No FK on `results.meet_id`, `results.event_id`, `relay_results.meet_id`** — links unenforced.
- **Two meet-ID populations** (12,241 normal + 437 TFRRS-imported at IDs 90k+).
- **Season is inconsistent**: `meets.season` = `"Indoor 2025"`/`"indoor"`; `results.season_code`
  = `"YYYY_SEASON"`; `athlete_prs.season` = `"all"`. Three schemes.
- **No environment / wind-legality / altitude** modeling on results.
- **Athletes duplicated** (~19k by name+school; 35k with no TFRRS id; no uniqueness constraint).
- **RLS off** on `relay_results` + `relay_athletes` (security hole).

## Target model — core entities

```
schools ──< teams ──< athlete_team_seasons >── athletes
   │                                              │
   └─ conferences (real)                          │
                                                  │
event_types (canonical catalog) ──< results >─────┘
                                        │
                        meets >─────────┘   (results.meet_id FK, authoritative)
```

### Reference / dimension tables

**Events & environment — two separate axes (key design decision).**
Do NOT bake the season into the event (no `"200m indoor"` vs `"200m outdoor"` as different events).
Instead:
- **`event_types`** (NEW canonical catalog, ~45 rows). One row per *pure* event:
  `event_type_id, code ('200m','LJ','60mH'), display_name, category (sprint|distance|hurdle|
  jump|throw|relay|multi), measure (time|distance|points), environment_scope
  (indoor_only | outdoor_only | xc | both)`.
- **`results.environment`** (`indoor`|`outdoor`|`xc`) is a *separate* field on each result.
  All PRs / rankings / records are grouped by **(event_type × environment × gender)** — so indoor
  200m, outdoor 200m, and an XC 8k are always separate buckets, automatically.
- **Deriving environment:** if the event is environment-specific (60m→indoor, 100m→outdoor,
  8k→xc, weight throw→indoor…), use that. For *shared* events (200m/400m/800m/shot put/long
  jump… that occur both indoor & outdoor), derive from the meet's **season/date** (Indoor Dec–Mar,
  Outdoor Mar–Jun, XC Aug–Nov). Ties into the `seasons` cleanup.
- **`event_aliases`** — an **editable** table mapping every messy string → one `event_type_id`
  (`'200'`,`'200 Meters'`,`'200m'` → 200m; `'LJ'`→Long Jump; `'SP'`→Shot Put; `'60H'`→60m H).
  **Scrapers resolve every event name through this table on import.** A name not found is written
  to an **`unmapped_events`** log for review — never silently mangled. So the mapping stays correct
  and self-maintaining, and new spellings can't drift the data back to a mess (the gap that left
  ~half the current data un-normalized: `200`=171k still bigger than `200m`=127k).
- **`seasons`** — canonical season model: `season_code ('2026_INDOOR'), sport (indoor|outdoor|xc),
  year, start_date, end_date`. Everything references `season_code`. (Seasons span two calendar
  years — never derive from `date`'s calendar year.)
- **`conferences`**, **`regions`** — make real (populate) *or* drop. Recommend: **populate** —
  they power division/conference filtering the app already wants.

### Fact tables
- **`meets`** — one clean ID space (fold the 437 TFRRS-ID meets into normal IDs; keep the TFRRS id
  in a `tfrrs_meet_id` column, not as the primary key). Add `season_code` FK, `environment`.
  Enforce **unique(normalized_name, date, location)** to stop duplicate inserts at the DB level.
- **`results`** — the spine. Target columns: `result_id, athlete_id→athletes, team_id→teams,
  meet_id→meets (FK, NOT NULL where known), event_type_id→event_types (FK), season_code→seasons,
  mark_raw, mark_seconds, mark_meters, wind_ms (numeric), wind_legal (bool), environment,
  altitude_flag, round, place, date`. FKs enforced. `event_name` free text retired (kept only as
  `raw_event_name` for provenance).
- **`relay_results` / `relay_athletes`** — same treatment (FK `meet_id`, `event_type_id`), **RLS on**.
- **`athlete_prs`** → **replace with a derived/computed view** (`v_athlete_prs` or a refreshed
  table): best legal mark per `athlete_id × event_type_id × environment`, computed from `results`.
  No more trusting scraped `is_pr`. `is_pr`/`is_season_best` on results become computed, not scraped.

### Verdicts on the empty tables (no ghost tables)
| Table | Verdict |
|---|---|
| `events` (per-meet event instances) | **Drop for now** — superseded by `event_types` + `results`. Re-add later only if we need per-meet scheduling. |
| `event_entries`, `meet_entries` | **Drop** — entries feature isn't live; re-add with the feature. |
| `conferences`, `regions`, `conference_memberships` | **Keep + populate** — power filtering. |
| `external_ids` | **Keep** — good for multi-source ID mapping (TFRRS/Athletic.net) and portability. Start using it instead of scattering `tfrrs_*` columns. |
| `live_results` (48 rows) | **Keep but isolate** — live-meet scraping path; document as separate from final results. |

## Identity & integrity to add
- `athletes`: unique on `tfrrs_athlete_id` (where not null); dedup the ~19k name+school dupes;
  a deterministic identity rule for TFRRS-less athletes.
- `results`: FK `meet_id`, FK `event_type_id`; the pre-existing 222 orphan `meet_id`s cleaned.
- `meets`: unique(normalized name, date) guard.
- **RLS**: enable on `relay_results`/`relay_athletes` with read policies matching the other tables.

## Migration approach
Each change ships as a **versioned migration**, **tested on a Supabase branch first**, then applied
to prod, then documented. Rough order (each independently valuable, each its own review gate):
1. `event_types` + `event_aliases` catalog; map results → `event_type_id` (backfill).
2. Canonical `seasons`; backfill `season_code`; fix the `scrape_meets.js` hardcoded-season bug.
3. Unify meet ID space; add FKs (`results.meet_id`, `relay_results.meet_id`), clean 222 orphans.
4. Environment + `wind_ms`/`wind_legal` on results.
5. Athlete dedup + uniqueness constraints.
6. Computed PRs/season-bests (retire scraped `athlete_prs`).
7. Populate `conferences`/`regions`; adopt `external_ids`; drop the dropped-verdict tables.
8. RLS + index cleanup (drop 4 duplicate indexes, add missing FK indexes).
9. **Frontend migration** to read by `meet_id`/`event_type_id` — the last step, gated on testing.

## Open questions for you
1. **Events:** OK to introduce `event_types` + `event_aliases` as the canonical catalog and retire
   free-text `event_name`? (This is the biggest single cleanup.)
2. **PRs:** confirm we move to **computed** PRs (drop the scraped `athlete_prs` approach)?
3. **Empty tables:** agree with the keep/drop verdicts above (esp. dropping `events`/entries)?
4. **`external_ids`:** adopt it as the home for TFRRS/Athletic.net IDs (cleaner, multi-source)?
5. **Conferences/regions:** worth populating now, or defer?
