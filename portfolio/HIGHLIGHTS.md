# TrackHub - Quick Highlights

## One-Line Summary
**Mobile app for college track & field that aggregates results from multiple sources and ranks athletes using official World Athletics scoring.**

---

## Key Stats

| Metric | Value |
|--------|-------|
| **Results Imported** | 2.8 million+ |
| **Athletes Tracked** | 123,000+ |
| **Meets in Database** | 12,000+ |
| **Schools** | 1,800+ |
| **Events Supported** | 100+ |
| **Platform** | iOS (App Store) |

---

## Tech Stack

**Frontend:** React Native, Expo, TypeScript, Expo Router
**Backend:** Supabase (PostgreSQL), Node.js
**Automation:** GitHub Actions, Puppeteer, Cheerio
**Deployment:** EAS Build, OTA Updates

---

## Top 5 Technical Achievements

### 1. Database Function Optimization
Reduced leaderboard queries from **45+ API calls to 1** by moving scoring logic to PostgreSQL.
- **Result:** 20-30x faster load times

### 2. Cloudflare Bypass
Implemented Puppeteer with stealth plugin to scrape Cloudflare-protected sites.
- **Result:** 100% scraper success rate

### 3. World Athletics Scoring
Built official WA 2025 scoring system with indoor/outdoor detection.
- **Result:** Fair cross-event athlete comparison

### 4. Smart Meet Matching
Created fuzzy matching algorithm with manual mappings for NCAA championships.
- **Result:** 9.5x improvement in match rate (6% → 57%)

### 5. Multi-Layer Caching
Implemented AsyncStorage + in-memory caching with 5-minute TTL.
- **Result:** 80% reduction in API calls

---

## Key Features

- **Live Leaderboards** - Weekly top performances by WA score
- **Meet Tracker** - Live, upcoming, past meets with timing links
- **Athlete Profiles** - PRs, history, progression charts
- **Head-to-Head** - Compare any two athletes
- **Division Filtering** - D1, D2, D3, NAIA, JUCO
- **Push Notifications** - PR alerts (coming soon)

---

## Problem Solved

College track data is fragmented across TFRRS, USTFCCCA, Athletic.net, and MileSplit. TrackHub unifies everything into a single mobile-first experience with intelligent scoring and real-time updates.

