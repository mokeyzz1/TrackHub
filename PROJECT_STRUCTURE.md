# Track Meet Tracker - Project Structure

This project is organized into separate frontend and backend directories for better maintainability and scalability.

## Directory Structure

```
track-meet-tracker/
├── frontend/              # React Native mobile app
│   ├── app/              # Expo Router app directory
│   ├── components/       # Reusable UI components
│   ├── hooks/            # Custom React hooks
│   ├── services/         # API and database services
│   ├── design-system/    # UI design tokens and styles
│   ├── assets/           # Images, fonts, and static files
│   ├── contexts/         # React Context providers
│   ├── constants/        # App constants
│   ├── types/            # TypeScript type definitions
│   ├── ios/              # iOS native build
│   ├── android/          # Android native build
│   └── package.json      # Frontend dependencies
│
├── backend/              # Backend services and data
│   ├── supabase/         # Supabase configuration
│   │   ├── functions/    # Edge Functions
│   │   └── migrations/   # SQL migrations
│   ├── server/           # API server (if needed)
│   └── scripts/          # Data scraping and migration scripts
│       ├── *.py          # Python scraping scripts
│       ├── data/         # Scraped data files
│       ├── database/     # Database utilities
│       └── track_hub.db  # SQLite database (legacy)
│
└── shared/               # Shared types/interfaces
    └── types.ts          # Shared TypeScript types
```

## Tech Stack

### Frontend
- **Framework:** React Native with Expo
- **Language:** TypeScript
- **Navigation:** Expo Router
- **Database (current):** SQLite via expo-sqlite
- **Database (future):** Supabase PostgreSQL

### Backend
- **Platform:** Supabase
- **Database:** PostgreSQL
- **Scraping:** Python with BeautifulSoup/Selenium
- **Real-time:** Supabase Subscriptions
- **Functions:** Supabase Edge Functions (Deno)

## Data Sources

- **TFRRS.org** - College track & field results database
- **Athletic.net Live** - Live meet results (all timing companies)
- **School Conferences** - NCAA D1/D2/D3, NAIA, NJCAA

## Current Data Volume

- **2.2M+ results** across all divisions
- **Schools:** D1, D2, D3, NAIA, NJCAA
- **Athletes:** Active roster data
- **Meets:** Historical meet data

## Migration Plan

Moving from SQLite (local) to Supabase + PostgreSQL (cloud):

1. Create PostgreSQL schema matching SQLite structure
2. Write migration script to transfer 2.2M results
3. Set up Supabase client in React Native
4. Create Edge Functions for scraping logic
5. Update app to use Supabase instead of SQLite
6. Implement real-time subscriptions for live meets

## Development

### Frontend Development
```bash
cd frontend
npm install
npx expo start
```

### Backend Scripts
```bash
cd backend/scripts
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scrape_rosters.py
```

## Documentation

- `DOCUMENTATION.md` - Full project documentation
- `README_TRACK_HUB.md` - Track Hub app overview
- `COLLEGE_DATA_GUIDE.md` - College data structure guide
