# Overnight Data Backfill Plan

Batch of production-data backfill jobs to run **off-hours** (they write to production
Supabase and/or run browser scrapes per meet, so they are slow and should not run
during peak app use). Nothing here has been executed yet — this is a to-do list.

## Job 1: Fix stale `meets.meet_url` links — ✅ DONE 2026-07-09

Executed via `scrapers/meets/fix_meet_urls.js --commit` (Option 3, no re-scrape).
Detection re-run on the day found **271** flagged of 1797 meets with a non-null
`meet_url` (the original 2026-06-10 scan's ~274, minus a false-positive class: a `/`
path *with* a query string such as `results.leonetiming.com/?mid=NNN` is a valid
results link and must not be nulled — the fix script now excludes these).

Applied: **182** athletic.net hubs rewritten `.../meet/NNN` → `.../meet/NNN/results`
(verified HTTP 200 with real event links via stealth puppeteer) and **89** junk links
nulled (68 register + 16 vendor homepage + 5 other homepage). 271 applied, 0 failed.
Post-run detection: 0 flagged. Note: original values of the 89 nulled junk links were
not durably preserved (they were register/homepage links; only 1 had an alternate
result link). The 182 rewrites are reversible by stripping `/results`.

### Background
The meets scraper used to guess the timing/results link with a keyword-scoring
heuristic (`scoreLink`). It over-weighted `athletic.net` and grabbed the wrong link
(meet hub, registration page, or a timing vendor's homepage) whenever the page had
no `"Timing Site"`-labeled link yet. That heuristic has now been removed — the
scraper trusts the `"Timing Site"` label only (`scrape_meets.js` / `scrape_meets_github.js`).

New meets and any meet still inside the scrape window self-heal on the next run.
**Completed meets outside the window do not** — they keep the wrong URL. This job
fixes those.

### Scope (as scanned 2026-06-10)
274 completed meets have a `meet_url` matching the old heuristic's mistakes:

| Count | Pattern | Notes |
|------:|---------|-------|
| 182 | `athletic.net/.../meet/NNN` (hub, no `/results`) | Salvageable → rewrite to `.../meet/NNN/results` |
| 68 | `athletic.net/.../meet/NNN/register` | Wrong — registration form. Null it or re-scrape. |
| 21 | bare vendor homepage (`leonetiming.com/`, `flashresults.com/`, `pttiming.com/`, …) | Useless — null it or re-scrape. |
| 3 | misc | 1 known false positive (`sporttrax.com/.../results` is valid). Eyeball these. |

(Soft suspects: ~1515 meets have `timing_platform = null` but a non-null `meet_url`.
Most are likely fine — `timing_platform` just was never populated. Not part of this job
unless we decide to recompute `timing_platform` from `meet_url` via `detectTimingPlatform`.)

### Detection logic (re-run before fixing — counts will have drifted)
Flag a `meet_url` as wrong when it matches any of:
- `/\/register(\/|$|\?)/i`            → register page
- `/google\.com\/search/i`            → "Info Search" link
- `/espn\.com|\/watch/i`              → broadcast link
- `/(facebook|instagram|youtube)\.com/i` → social/video
- bare homepage: path is `/` only on a known vendor host
- `/meet-history\?series=/i`          → USTFCCCA meet-history page
- athletic.net hub: `/athletic\.net\/.*\/meet\/\d+\/?$/i` (no `/results`)

NB: the earlier scan's social-media regex (`x\.com\/`) false-matched `sporttrax.com/`.
Anchor host regexes to avoid this.

### Remediation options (decide at run time)
1. **Re-scrape from USTFCCCA** — most correct. Re-fetch each meet page, overwrite
   `meet_url` with the `"Timing Site"` link (null if absent). Slow: one browser nav per meet.
2. **Null the junk only** — set `meet_url = null` for register + homepage links (~89).
   Leave athletic.net hubs as-is. Fast, conservative.
3. **Null junk + convert hubs** — null register/homepage, rewrite athletic.net hubs
   `…/meet/NNN` → `…/meet/NNN/results`. No re-scrape. Fixes all 274.

For **completed** meets, what actually matters for viewing results is `tfrrs_url` /
`athletic_net_results_url`, not `meet_url` — so option 2 or 3 is probably enough, and
re-scraping (option 1) is only worth it for meets with no result links at all.

## Job 2: Backfill missing meet-linked results

### Context
The `results` table is dual-purpose: rows with `meet_id` set power meet result pages
(~1.4M rows / ~1,572 meets); rows with `meet_id` null but `athlete_id` set are
athlete-history results (~2.2M rows) that power athlete profiles/PRs. So a meet with
"no results" only means no *meet-linked* rows — the athletes' marks usually still exist.

The current pipeline stores a reliable results link on the meet row and scrapes from it
(`scrapers/tools/scrape-and-import.js`) instead of guessing by meet name. Meets missing
results are the ones the old name-matcher failed on.

### Scope (audit 2026-07-09, meet-linked results by year)

| Year | Meets | Have results | Missing | Missing w/ link (ready) | Missing, no link |
|-----:|------:|-------------:|--------:|------------------------:|-----------------:|
| 2026 | 1,737 | 1,442 | 295 | **247** | 48 |
| 2025 | 2,306 | 128 | 2,178 | 0 | 2,178 |
| 2024 & older | ~8,700 | 0 | ~8,700 | 0 | ~8,700 |

### Jobs
- [ ] **2a (do first):** Backfill the **247** 2026 meets that already have a link but no
  results — run `scrape-and-import.js` against them. Highest value, lowest effort.
- [ ] **2b:** The 48 2026 meets with no link — scrape a link from USTFCCCA first
  (`meets/backfill_result_links.js`), then run 2a on them.
- [ ] **2c (big, optional):** 2025-and-older backlog has no stored links at all. Decide
  whether historical meet-linked results are worth the USTFCCCA link-scrape + import
  (athlete marks already exist via athlete-history). Likely filter by division/season.

## Run notes
- Run during off-hours; throttle writes (these hit production Supabase).
- Dry-run / log every intended change before committing it.
- `backfill_result_links.js` only fills `meet_url` when it is **empty**, so it will not
  overwrite the wrong values in Job 1 — Job 1 needs its own pass.
