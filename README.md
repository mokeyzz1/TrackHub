# TrackHub

A mobile app for tracking college track & field athletes, meets, and performances.

## Features

- **Top Performances** - Weekly leaderboards with World Athletics scoring
- **Athlete Profiles** - Stats, PRs, event history, season progression
- **Athlete Comparison** - Head-to-head comparisons with charts
- **Meet Results** - Browse meets and view detailed results
- **School Pages** - Team rosters and school stats
- **Search** - Find athletes and schools

## Tech Stack

- **Frontend**: React Native + Expo
- **Database**: Supabase (PostgreSQL)
- **Scoring**: World Athletics 2025 scoring tables

## Project Structure

```
track-meet-tracker/
├── frontend/           # React Native app
│   ├── app/           # Screens (Expo Router)
│   ├── components/    # UI components
│   ├── hooks/         # Custom hooks
│   ├── services/      # Database/API services
│   └── design-system/ # Colors, typography
├── scrapers/          # Data collection scripts
│   ├── tfrrs/        # TFRRS scraper
│   └── athletic-net/ # Athletic.net scraper
├── supabase/         # Database migrations
└── docs/             # Documentation
```

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI
- iOS Simulator or Android Emulator

### Setup

```bash
# Install dependencies
cd frontend
npm install

# Start the app
npx expo start
```

### Environment Variables

Create `frontend/.env`:

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

## Screens

| Screen | Description |
|--------|-------------|
| Home | Top performances with week/division filters |
| Meets | Upcoming and past meets |
| Athletes | Browse and search athletes |
| Community | Coming soon features |
| Athlete Profile | Individual athlete stats and history |
| Compare Athletes | Head-to-head comparison |
| Meet Details | Full meet results by event |
| School Page | Team roster and stats |

## Data Sources

- **TFRRS** - College track & field results
- **Athletic.net** - Additional athlete data

## Scoring

Uses World Athletics 2025 scoring tables with:
- Indoor/outdoor detection (via 60m events)
- Separate coefficients for short track (indoor) events
- Field event scoring

## License

Private - All rights reserved
