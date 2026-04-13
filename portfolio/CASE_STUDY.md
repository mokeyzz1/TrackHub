# TrackHub: College Track & Field Mobile App

## Case Study

---

## Overview

**TrackHub** is a mobile application that solves a real problem for college track & field fans, athletes, and coaches: fragmented data across multiple platforms. I built a unified mobile experience that aggregates results from TFRRS, USTFCCCA, and Athletic.net, providing real-time meet tracking, official World Athletics scoring leaderboards, and comprehensive athlete profiles.

**Role:** Solo Developer & Designer
**Timeline:** 2024-2025
**Platform:** iOS (React Native/Expo)
**Status:** Live on App Store

---

## The Problem

College track & field data is scattered across multiple websites:
- **TFRRS** - Official results database
- **USTFCCCA** - Meet schedules and rankings
- **Athletic.net** - Live timing and entry lists
- **MileSplit** - High school and some college coverage

Fans who want to follow their favorite athletes or check live meet results must juggle multiple tabs, manually refresh pages, and piece together information. There's no mobile-first experience for the sport.

**Key Pain Points:**
1. No unified mobile app for college track results
2. Difficult to compare athletes across different events
3. No real-time notifications for PR alerts
4. Hard to discover upcoming meets

---

## The Solution

I built TrackHub to be the go-to mobile app for college track & field:

### Core Features

**1. Live Leaderboards with Official Scoring**
- Weekly top performances ranked by World Athletics 2025 scoring
- Filter by division (D1, D2, D3, NAIA, JUCO) and gender
- Compare a sprinter's 100m to a distance runner's 5000m fairly

**2. Meet Tracker**
- Live, upcoming, and past meets in one view
- Multi-day meet support
- Direct links to live timing

**3. Athlete Profiles**
- Complete performance history
- Personal records by event
- Season progression tracking
- Head-to-head comparison tool

**4. Push Notifications**
- PR alerts for followed athletes
- Live meet updates
- Championship results

---

## Technical Architecture

### System Overview

```
                    Data Sources
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    USTFCCCA          TFRRS        Athletic.net
         │               │               │
         └───────────────┼───────────────┘
                         │
                         ▼
              ┌──────────────────┐
              │  Node.js         │
              │  Scrapers        │
              │  (Puppeteer +    │
              │   Cheerio)       │
              └────────┬─────────┘
                       │
                       ▼
              ┌──────────────────┐
              │    Supabase      │
              │   PostgreSQL     │
              │                  │
              │  - 10+ tables    │
              │  - SQL functions │
              │  - WA scoring    │
              └────────┬─────────┘
                       │
                       ▼
              ┌──────────────────┐
              │  React Native    │
              │     + Expo       │
              │                  │
              │  - iOS           │
              │  - Smart caching │
              │  - Animations    │
              └──────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Mobile App** | React Native, Expo, TypeScript |
| **Navigation** | Expo Router (file-based) |
| **Database** | Supabase (PostgreSQL) |
| **Scrapers** | Node.js, Puppeteer, Cheerio |
| **Automation** | GitHub Actions |
| **Deployment** | EAS Build, OTA Updates |

---

## Technical Challenges & Solutions

### Challenge 1: Cross-Event Athlete Comparison

**Problem:** How do you fairly compare a 100m sprinter to a 5000m distance runner?

**Solution:** I implemented the official World Athletics 2025 scoring system, which uses quadratic equations to convert any performance into a 0-1600 point score.

```typescript
// WA Scoring Formula: points = a*x² + b*x + c
const coefficients = {
  "100m": [1.341, -233.012, 6385.543],
  "5000m": [0.000057, -1.308, 7496.136],
  // ... 100+ events
};
```

**Key Implementation Details:**
- Triple-layer scoring: Frontend (instant), Database (canonical), Backend (backfill)
- Indoor vs outdoor detection based on 60m event presence
- Event-specific coefficients for accurate comparison

---

### Challenge 2: Cloudflare Protection Bypass

**Problem:** USTFCCCA uses Cloudflare protection, blocking traditional HTTP scraping.

**Solution:** Implemented Puppeteer with the stealth plugin to mimic real browser behavior.

```javascript
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// Launches a real browser instance that bypasses bot detection
const browser = await puppeteer.launch({ headless: 'new' });
```

**Result:** 100% success rate on meet discovery after implementing stealth mode.

---

### Challenge 3: Meet Matching Across Platforms

**Problem:** The same meet has different names on different platforms:
- USTFCCCA: "NCAA Division I Indoor"
- TFRRS: "NCAA Division I Indoor Track & Field Championships"

**Solution:** Built a fuzzy matching algorithm with manual mappings for known variations.

```javascript
const MEET_NAME_MAPPINGS = {
  'ncaa division i indoor': 'ncaa division i indoor track',
  'ncaa division ii indoor': 'ncaa division ii indoor track',
  'neicaaa': 'neicaaa',
  // ...
};

