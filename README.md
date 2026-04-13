# TrackHub

A mobile app for tracking college track & field athletes, meets, and performances. Live on the iOS App Store.

## What It Does

TrackHub solves a real problem: college track & field data is scattered across TFRRS, USTFCCCA, Athletic.net, and MileSplit. This app brings it all together into one mobile experience.

### Features

- **Live Leaderboards** - Weekly top performances ranked by World Athletics 2025 scoring
- **Meet Tracker** - Live, upcoming, and past meets with timing links
- **Athlete Profiles** - PRs, performance history, season progression
- **Head-to-Head** - Compare any two athletes side by side
- **Division Filtering** - D1, D2, D3, NAIA, JUCO coverage
- **School Pages** - Team rosters and school stats

## How It Works

The app pulls data from multiple sources using automated scrapers that run on a schedule. Results are normalized, scored using official World Athletics coefficients, and stored in a PostgreSQL database. The mobile app displays everything with smart caching for fast performance.

### Tech Stack

- **Mobile App**: React Native, Expo, TypeScript
- **Database**: Supabase (PostgreSQL)
- **Data Pipeline**: Node.js scrapers with Puppeteer & Cheerio
- **Automation**: GitHub Actions for scheduled scraping
- **Scoring**: World Athletics 2025 scoring tables

## Scale

| Metric | Count |
|--------|-------|
| Results | 2.8 million+ |
| Athletes | 123,000+ |
| Meets | 12,000+ |
| Schools | 1,800+ |

## Platform

iOS App Store
