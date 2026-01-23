# Meets Scraper

Scrapes college track meets from USTFCCCA and uploads to Supabase.

## Automatic Scraping (GitHub Actions)

The scraper runs automatically via GitHub Actions:
- **Schedule**: Monday, Thursday, and Friday at 6 AM UTC
  - Mon/Thu: Regular meet updates
  - Friday: Catches timing URLs posted right before weekend meets
- **Manual**: Can trigger from GitHub Actions tab anytime

### Setup GitHub Secrets

Go to your repo → Settings → Secrets and variables → Actions → New repository secret:

1. **SUPABASE_URL**: `hunbahsnaeeztmzqpnrl.supabase.co`
2. **SUPABASE_SERVICE_KEY**: Your Supabase service role key

That's it! The scraper will run automatically and update your meets.

### Manual Trigger

1. Go to Actions tab in GitHub
2. Select "Scrape College Meets"
3. Click "Run workflow"
4. Choose scope (all, this_week, next_week, next_month)

---

## Folder Structure

```
meets_scraper/
├── scripts/
│   ├── scrape_meets.js      # Main scraper
│   └── weekly_refresh.sh    # Cron-friendly wrapper
├── logs/                    # Scrape logs
├── output/                  # Summaries and exports
└── README.md
```

## Usage

### Manual Run

```bash
# Scrape this week + next week (default)
node scripts/scrape_meets.js

# Scrape specific scope
node scripts/scrape_meets.js this_week
node scripts/scrape_meets.js next_week
node scripts/scrape_meets.js next_month

# Scrape all scopes
node scripts/scrape_meets.js all
```

### Scheduled (Cron)

Add to crontab (`crontab -e`):

```bash
# Run every Monday at 6 AM
0 6 * * 1 /Users/mk/Projects/track-meet-tracker/meets_scraper/scripts/weekly_refresh.sh
```

Or use launchd on macOS (recommended):

```bash
# Load the plist (see setup instructions below)
launchctl load ~/Library/LaunchAgents/com.trackhub.meets-scraper.plist
```

## Data Source

- **USTFCCCA**: https://www.ustfccca.org/meets-results
- Scrapes: Meet name, date, location, timing/results links
- Updates Supabase `meets` table

## Supabase Table

```sql
meets (
  meet_id SERIAL PRIMARY KEY,
  name TEXT,
  date DATE,
  location TEXT,
  meet_url TEXT,          -- Link to live timing/results
  status TEXT,            -- 'upcoming', 'live', 'completed'
  level TEXT,             -- 'college', 'high-school'
  season TEXT,            -- 'indoor', 'outdoor'
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

## Logs

Logs are saved to `logs/` with timestamps:
- `scrape_YYYY-MM-DD_HHMMSS.log` - Individual scrape logs
- `weekly_YYYY-MM-DD_HHMMSS.log` - Weekly refresh logs

## Last Scrape Summary

After each run, a summary is saved to `output/last_scrape_summary.json`:

```json
{
  "timestamp": "2026-01-21T10:46:00.000Z",
  "scopes": ["this_week", "next_week"],
  "newMeets": 45,
  "updatedMeets": 5,
  "skippedMeets": 30
}
```
