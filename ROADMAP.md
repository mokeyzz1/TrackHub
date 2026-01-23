# Track Hub Roadmap

## Current Status (Jan 22, 2026)

### Completed
- **Athletes Database**: 96,813 athletes from TFRRS
- **Teams & Schools**: Full college roster data
- **Seasons Support**: 2024-2025 and 2025-2026 seasons in `athlete_team_seasons`
- **Meets Scraper**: Auto-scrapes USTFCCCA (Mon/Thu/Fri)
- **Meets Database**: 273 meets with timing platform detection
- **Live Results Infrastructure**: Database schema, scrapers built (needs testing)

### In Progress
- Live results scrapers (testing this weekend Jan 24-25)
- Athletic.net family scraper (99 meets)

---

## Version 1 (MVP) - Target: Launch Soon

**Goal**: Ship core value fast, test market fit

### Core Features

- [ ] Athletes search and browse
- [ ] Team rosters by school
- [ ] Meets list (upcoming/completed)
- [ ] Meet detail → **WebView** to timing site (in-app browser)
- [ ] Basic UI polish

### Data Features (powered by final results)

- [ ] **Athlete Profiles** - Show completed results for each athlete
- [ ] **Weekly Leaderboards** - Best performances from the past week
- [ ] **Event Rankings** - Top times by event (100m, mile, etc.)
- [ ] **PR Tracking** - Personal records per athlete
- [ ] **Trending Athletes** - Who had big performances this week
- [ ] **Meet Results Page** - Browse completed meet results

### How V1 Data Works

```
Weekend Meets (Fri/Sat)
         ↓
User watches live via WebView (timing site link)
         ↓
Meet Ends
         ↓
Final Results Scraper runs (Sun/Mon morning)
         ↓
Results stored in database → linked to athlete_id
         ↓
Monday: Weekly leaderboards, athlete stats updated
```

**Key insight**: Weekly stats/leaderboards only update AFTER weekend meets complete.
Scraper runs Sunday night or Monday morning to pull all final results.

### Why WebView for live meets

- Keeps users in app (easy back navigation)
- No complex scraping needed in UI
- Works with any timing platform
- Lower risk if timing sites change

### Not in V1

- Native live results display during meets
- Push notifications
- User accounts

---

## Version 2 - Native Live Results

**Goal**: Full live experience in app

**Features**:
- [ ] Native live results display (from scrapers)
- [ ] Favorite athletes tracking
- [ ] Push notifications for athlete results
- [ ] Results linked to athlete profiles
- [ ] Historical results per athlete

**Backend (already built)**:
- `live_results_scraper/` - entries, live, final scrapers
- `meet_entries` table - pre-match athlete linking
- `live_results` table - real-time results storage
- Athlete matcher - name → athlete_id

---

## Version 3+ - Community & Social

**Features**:
- [ ] User authentication/login
- [ ] User profiles
- [ ] Follow athletes/teams
- [ ] Comments/reactions on results
- [ ] Community posts
- [ ] Predictions/picks

---

## This Weekend (Jan 24-25, 2026)

**Testing live results scrapers**:

```bash
cd live_results_scraper/scripts

# Friday - scrape entries
node entries_scraper.js

# During meet - live polling
node live_scraper.js <meet_id>

# Sunday/Monday - final results
node final_scraper.js
```

**Test meets**:
- Meet 123: Aurora Grand Prix
- Meet 126: Shane Stevens Winter Invitational
- Meet 127: Gulden Invitational

---

## Next Steps (Tomorrow - Jan 23)

### For V1 Data Features

- [ ] **TFRRS Final Results Scraper** - Most reliable source for official results
- [ ] **Results → Athlete linking** - Ensure final results get athlete_id matched
- [ ] **Database queries** - Leaderboards, weekly stats, athlete history

### For Testing (This Weekend Jan 24-25)

- [ ] Test entries scraper on Friday
- [ ] Test live scraper during a meet
- [ ] Test final scraper on Sunday/Monday
- [ ] Verify athlete matching works

---

## Technical Debt / Future Improvements

- [ ] MileSplit scraper (15 meets)
- [ ] PT Timing scraper (9 meets)
- [ ] Finish Timing scraper (9 meets)
- [ ] Improve athlete matching accuracy
- [ ] Handle relay teams properly
- [ ] Field events support
