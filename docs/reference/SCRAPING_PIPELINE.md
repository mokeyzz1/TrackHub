# Intelligent Meet Scraping Pipeline

## Overview

The scraping system now automatically detects meet status and routes to the appropriate scraper.

## Architecture

```
Meet → Status Detection → Smart Router → Appropriate Scraper → Database
```

### 1. Status Detection (`detect_meet_status.js`)

Analyzes the meet page HTML to determine:
- **upcoming**: Meet hasn't started yet (0 events completed)
- **live**: Meet in progress (some events completed)
- **completed**: Meet finished (all events completed)

**Platforms supported:**
- MileSplit (high confidence)
- Athletic.net (medium confidence)
- JDL FastTrack (medium confidence)

### 2. Smart Router (`smart_meet_scraper.js`)

Routes based on detected status:

| Status | Scraper | Target Table | Data Type |
|--------|---------|--------------|-----------|
| `upcoming` | `scrape_event_entries.js` | `event_entries` | Starting lists, heat sheets, seed times |
| `live` | `scrape_live_results_smart.js` | `live_results` | Real-time results, is_final=false |
| `completed` | `scrape_final_results.js` | `live_results` | Final results, is_final=true |

### 3. Database Schema Updates

**meets table:**
```sql
ALTER TABLE meets ADD COLUMN status TEXT DEFAULT 'upcoming';
-- Values: 'upcoming', 'live', 'completed'
```

**live_results table:**
```sql
ALTER TABLE live_results ADD COLUMN team_name TEXT;
ALTER TABLE live_results ADD COLUMN is_final BOOLEAN DEFAULT FALSE;
```

## Usage

### Automatic (Recommended)
```bash
# Detects status and scrapes appropriately
node scripts/smart_meet_scraper.js <meet_id>
```

### Manual Status Detection
```bash
# Just check status without scraping
node scripts/detect_meet_status.js <meet_url>
```

### Legacy Manual Scrapers
```bash
# Force entries scraping (for upcoming meets)
node scripts/scrape_event_entries.js <meet_id>

# Force final results scraping (for completed meets)
node scripts/scrape_final_results.js <meet_id>
```

## Data Flow Examples

### Example 1: Upcoming Meet
```
Input: Meet scheduled for tomorrow
Status: upcoming (0/44 events completed)
Action: Scrape starting lists → event_entries table
Result: Heat sheets, lane assignments, seed times available
```

### Example 2: Live Meet
```
Input: Meet happening now
Status: live (15/44 events completed)
Action: Scrape current results → live_results (is_final=false)
Result: Real-time leaderboard updates every 10-30 seconds
```

### Example 3: Completed Meet
```
Input: Meet finished yesterday
Status: completed (44/44 events completed)
Action: Scrape final results → live_results (is_final=true)
Result: Official final results with places and marks
```

## Status Detection Logic

### MileSplit
Looks for "Completed" text in event divs:
- All events have "Completed" → status='completed'
- Some have "Completed" → status='live'
- None have "Completed" → status='upcoming'

### Athletic.net
Searches for status indicators and final result markers

### JDL FastTrack
Checks for "Live Results" or "Final Results" keywords in page body

## Automation Strategy

### Recommended Scraping Schedule

**3-4 days before meet:**
```bash
# Discover meets
node scripts/scrape_college_meets.js
```

**1-2 days before meet:**
```bash
# Get event lists and starting lists
node scripts/smart_meet_scraper.js <meet_id>
# Will automatically scrape entries since status='upcoming'
```

**During meet (every 10-30 seconds):**
```bash
# Get live results
node scripts/smart_meet_scraper.js <meet_id>
# Will automatically scrape live results since status='live'
```

**After meet:**
```bash
# Get final results
node scripts/smart_meet_scraper.js <meet_id>
# Will automatically scrape final results since status='completed'
```

## Files in Pipeline

| File | Purpose |
|------|---------|
| `detect_meet_status.js` | Status detection utility |
| `smart_meet_scraper.js` | Intelligent router |
| `scrape_event_entries.js` | Starting lists scraper |
| `scrape_live_results_smart.js` | Live results scraper (TODO) |
| `scrape_final_results.js` | Final results scraper |
| `scrape_meet_details.js` | Event list scraper |
| `scrape_college_meets.js` | Meet discovery scraper |

## Next Steps

1. ✅ Build status detector
2. ✅ Build smart router
3. ✅ Build final results scraper
4. ⏳ Build live results scraper
5. ⏳ Test with live meet
6. ⏳ Set up automated scheduling (cron jobs)
7. ⏳ Add webhook notifications for status changes

## Benefits

1. **No manual decision-making** - System auto-detects what to scrape
2. **Prevents data mismatches** - Won't put results in entries table
3. **Efficient** - Only scrapes relevant data based on status
4. **Scalable** - Can run on hundreds of meets automatically
5. **Maintainable** - Single entry point (`smart_meet_scraper.js`)
