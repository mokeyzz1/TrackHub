# Scraper Status - Feb 3, 2025

## Batch 3 Scraper (Athletes Without Results)
- **Status**: STOPPED (needs resume)
- **Progress**: 1,227 / 12,310 athletes (10%)
- **Results scraped so far**: 3,663
- **PRs scraped so far**: 1,819

### To Resume:
```bash
cd /Users/mk/Projects/track-meet-tracker/scrapers/tfrrs
node scrape-athlete-results.js
```
(It will auto-resume from checkpoint)

### To Import After Complete:
```bash
node import-results-to-db.js
```

---

## Known Issues

### Transfer Data Bug (NEEDS FIX)
Old results show athlete's NEW school instead of the school they actually competed for.

**Root cause**: The `team_id` on results may be wrong - pointing to new school instead of old school.

**To investigate**:
1. Find a transfer athlete in the database
2. Check if their old results have correct `team_id`
3. The scraper might be using current team instead of the team from the meet

**Chain**: `results.team_id` → `teams.school_id` → `schools`

---

## Database Stats (as of Feb 3)
- Total athletes: 96,813
- Athletes with results: 84,503 (87%)
- Athletes with PRs: 79,862 (82%)
- Athletes missing results: 12,310 (being scraped in batch 3)

## Recent Changes Pushed
- Added `competed_for_school` to athlete results display
- Each meet card now shows which school athlete competed for
- This will work correctly once the data bug is fixed
