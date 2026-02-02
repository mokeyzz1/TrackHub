# TFRRS Results Scraper

Scrapes historical results for athletes from their TFRRS profile pages.

## Setup

Make sure you're in the project root and have dependencies:

```bash
cd /Users/mk/Projects/track-meet-tracker
npm install cheerio  # if not already installed
```

## Usage

### Step 1: Get Athletes Needing Data

First, export the list of athletes who don't have results:

```bash
cd scrapers/tfrrs
node get-athletes-needing-data.js
```

This creates:
- `../output/athletes-needing-data.json` - Full athlete data
- `../output/athlete-ids-needing-data.json` - Just the IDs

### Step 2: Run the Scraper

**Test with a few athletes first:**
```bash
node scrape-athlete-results.js --test 5
```

**Run full scrape (can resume if interrupted):**
```bash
node scrape-athlete-results.js
```

**Start fresh (ignore previous checkpoint):**
```bash
node scrape-athlete-results.js --fresh
```

### Step 3: Review the Data

Check the output files:
- `./output/scraped-results.json` - All scraped results
- `./output/scraper-errors.json` - Any errors encountered
- `./logs/scrape-YYYY-MM-DD.log` - Detailed log

### Step 4: Import to Database

**Dry run (see what would be imported):**
```bash
node import-results-to-db.js
```

**Actually import:**
```bash
node import-results-to-db.js --commit
```

## Files

```
scrapers/tfrrs/
├── config.js                    # Configuration (timeouts, delays, etc.)
├── get-athletes-needing-data.js # Export athletes without results
├── scrape-athlete-results.js    # Main scraper
├── import-results-to-db.js      # Import JSON to database
├── README.md                    # This file
├── output/
│   ├── athletes-needing-data.json   # Athletes to scrape
│   ├── scraped-results.json         # Scraped results
│   ├── scraper-checkpoint.json      # Resume point
│   └── scraper-errors.json          # Errors log
└── logs/
    └── scrape-YYYY-MM-DD.log        # Daily log files
```

## Configuration

Edit `config.js` to adjust:

| Setting | Default | Description |
|---------|---------|-------------|
| DELAY_BETWEEN_REQUESTS | 1500ms | Wait between requests (be nice to TFRRS) |
| DELAY_ON_ERROR | 5000ms | Wait after an error |
| DELAY_ON_RATE_LIMIT | 30000ms | Wait if rate limited |
| REQUEST_TIMEOUT | 30000ms | Timeout per request |
| MAX_RETRIES | 3 | Retry attempts per athlete |
| BATCH_SIZE | 100 | Save checkpoint every N athletes |

## Overnight Runs

The scraper is designed for overnight runs:

1. **Resume capability** - If interrupted, just run again to continue
2. **Checkpoints** - Progress saved every 100 athletes
3. **Logging** - All activity logged to file
4. **Rate limiting** - 1.5s between requests to avoid overloading TFRRS
5. **Error handling** - Errors logged but don't stop the scraper

**Estimated time for 76,000 athletes at 1.5s/request:**
- ~32 hours total
- Can run over multiple nights

## Troubleshooting

**"Athletes file not found"**
Run `get-athletes-needing-data.js` first.

**Many errors**
Check `scraper-errors.json`. Common issues:
- 404 errors: Athlete profile doesn't exist on TFRRS
- Timeout: TFRRS was slow, scraper will retry

**Resume not working**
Delete `./output/scraper-checkpoint.json` to start fresh.
