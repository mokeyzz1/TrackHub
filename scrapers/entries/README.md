# Entries Scraper

Scrapes pre-meet entries (who's entered in each event) before meets start.

## When to Run

- **Thursday/Friday evening** - after entries are posted (usually evening before meet)
- Entries are typically posted 12-24 hours before the meet starts

## Usage

```bash
cd scrapers

# Scrape all upcoming meets (next 3 days)
node entries/entries_scraper.js

# Scrape a specific meet by ID
node entries/entries_scraper.js <meet_id>

# Scrape next 7 days
node entries/entries_scraper.js --week

# Skip athlete matching
node entries/entries_scraper.js --skip-match
```

## What It Does

1. Finds upcoming meets with timing URLs from database
2. Scrapes entries from timing platform (Athletic.net, etc.)
3. Stores entries in `meet_entries` table
4. Matches athlete names to `athlete_id` using athlete_matcher

## Database Table

Entries are stored in `meet_entries`:

```sql
entry_id BIGSERIAL PRIMARY KEY
meet_id BIGINT           -- Links to meets table
event_name TEXT          -- "100m", "Mile", etc.
athlete_name TEXT        -- Raw scraped name
team_name TEXT
seed_time TEXT           -- "10.50", "4:05.00", etc.
athlete_id BIGINT        -- Matched to athletes table
match_confidence DECIMAL
heat INTEGER
lane INTEGER
scraped_at TIMESTAMP
```

## Supported Platforms

| Platform | Status |
|----------|--------|
| Athletic.net | ✅ Working |
| MileSplit | TODO |
| PT Timing | TODO |

## Output

- Logs saved to `logs/entries_YYYY-MM-DDTHH-MM-SS.log`
- Summary printed to console

## Example Output

```
============================================================
ENTRIES SCRAPER
Started: 2026-01-24T18:00:00.000Z
============================================================

Found 5 meets to scrape

──────────────────────────────────────────────────
Meet: Example Indoor Classic
Date: 2026-01-25
Platform: athletic_net
URL: https://www.athletic.net/TrackAndField/meet/123456
Scraping entries...
Found 245 entries across 18 events
Stored 245 entries in database
Matching athletes...
Matched 198 athletes

============================================================
COMPLETE
Total entries scraped: 245
Total athletes matched: 198
============================================================
```
