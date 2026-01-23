# Frontend - Track Meet Tracker

React Native mobile app built with Expo for tracking college track & field meets, athletes, and performances.

## Tech Stack

- **Framework:** React Native + Expo
- **Language:** TypeScript
- **Navigation:** Expo Router (file-based routing)
- **Database:** Supabase PostgreSQL (migrating from SQLite)
- **UI:** Custom design system
- **State:** React Context + Hooks

## Project Structure

```
frontend/
├── app/                  # Expo Router pages
│   ├── (tabs)/          # Bottom tab navigation
│   │   ├── index.tsx    # Home/Feed
│   │   ├── athletes.tsx # Athletes list
│   │   ├── meets.tsx    # Meets calendar
│   │   └── community.tsx# Social features
│   ├── athlete/         # Athlete detail pages
│   ├── meet/            # Meet detail pages
│   ├── school/          # School detail pages
│   ├── event/           # Event detail pages
│   ├── search.tsx       # Global search
│   └── compare-athletes.tsx
│
├── components/          # Reusable components
│   ├── ui/             # UI primitives
│   ├── charts/         # Data visualization
│   ├── filters/        # Filter components
│   ├── modals/         # Modal dialogs
│   └── ...
│
├── services/            # API/Database layer
│   └── database.ts     # Database queries
│
├── hooks/              # Custom React hooks
│   ├── useAthletes.ts
│   ├── useSchools.ts
│   └── ...
│
├── design-system/      # Design tokens
│   ├── colors.ts
│   ├── spacing.ts
│   └── typography.ts
│
├── constants/          # App constants
├── types/              # TypeScript types
└── assets/             # Images and data
    ├── images/
    └── data/
        └── track_hub.db # SQLite (legacy)
```

## Getting Started

### Prerequisites

- Node.js 20+ (use nvm)
- npm or yarn
- Expo CLI
- iOS Simulator (Mac) or Android Emulator

### Installation

```bash
cd frontend
npm install
```

### Running the App

```bash
# Start Expo dev server
npx expo start

# Run on iOS
npx expo start --ios

# Run on Android
npx expo start --android

# Run on web (experimental)
npx expo start --web
```

## Features

### Current Features ✅

- **Athletes Tab**
  - Browse athletes by division, gender
  - Search athletes by name
  - View detailed athlete profiles
  - Personal records (PRs)
  - Season bests (SBs)
  - Performance history
  - Results timeline

- **Compare Athletes**
  - Side-by-side comparison
  - Event-specific stats
  - Win percentage
  - Average times
  - Visual charts

- **School Profiles**
  - School information
  - Conference/division
  - Team rosters
  - Top performers

### In Progress 🚧

- **Meets Tab**
  - Upcoming meets calendar
  - Live meet results
  - Meet entries
  - Historical meet data

- **Live Results**
  - Real-time result updates via Athletic.net Live
  - Subscriptions to favorite athletes/schools
  - Push notifications

- **Community Features**
  - Follow athletes/schools
  - Comment on performances
  - Share results

## Database Migration

Currently migrating from SQLite to Supabase PostgreSQL:

### Current (SQLite)
```typescript
import { getDatabase } from '../services/database';

const db = await getDatabase();
const results = await db.getAllAsync(query, params);
```

### Future (Supabase)
```typescript
import { supabase } from '../services/supabase';

const { data, error } = await supabase
  .from('results')
  .select('*')
  .eq('athlete_id', athleteId);
```

## Supabase Setup

### Install Supabase Client

```bash
npm install @supabase/supabase-js
```

### Configuration

Create `services/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

Create `.env.local`:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Real-time Subscriptions

For live meet results:

```typescript
// Subscribe to live results for a meet
const subscription = supabase
  .channel('meet-results')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'results',
    filter: `meet_id=eq.${meetId}`
  }, (payload) => {
    console.log('New result:', payload.new);
    // Update UI with new result
  })
  .subscribe();

// Unsubscribe when done
subscription.unsubscribe();
```

## Styling

Using a custom design system with consistent tokens:

```typescript
import { colors } from '../design-system/colors';
import { spacing } from '../design-system/spacing';
import { typography } from '../design-system/typography';

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    backgroundColor: colors.background.primary,
  },
  title: {
    ...typography.heading1,
    color: colors.text.primary,
  },
});
```

## Performance Optimizations

- **Lazy Loading:** Use `React.lazy()` for heavy components
- **Memoization:** `useMemo` for expensive calculations
- **Virtual Lists:** `FlashList` for long lists
- **Image Optimization:** Cached and optimized images
- **Code Splitting:** Dynamic imports for routes

## Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

## Building for Production

### iOS

```bash
# Build for iOS
eas build --platform ios

# Submit to App Store
eas submit --platform ios
```

### Android

```bash
# Build for Android
eas build --platform android

# Submit to Play Store
eas submit --platform android
```

## Environment Variables

Create `.env.local`:

```bash
# Supabase
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# App Config
EXPO_PUBLIC_APP_ENV=development
EXPO_PUBLIC_API_URL=http://localhost:3000
```

## Troubleshooting

### Metro bundler issues

```bash
# Clear cache
npx expo start --clear

# Reset everything
rm -rf node_modules
npm install
npx expo start --clear
```

### iOS simulator issues

```bash
# Erase iOS simulator
npx expo run:ios --device

# Or use Xcode to reset simulator
```

### Android emulator issues

```bash
# Cold boot emulator
npx expo run:android

# Or restart adb
adb kill-server && adb start-server
```

## Contributing

1. Create feature branch from `main`
2. Make changes
3. Test on both iOS and Android
4. Submit pull request

## Future Enhancements

- [ ] Dark mode support
- [ ] Offline mode with sync
- [ ] Push notifications for live results
- [ ] Social features (follow, comment, share)
- [ ] Advanced analytics and charts
- [ ] Meet predictions based on historical data
- [ ] Athlete rankings and comparisons
- [ ] Export/share performance data
