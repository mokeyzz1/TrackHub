# Live Results Scraper

Polls live results during meets as they happen.

## When to Run

- **Friday/Saturday** during active meets
- Polls every 20-30 seconds while meet is in progress
- Run for the duration of the meet (typically 4-8 hours)

## Usage

```bash
cd scrapers

# Poll live results for a specific meet
node live/live_scraper.js <meet_id>

# Example
node live/live_scraper.js 123
```

## What It Does

1. Connects to timing platform for the specified meet
2. Polls for new results every 20-30 seconds
3. Stores/updates results in `live_results` table
4. Links results to `meet_entries` when possible
5. Continues until meet is complete or manually stopped

## How It Works

```
┌─────────────────────────────────────────┐
│  Start: Get meet info from database     │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  Load entries for athlete matching      │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  Poll Loop (every 20-30 sec):           │
│  1. Fetch current results from platform │
│  2. Compare with stored results         │
│  3. Insert/update changed results       │
│  4. Log activity                        │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  Stop when: meet ends or Ctrl+C         │
└─────────────────────────────────────────┘
```

## Database Table

Results are stored in `live_results`:

```sql
result_id BIGSERIAL PRIMARY KEY
meet_id BIGINT
meet_url TEXT
event_name TEXT
participant_name TEXT
team_name TEXT
place INTEGER
mark_raw TEXT           -- "10.52", "4:05.33", "6.15m"
mark_seconds DECIMAL    -- Converted to seconds (running events)
athlete_id BIGINT       -- Matched athlete
entry_id BIGINT         -- Linked to meet_entries
result_type TEXT        -- 'live'
is_final BOOLEAN        -- false during meet
scraped_at TIMESTAMP
```

## Supported Platforms

| Platform | Status |
|----------|--------|
| Athletic.net | ✅ Working |
| live.athletic.net | ✅ Working |
| live.jdlfasttrack.com | ✅ Working |
| MileSplit | TODO |

## Output

- Logs saved to `logs/live_YYYY-MM-DDTHH-MM-SS.log`
- Real-time updates printed to console

## Tips

- Start the scraper 15-30 minutes before first event
- Keep terminal open during entire meet
- Use `screen` or `tmux` for long-running sessions
- Check logs if you need to review what was captured
