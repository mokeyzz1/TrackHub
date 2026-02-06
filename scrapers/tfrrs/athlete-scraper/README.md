# TFRRS Athlete Profile Scraper

Scrapes individual athlete profiles from TFRRS to get their historical results and PRs.

## Status: MOSTLY COMPLETE

- 12,217 / 12,310 athletes scraped (99%)
- 95,701 results collected
- Scraper still running for final ~93 athletes

## Known Issues (Fixed)

### 1. Missing `team_id` / `school_name`
**Problem:** Original scraper didn't capture which school the athlete competed for. This caused transfer athletes to show their current school for ALL results.

**Fix:** Updated `scrape-athlete-results.js` to:
- Detect "Competing for [School]" sections on TFRRS pages
- Capture `school_name` for each result
- Capture `round` (F=Final, P=Prelim)

**Fix:** Updated `import-results-to-db.js` to:
- Fetch ALL teams (not just first 1000)
- Look up `team_id` from `school_name`

### 2. NULL dates hiding results
**Problem:** ~526,000 results had NULL dates and were hidden from frontend queries.

**Fix:** Created `backfill-null-dates.js` to look up dates from other results at the same meet.

### 3. Backfill script for existing data
Created `backfill-team-ids.js` to:
- Re-scrape athletes with NULL team_id results
- Match scraped results to DB and update team_id
- Fixed ~15,000+ results

## Files

| File | Purpose |
|------|---------|
| `scrape-athlete-results.js` | Main scraper - fetches athlete profiles and parses results |
| `import-results-to-db.js` | Imports scraped JSON to Supabase |
| `backfill-team-ids.js` | Fixes NULL team_id on existing results |
| `backfill-null-dates.js` | Fixes NULL dates on existing results |
| `get-athletes-needing-data.js` | Generates list of athletes to scrape |
| `config.js` | Configuration (paths, rate limits) |
| `output/` | Scraped data JSON files |
| `logs/` | Scraper logs |

## Usage

```bash
# Generate athlete list
node get-athletes-needing-data.js

# Run scraper (resumes from checkpoint)
node scrape-athlete-results.js

# Start fresh
node scrape-athlete-results.js --fresh

# Test with 5 athletes
node scrape-athlete-results.js --test 5

# Import to database (dry run)
node import-results-to-db.js

# Import to database (commit)
node import-results-to-db.js --commit

# Backfill team_id (dry run)
node backfill-team-ids.js

# Backfill team_id (commit)
node backfill-team-ids.js --commit
```

## Notes

- Rate limited to 2-4 seconds between requests to avoid 403 errors
- Checkpoint saved every 100 athletes
- Results scraped with OLD code (before Feb 3 2025) don't have `school_name`
- For transfer athletes, need to backfill or re-scrape to get correct `team_id`
