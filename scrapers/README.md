# Scrapers

All track & field data scrapers organized by purpose.

## Folder Structure

```
scrapers/
├── meets/          # USTFCCCA meets calendar
├── entries/        # Pre-meet entries (who's running what)
├── live/           # Live results during meets
├── final/          # Final results (TFRRS)
├── rosters/        # Athlete roster updates
├── platforms/      # Shared platform scrapers
├── shared/         # Shared utilities
└── package.json    # Shared dependencies
```

## Quick Reference

| Folder | What it does | When to run |
|--------|--------------|-------------|
| `meets/` | Scrape USTFCCCA meets calendar | Mon/Thu/Fri 6AM (GitHub Actions) |
| `entries/` | Scrape who's entered in each event | Fri evening (when posted) |
| `live/` | Poll live results during meet | Sat/Sun during meets |
| `final/` | Scrape official final results | Sun/Mon after meets |
| `rosters/` | Update athlete database | Periodically |

## Setup

```bash
cd scrapers
npm install
```

## Usage

### Meets (GitHub Actions)
```bash
# Runs automatically Mon/Thu/Fri via GitHub Actions
# Manual: node meets/scrape_meets_github.js [all|this_week|next_week]
```

### Entries
```bash
# All upcoming meets (next 3 days)
node entries/entries_scraper.js

# Specific meet
node entries/entries_scraper.js <meet_id>

# Next 7 days
node entries/entries_scraper.js --week
```

### Live Results
```bash
# Poll live results for a meet
node live/live_scraper.js <meet_id>
```

### Final Results (TFRRS)
```bash
# Scrape from TFRRS
node final/tfrrs.js <tfrrs_url>
# → Saves to tfrrs_results_XXXXX.json

# Upload to database
node final/upload_tfrrs_json.js <json_file>
```

### Rosters
```bash
cd rosters
python scrape_rosters.py        # Scrape TFRRS rosters
python generate_diff.py         # Generate diff from baseline
node upload_to_supabase.js      # Upload new athletes
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    MEETS CALENDAR                           │
│  meets/scrape_meets_github.js                               │
│  Mon/Thu/Fri 6AM UTC (GitHub Actions)                       │
│  → meets table                                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    ENTRIES                                  │
│  entries/entries_scraper.js                                 │
│  Fri evening (when entries posted)                          │
│  → meet_entries table (with athlete_id)                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    LIVE RESULTS                             │
│  live/live_scraper.js                                       │
│  Sat/Sun during meets (polls every 20-30 sec)               │
│  → live_results table                                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    FINAL RESULTS                            │
│  final/tfrrs.js + upload_tfrrs_json.js                      │
│  Sun/Mon after meets                                        │
│  → live_results table (is_final=true, athlete_id linked)    │
└─────────────────────────────────────────────────────────────┘
```

## Platform Support

| Platform | Entries | Live | Final | Scraper |
|----------|---------|------|-------|---------|
| TFRRS | - | - | ✅ | `final/tfrrs.js` |
| Athletic.net | ✅ | ✅ | ✅ | `platforms/athletic_net.js` |
| MileSplit | - | - | - | TODO |
| PT Timing | - | - | - | TODO |

## Environment Variables

Required in `.env` at project root:
```
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
```

For GitHub Actions, set as repository secrets:
```
SUPABASE_URL=xxx.supabase.co
SUPABASE_SERVICE_KEY=xxx
```
