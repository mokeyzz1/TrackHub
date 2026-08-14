# TrackHub Backend Architecture (Reality, as of 2026-07-09)

This is the canonical map of how the backend actually works — verified against code and the
production database, not aspiration. If you change the pipeline, **update this doc in the same
commit.** Every claim cites its source so it can be re-verified.

---

## 1. The big picture

```
USTFCCCA calendar ──► meets table ◄── status updater (hourly)
      (Mon/Thu/Fri)        │
                           │  meets needing results (last 7 days)
                           ▼
                 sync-weekend-results.js ──► TFRRS meet pages
                      (Sun/Mon)                    │
                                                   ▼
                              results / relay_results / relay_athletes / athletes
                                                   │
                                                   ▼
                              app reads by meet_name + date  (NOT meet_id)
```

Sources: `.github/workflows/*.yml`, `scrapers/meets/scrape_meets*.js`,
`scrapers/tfrrs/meet-scraper/sync-weekend-results.js`, `frontend/services/database-supabase.ts`.

**Data sources: USTFCCCA (meet calendar + result links) and TFRRS (all results).**
athletic.net is NOT a data source. It appears only as (a) the timing-vendor URL some meets
store in `meet_url` (a tap-through link in the app), and (b) legacy unwired code.

---

## 2. Automation that actually runs (GitHub Actions)

| Workflow | Schedule | Runs | Writes |
|---|---|---|---|
| `scrape-meets.yml` | Mon/Thu/Fri 6AM Central | `meets/scrape_meets_github.js all` | `meets` (upsert; links by label: "Timing Site"→`meet_url`, "TFRRS Results"→`tfrrs_url`, AthleticNet/WA final links) |
| `check-live-status.yml` | hourly Wed–Sun meet hours + daily 6AM | `meets/update_meet_status.js` | `meets.status` (upcoming→completed by `end_date`) |
| `sync-results.yml` | Sun 10PM + Mon 8AM Central | `scrape_meets_github.js last_week`, then `tfrrs/meet-scraper/sync-weekend-results.js --days 7 --commit` | `results`, `relay_results`, `relay_athletes`, `athletes` (creates missing), `meets.results_status` |

**Anything not in this table does not run automatically.**

---

## 3. Scraper inventory: active vs legacy

### Active (wired to automation or currently useful)
| Path | Role |
|---|---|
| `scrapers/meets/scrape_meets.js` / `scrape_meets_github.js` | Meet discovery from USTFCCCA (stealth Puppeteer). ⚠ hardcodes `season:'indoor'` (`scrape_meets.js:490`) |
| `scrapers/meets/update_meet_status.js` | Status flips (uses `end_date` for multi-day) |
| `scrapers/tfrrs/meet-scraper/sync-weekend-results.js` | **The results engine.** Finds recent meets w/o results; prefers stored `tfrrs_url` (`--fuzzy` enables name-match fallback ≥35% similarity); scrapes TFRRS; imports w/ `meet_id`, relays, dupe checks |
| `scrapers/meets/backfill_result_links.js` | Off-season tool: re-scrape USTFCCCA/TFRRS listings to fill missing result links on past meets (only fills empty fields) |
| `scrapers/meets/cleanup_duplicate_meets.js` | Duplicate meet merge tool |
| `scrapers/meets/fix_meet_urls.js` | One-time `meet_url` junk cleanup (ran 2026-07-09: 182 rewrites, 89 nulls) |

### Legacy / one-off (NOT wired; candidates to archive)
| Path | What it was |
|---|---|
| `scrapers/tfrrs/athlete-scraper/` | Bulk historical import via athlete profile pages (Nov 2025–Feb 2026). Produced the 2.2M results with **no `meet_id`**. `import-results-to-db.js:166-184` simply doesn't set the column |
| `scrapers/tools/scrape-and-import.js` + `meet-url-mapping.js` | One-off for Feb 22–Mar 1 2026 championships; hardcoded name→TFRRS-URL map. Predecessor of the stored-`tfrrs_url` idea |
| `scrapers/tfrrs/meet-scraper/{fetch-meet-list,scrape-meet-results,import-meet-results,import-new-athletes,import-relay-results}.js` | Manual 3-step pipeline superseded by `sync-weekend-results.js` (still usable for bulk backfills) |
| `scrapers/{entries,live,final,platforms,athletic-net}/` | Old athletic.net-era pipeline (entries, live polling, finals). Writes `live_results` (48 rows). Not scheduled |
| `scrapers/rosters/` | Roster diff/upload tooling (manual) |

---

## 4. Database (production Supabase)

Row counts 2026-07-09:

| Table | Rows | Notes |
|---|---:|---|
| `results` | 3,651,387 | **Dual-era** — see §5 |
| `athlete_prs` | 479,591 | From athlete-scraper PR parsing |
| `relay_athletes` | 455,842 | Leg-level relay membership |
| `relay_results` | 224,881 | Team relay marks |
| `athletes` | 147,749 | ⚠ ~19,386 dup rows by (name,school); 35,494 have no `tfrrs_athlete_id`; 39,066 Unattached (school 1835) |
| `athlete_team_seasons` | 130,017 | |
| `meets` | 12,724 | All `status='completed'` off-season; `season` labels inconsistent (1,428 bare `"indoor"`) |
| `teams` / `schools` | 3,607 / 1,832 | Team = school+gender; importers match by normalized school name |
| `live_results` | 48 | Legacy live pipeline remnant |
| `push_tokens`, `waitlist` | 1 each | Unlaunched features |
| `event_entries`, `meet_entries`, `events`, `conferences`, `conference_memberships`, `regions`, `external_ids` | **0** | Designed, never populated. App uses `event_name`/`meet_name` strings instead |

