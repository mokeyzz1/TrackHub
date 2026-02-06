# TFRRS Meet Results Scraper

Scrapes results from TFRRS meet pages. More efficient than athlete-by-athlete scraping since one meet page contains all athletes who competed.

## Advantages over Athlete Scraper

- **Captures school at time of competition** - Each result row has the school name directly
- **More efficient** - One meet page = hundreds of results
- **Cleaner data** - All data comes from the same structured table format

## Data Captured

For each result:
- `athlete_id` - From TFRRS URL
- `athlete_name` - Full name
- `event_name` - Event competed in
- `mark_raw` - Time or distance as displayed
- `mark_seconds` - Parsed time in seconds (for running events)
- `mark_meters` - Parsed distance in meters (for field events)
- `place` - Finishing position
- `school_name` - School at time of competition
- `team_id` - Matched to database teams table
- `year` - Class year (FR, SO, JR, SR)
- `meet_name` - Name of the meet
- `date` - Date of competition

## Usage

### 1. Fetch the list of meets to scrape

```bash
# Default: Dec 2025 to Jan 31, 2026
node fetch-meet-list.js

# Custom date range
node fetch-meet-list.js --start-date 2025-12-01 --end-date 2026-01-31
```

This creates `meets-to-scrape.json` with the list of college indoor meets.

### 2. Review and edit the meet list (optional)

Check `meets-to-scrape.json` and remove any meets you don't want to scrape.

### 3. Scrape meet results

```bash
node scrape-meet-results.js
```

Results are saved to `output/meet-results.json`. Progress is tracked in `output/scrape-progress.json` so you can resume if interrupted.

### 4. Import to database

```bash
# Dry run first
node import-meet-results.js

# Actually import
node import-meet-results.js --commit
```

## Files

| File | Purpose |
|------|---------|
| `fetch-meet-list.js` | Fetches list of college indoor meets from TFRRS calendar |
| `scrape-meet-results.js` | Main scraper - scrapes all events from each meet |
| `import-meet-results.js` | Import results to database with team_id matching |

## Output Files

- `meets-to-scrape.json` - List of meets to scrape
- `output/meet-results.json` - All scraped results
- `output/scrape-progress.json` - Progress tracking for resumable scraping

## Rate Limiting

The scraper uses a 3-second delay between requests to be respectful to TFRRS servers.

## Estimated Time

- ~332 meets in Dec 2025 - Jan 2026
- ~3 seconds per request
- Multiple events per meet (10-30 events)
- Estimated total: 3-5 hours for full scrape