function calculateSimilarity(name1, name2) {
  // Check manual mappings first
  // Then fuzzy match on normalized names
  // Finally check adjacent dates for multi-day meets
}
```

**Result:** Improved match rate from 6% to 57% for weekend results sync.

---

### Challenge 4: Performance at Scale

**Problem:** Calculating WA scores for thousands of performances was slow with individual queries.

**Solution:** Created a PostgreSQL function that handles scoring, deduplication, and filtering in a single database call.

```sql
CREATE FUNCTION get_top_performances(
  p_start_date DATE,
  p_end_date DATE,
  p_division TEXT,
  p_gender CHAR(1)
) RETURNS TABLE(...) AS $$
  -- Single query replaces 45+ client-side queries
  -- Handles indoor/outdoor detection
  -- Applies WA scoring with bounds checking
  -- Deduplicates best performance per athlete
$$;
```

**Impact:** Reduced API calls from 45+ to 1, with 5-minute AsyncStorage caching on the client.

---

## Design System

I created a sports-first design system with bold colors inspired by track meets:

### Color Palette

```
Primary Actions:    #FF6B35 (Track Orange)
Live/Alerts:        #FF69B4 (Hot Pink)
Gold Medals:        #FFD700 (Gold)
Division Colors:    D1 Red, D2 Blue, D3 Purple

Text:               High contrast black/white
Borders:            3-4px black (cartoon style)
```

### Visual Elements

- **Racing Stripes:** Animated diagonal patterns
- **Medal Ribbons:** Victory decorations for top 3
- **Speed Lines:** Motion effects for live events
- **Animated Cards:** Smooth fade-in/slide-in lists

---

## Data Pipeline

### Automated Scraping Schedule

| Workflow | Schedule | Purpose |
|----------|----------|---------|
| **Meets Scraper** | Mon, Thu, Fri 6AM UTC | Discover upcoming meets |
| **Results Sync** | Sun 10PM, Mon 8AM | Import weekend results |
| **Status Check** | Hourly (Wed-Sun) | Update live/completed status |

### Processing Pipeline

```
1. Scrape meets from USTFCCCA
   ↓
2. Match to TFRRS by name/date
   ↓
3. Parse results (times, distances)
   ↓
4. Normalize event names (100+ variations → standard)
   ↓
5. Apply WA scoring
   ↓
6. Import to Supabase with deduplication
```

---

## Impact & Results

### By the Numbers

| Metric | Value |
|--------|-------|
| Results Imported | 2.8 million+ |
| Athletes Tracked | 123,000+ |
| Meets in Database | 12,000+ |
| Schools | 1,800+ |
| Events Supported | 100+ |
| Division Coverage | D1, D2, D3, NAIA, JUCO |

### Technical Achievements

- **45x fewer queries** with database functions
- **80% reduced API calls** with smart caching
- **100% scraper success** after Cloudflare bypass
- **57% meet matching** (up from 6%)

---

## Key Learnings

### What Worked Well

1. **Database Functions > Client Queries**
   - Moving scoring logic to PostgreSQL simplified the frontend
   - Single source of truth for calculations

2. **Multi-Layer Caching**
   - AsyncStorage for persistence
   - In-memory for instant tab switching
   - 5-minute TTL balances freshness and performance

3. **GitHub Actions for Automation**
   - Eliminated manual data updates
   - Scheduled at optimal times for fresh data

### Challenges Overcome

1. **Event Name Normalization**
   - 100+ variations of event names required extensive regex
   - Built a comprehensive mapping system

2. **Multi-Day Meet Handling**
   - Results spread across 2-3 days
   - Implemented date range matching

3. **Rate Limiting**
   - TFRRS throttles requests
   - Added 1.5s delays with exponential backoff

---

## Future Roadmap

- **Community Features:** Comments, following athletes, team creation
- **Live Tracking:** Real-time results from timing platforms
- **Advanced Analytics:** Season progression, injury tracking
- **User Accounts:** Cloud sync for favorites and preferences

---

---

*This case study demonstrates full-stack development, data engineering, performance optimization, and mobile UX design for a real-world application serving the college track & field community.*