FKs exist (`results.athlete_id→athletes`, `results.team_id→teams`, `events.meet_id→meets`, …)
but **`results.meet_id` has no FK** and `results.meet_name` is free text.

Key `meets` columns: `meet_url` (Timing Site link — tap-through only), `tfrrs_url` (only **21**
rows), `athletic_net_results_url`, `wa_results_url`, `results_status`
(pending 12,676 / tfrrs_available 17 / imported 4), `season`, `level`, `end_date`.

---

## 5. The two eras of `results` (why things are confusing)

| Era | Rows | `meet_id` | Created | Source |
|---|---:|---|---|---|
| Athlete-history | 2,206,906 | **null** | 2025-11-26 → 2026-02-25 | athlete-scraper (profile pages; has `meet_name` string, often missing place/round) |
| Meet-linked | 1,444,924 | set | 2026-02-05 → 2026-06-15 | meet-scraper (full fields, relays) |

### How the app finds a meet's results — the fact that governs everything
`frontend/services/database-supabase.ts` (`getEventsByMeetWithGender`, `getEventResults`)
queries `results` by **`.eq('meet_name', name).eq('date', date)`**. The `meetId` parameter is
accepted **and never used**. Therefore:

- `meet_id` coverage is invisible to users today.
- A meet looks empty ⇔ its `meets.name`+`date` string-matches no `results.meet_name`+`date`.
- Audit (2026-07-09): **11,879 / 12,724 meets (93.4%) show results.** 845 look empty →
  **830 genuinely missing** (no results anywhere), **15 name/date mismatches**.
- Exact-date matching also misses day-2+ marks of multi-day meets (small: +3 meets).

This string seam is what has silently absorbed every naming inconsistency between USTFCCCA
(meets.name) and TFRRS (results.meet_name). It works 93% of the time and is unfixably fragile
the rest — hence the target state below.

---

## 6. Known defects (verified)

1. **Dual linkage, neither authoritative** — app reads name+date; new pipeline writes `meet_id` nothing reads.
2. **Stored-link model barely bootstrapped** — 21 `tfrrs_url` / 4 imports. Root cause: the meets
   scraper runs on *upcoming* meets, but USTFCCCA posts the TFRRS link *after* completion; only
   the `last_week` pass in `sync-results.yml` (added late May) catches it.
3. **Athlete duplication** — importers create a new athlete whenever a TFRRS id isn't found;
   name-only ("unattached") athletes never dedupe across runs. 85 duplicate TFRRS ids; ~19.4k
   name+school dup rows.
4. **Season labels** — `scrape_meets.js:490` hardcodes `'indoor'`. (Seasons span two calendar
   years: Indoor Dec–Mar, Outdoor Mar–Jun, XC Aug–Nov — never derive by calendar year.)
5. **Duplicate meets** — e.g. 542 vs 6101 (same NCAA DI XC champs); no uniqueness guard.
6. **Dead schema** — 7 empty tables; `events` FK'd but unused.
7. **Orphans** — 222 results reference deleted meets (94641: 207 rows, 94729: 15).
8. **830 meets** from last season with no results anywhere (scraper-miss backlog).

---

## 7. Target state (agreed direction)

1. **`meet_id` becomes the single authoritative linkage.**
   - Backfill `meet_id` on athlete-history rows by normalized name + date window (validated:
     99.8% unambiguous).
   - Migrate the two frontend query functions to `meet_id`.
   - Add FK `results.meet_id → meets` + index after backfill.
   - Keep `meet_name` as display/provenance text only.
2. **Meet discovery keeps capturing result links** (already trusts only labeled links); add a
   *completed-meets* link pass so `tfrrs_url` fills reliably; fix the season hardcode.
3. **One results engine** (`sync-weekend-results.js`) + one documented off-season backfill path;
   archive legacy scrapers out of the active tree.
4. **Athlete identity rule**: TFRRS id primary; constrained fallback for unattached; dedup pass
   with merge (repoint results/PRs/relays), then uniqueness constraints.
5. **Backfill the 830** missed meets via stored links where TFRRS has them (off-season,
   resumable background job).
6. **Drop or commit** each empty table (decide per table; default drop).

Work plan lives in `docs/DATABASE_CLEANUP_PLAN.md` (phases/jobs). History of wrong turns —
including the discarded "~10,300 empty meets" meet_id-based audit — is preserved there under
*Superseded* so nobody re-derives it.

---

## 8. Operational notes

- Scraper env: `scrapers/.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Root `.env` has
  `DB_PASSWORD` for direct Postgres (`db.<ref>.supabase.co:5432`, user `postgres`) — needed for
  heavy SQL (temp tables, DISTINCT over 3.6M rows) that times out through PostgREST.
- All import scripts are dry-run by default; `--commit` writes. Keep it that way.
- TFRRS rate limits: scrapers use 1.5–3s delays; athlete-scraper backs off 10min on 403.
- Off-season = safe window for backfills; in-season, avoid heavy writes during meet hours.
