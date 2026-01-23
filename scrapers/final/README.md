# Final Results Scraper

Scrapes official final results after meets complete. **TFRRS is the primary source.**

## When to Run

- **Sunday/Monday** after weekend meets
- Results typically posted to TFRRS within 24-48 hours of meet completion

## Usage

### TFRRS (Recommended)

```bash
cd scrapers

# 1. Scrape from TFRRS (saves to JSON file)
node final/tfrrs.js <tfrrs_url>

# Example:
node final/tfrrs.js https://www.tfrrs.org/results/94530/Tierney_Classic
# → Saves to output/tfrrs_results_XXXXX.json

# 2. Upload to database
node final/upload_tfrrs_json.js output/tfrrs_results_XXXXX.json
```

### Athletic.net Final Results

```bash
# For meets not yet on TFRRS
node final/final_scraper.js <meet_id>
```

## Why TFRRS?

| Source | Athlete Linking | Reliability | Speed |
|--------|-----------------|-------------|-------|
| **TFRRS** | ✅ Direct via tfrrs_athlete_id | ✅ Official results | 24-48 hrs |
| Athletic.net | ⚠️ Name matching | ✅ Good | Immediate |
| Other platforms | ⚠️ Name matching | Varies | Varies |

TFRRS is the authoritative source for college track results and provides direct athlete IDs that match our database.

## How TFRRS Scraper Works

1. Loads meet page from TFRRS
2. Extracts all events and results
3. Collects TFRRS athlete IDs from result links
4. Batch-queries our database to find matching `athlete_id`
5. Saves complete results with athlete links to JSON
6. Upload script inserts into `live_results` table

## Database Table

Final results are stored in `live_results` with `is_final=true`:

```sql
result_id BIGSERIAL PRIMARY KEY
meet_url TEXT            -- TFRRS URL
meet_name TEXT
event_name TEXT
participant_name TEXT
team_name TEXT
place INTEGER
mark_raw TEXT            -- "10.52", "4:05.33", "6.15m"
mark_seconds DECIMAL     -- Converted (running events only)
athlete_id BIGINT        -- Linked via tfrrs_athlete_id
result_type TEXT         -- 'final'
is_final BOOLEAN         -- true
date DATE
scraped_at TIMESTAMP
```

## Output

- JSON files saved to `output/tfrrs_results_XXXXX.json`
- Logs saved to `logs/`

## Example TFRRS Output

```
Meet: TFRRS
Date: January 18, 2026
Loading meet: https://www.tfrrs.org/results/94530/Tierney_Classic
Found 16 events
  Scraping: Mile
    26 results
  Scraping: 4 x 400 Relay
    2 results
  ...
Looking up 82 athletes by TFRRS ID...
Matched 82 athletes

Total: 115 results, 115 matched to athletes

Saved to: output/tfrrs_results_1769104035052.json
```

## Finding TFRRS URLs

1. Go to [tfrrs.org](https://www.tfrrs.org)
2. Search for the meet name
3. Click on the meet results
4. Copy the URL (format: `https://www.tfrrs.org/results/XXXXX/Meet_Name`)
