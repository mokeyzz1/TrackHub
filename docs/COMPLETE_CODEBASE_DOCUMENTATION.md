# TrackHub - Complete Codebase Documentation

**Last Updated:** February 12, 2026

TrackHub is a React Native/Expo mobile application for tracking collegiate track and field performances, results, and athletes. It features real-time meet results, athlete comparisons using World Athletics scoring, and comprehensive data from TFRRS (Track & Field Results Reporting System).

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Database Schema](#database-schema)
4. [Frontend Architecture](#frontend-architecture)
5. [Screens](#screens)
6. [Components](#components)
7. [Hooks](#hooks)
8. [Services](#services)
9. [Design System](#design-system)
10. [Scrapers](#scrapers)
11. [Configuration](#configuration)
12. [Type Definitions](#type-definitions)

---

## Project Overview

### Application Purpose
TrackHub serves as a comprehensive platform for college track and field enthusiasts to:
- View top weekly performances ranked by World Athletics scoring
- Track upcoming and past meets
- Browse and compare athlete statistics
- Follow specific athletes and schools
- View live meet results

### Key Features
- **Top Performances**: Weekly rankings using World Athletics (WA) scoring coefficients
- **Meet Tracking**: Upcoming, live, and past meets with full results
- **Athlete Profiles**: Personal records, meet history, relay participations
- **Athlete Comparison**: Side-by-side comparison with head-to-head records
- **School Profiles**: Team rosters with filtering by gender, class year, and season
- **Search**: Global search for athletes and schools
- **Favorites**: Bookmark athletes and schools for quick access
- **Sharing**: Generate shareable images of performances

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Frontend Framework | React Native with Expo SDK 52 |
| Navigation | Expo Router (file-based routing) |
| Database | Supabase (PostgreSQL) |
| State Management | React Context + Custom Hooks |
| Styling | React Native StyleSheet |
| Icons | @expo/vector-icons (Ionicons) |
| Animations | react-native-reanimated |
| Charts | react-native-svg |
| Image Sharing | expo-sharing + react-native-view-shot |

---

## Database Schema

The database uses PostgreSQL via Supabase with Row Level Security (RLS) enabled for all tables.

### Core Tables

#### `regions`
Stores geographic regions for organizing conferences.
| Column | Type | Description |
|--------|------|-------------|
| region_id | SERIAL PRIMARY KEY | Unique identifier |
| region_name | VARCHAR(100) | Name of the region |
| created_at | TIMESTAMP | Record creation time |

#### `conferences`
NCAA conferences that contain schools.
| Column | Type | Description |
|--------|------|-------------|
| conference_id | SERIAL PRIMARY KEY | Unique identifier |
| conference_name | VARCHAR(200) | Full conference name |
| abbreviation | VARCHAR(20) | Short code (e.g., "SEC") |
| division | VARCHAR(10) | NCAA division (D1, D2, D3) |
| region_id | INTEGER FK | Link to regions table |
| created_at | TIMESTAMP | Record creation time |

#### `schools`
Individual colleges/universities.
| Column | Type | Description |
|--------|------|-------------|
| school_id | SERIAL PRIMARY KEY | Unique identifier |
| official_name | VARCHAR(200) | Full school name |
| short_name | VARCHAR(100) | Common short name |
| city | VARCHAR(100) | School city |
| state | VARCHAR(50) | School state |
| conference_id | INTEGER FK | Link to conferences table |
| tfrrs_id | VARCHAR(50) | External TFRRS identifier |
| logo_url | TEXT | URL to school logo |
| primary_color | VARCHAR(7) | Hex color code |
| created_at | TIMESTAMP | Record creation time |

#### `teams`
Each school has separate men's and women's teams.
| Column | Type | Description |
|--------|------|-------------|
| team_id | SERIAL PRIMARY KEY | Unique identifier |
| school_id | INTEGER FK | Link to schools table |
| gender | CHAR(1) | 'M' or 'F' |
| head_coach | VARCHAR(200) | Coach name |
| assistant_coaches | TEXT[] | Array of assistant coaches |
| created_at | TIMESTAMP | Record creation time |

**Unique Constraint:** `(school_id, gender)`

#### `athletes`
Individual athlete records.
| Column | Type | Description |
|--------|------|-------------|
| athlete_id | SERIAL PRIMARY KEY | Unique identifier |
| school_id | INTEGER FK | Current school |
| full_name | VARCHAR(200) | Athlete's full name |
| gender | CHAR(1) | 'M' or 'F' |
| class_year | VARCHAR(20) | FR, SO, JR, SR |
| eligibility_year | INTEGER | Graduation year |
| primary_events | TEXT | Comma-separated event list |
| profile_image_url | TEXT | Profile picture URL |
| hometown | VARCHAR(200) | Hometown |
| high_school | VARCHAR(200) | High school name |
| tfrrs_athlete_id | VARCHAR(50) | TFRRS external ID |
| is_active | BOOLEAN | Currently competing |
| created_at | TIMESTAMP | Record creation time |
| updated_at | TIMESTAMP | Last update time |

#### `results`
Individual performance results.
| Column | Type | Description |
|--------|------|-------------|
| result_id | SERIAL PRIMARY KEY | Unique identifier |
| athlete_id | INTEGER FK | Link to athletes |
| team_id | INTEGER FK | Team at time of result |
| event_name | VARCHAR(100) | Event name (e.g., "100 Meters") |
| mark_raw | VARCHAR(50) | Original mark as string |
| mark_seconds | NUMERIC(10,3) | Parsed time in seconds |
| mark_meters | NUMERIC(10,3) | Parsed distance in meters |
| place | INTEGER | Finish position |
| date | DATE | Competition date |
| meet_name | VARCHAR(300) | Meet name |
| meet_id | INTEGER FK | Link to meets table |
| event_id | INTEGER | TFRRS event ID |
| wind | VARCHAR(20) | Wind reading |
| round | VARCHAR(50) | Finals/Prelims/Heat |
| season_code | VARCHAR(20) | Indoor/Outdoor |
| is_pr | BOOLEAN | Personal record flag |
| is_season_best | BOOLEAN | Season best flag |
| created_at | TIMESTAMP | Record creation time |

#### `meets`
Track and field competitions.
| Column | Type | Description |
|--------|------|-------------|
| meet_id | SERIAL PRIMARY KEY | Unique identifier |
| name | VARCHAR(300) | Meet name |
| date | DATE | Meet date |
| location | VARCHAR(200) | Venue location |
| timing_platform | VARCHAR(100) | Timing system used |
| meet_url | TEXT | Live results URL |
| tfrrs_meet_id | INTEGER | TFRRS external ID |
| status | VARCHAR(20) | upcoming/live/completed |
| divisions | TEXT[] | Participating divisions |
| created_at | TIMESTAMP | Record creation time |

#### `relay_results`
Team relay performance results.
| Column | Type | Description |
|--------|------|-------------|
| relay_result_id | SERIAL PRIMARY KEY | Unique identifier |
| team_id | INTEGER FK | Link to teams |
| event_name | VARCHAR(100) | Event (4x100, 4x400, etc.) |
| mark_raw | VARCHAR(50) | Original time |
| mark_seconds | NUMERIC(10,3) | Time in seconds |
| place | INTEGER | Finish position |
| date | DATE | Competition date |
| meet_name | VARCHAR(300) | Meet name |
| meet_id | INTEGER FK | Link to meets |
| event_id | INTEGER | TFRRS event ID |
| round | VARCHAR(50) | Finals/Prelims |
| created_at | TIMESTAMP | Record creation time |

#### `relay_athletes`
Links individual athletes to relay results.
| Column | Type | Description |
|--------|------|-------------|
| relay_athlete_id | SERIAL PRIMARY KEY | Unique identifier |
| relay_result_id | INTEGER FK | Link to relay_results |
| athlete_id | INTEGER FK | Link to athletes |
| tfrrs_athlete_id | VARCHAR(50) | TFRRS external ID |
| athlete_name | VARCHAR(200) | Name at time of race |
| leg_order | INTEGER | Position (1-4) |
| created_at | TIMESTAMP | Record creation time |

#### `athlete_prs`
Personal records table for faster PR lookups.
| Column | Type | Description |
|--------|------|-------------|
| pr_id | SERIAL PRIMARY KEY | Unique identifier |
| athlete_id | INTEGER FK | Link to athletes |
| event_name | VARCHAR(100) | Event name |
| mark_raw | VARCHAR(50) | PR mark |
| mark_seconds | NUMERIC(10,3) | Time in seconds |
| mark_meters | NUMERIC(10,3) | Distance in meters |
| date | DATE | Date achieved |
| meet_name | VARCHAR(300) | Meet where achieved |
| meet_id | INTEGER FK | Link to meets |
| created_at | TIMESTAMP | Record creation time |
| updated_at | TIMESTAMP | Last update |

**Unique Constraint:** `(athlete_id, event_name)`

#### `live_results`
Real-time meet results from timing systems.
| Column | Type | Description |
|--------|------|-------------|
| live_result_id | SERIAL PRIMARY KEY | Unique identifier |
| meet_id | INTEGER FK | Link to meets |
| event_name | VARCHAR(200) | Event name |
| athlete_name | VARCHAR(200) | Competitor name |
| school_name | VARCHAR(200) | School name |
| mark | VARCHAR(50) | Performance mark |
| place | INTEGER | Current position |
| heat | INTEGER | Heat number |
| lane | INTEGER | Lane assignment |
| is_final | BOOLEAN | Final result flag |
| raw_data | JSONB | Original timing data |
| created_at | TIMESTAMP | Record creation time |
| updated_at | TIMESTAMP | Last update |

#### `external_ids`
Maps internal IDs to external systems.
| Column | Type | Description |
|--------|------|-------------|
| external_id_id | SERIAL PRIMARY KEY | Unique identifier |
| entity_type | VARCHAR(50) | Type (athlete, school, meet) |
| internal_id | INTEGER | Our system ID |
| provider | VARCHAR(50) | Source (tfrrs, athletic_net) |
| external_id | VARCHAR(100) | External system ID |
| created_at | TIMESTAMP | Record creation time |

#### `waitlist`
Email waitlist for community features.
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PRIMARY KEY | Unique identifier |
| email | VARCHAR(255) UNIQUE | Email address |
| created_at | TIMESTAMP | Signup time |

### Database Functions

#### `get_top_performances(limit_count, division_filter, weeks_ago)`
Returns top weekly performances ranked by World Athletics scoring.

**Parameters:**
- `limit_count` (INTEGER): Number of results to return
- `division_filter` (TEXT): Division filter ('all', 'D1', 'D2', 'D3', 'NAIA', 'JUCO')
- `weeks_ago` (INTEGER): Number of weeks back (0 = current week)

**Returns:** Table with columns:
- `athlete_id`, `full_name`, `gender`, `school_name`, `division`
- `event_name`, `mark_raw`, `date`, `meet_name`
- `wa_points` (calculated World Athletics score)

**WA Scoring Formula:**
The function uses World Athletics scoring coefficients for each event. Different coefficients are used for indoor vs outdoor events. The formula:
```
Points = A * (Mark - B)^C  (for running events, lower is better)
Points = A * (Mark - B)^C  (for field events, higher is better)
```

Indoor detection is based on:
- Meet name containing "indoor"
- Date being between November and February
- Event containing "60m" or similar indoor-only events

---

## Frontend Architecture

### Directory Structure
```
frontend/
├── app/                    # Expo Router screens
│   ├── (tabs)/            # Tab navigation screens
│   │   ├── _layout.tsx    # Tab bar configuration
│   │   ├── index.tsx      # Home screen
│   │   ├── meets.tsx      # Meets list
│   │   ├── athletes.tsx   # Athletes list
│   │   └── community.tsx  # Community features
│   ├── athlete/[id].tsx   # Athlete detail
│   ├── meet/[id].tsx      # Meet detail
│   ├── school/[id].tsx    # School detail
│   ├── search.tsx         # Global search
│   ├── compare-athletes.tsx # Comparison tool
│   └── event-results.tsx  # Event results view
├── components/            # Reusable components
├── hooks/                 # Custom React hooks
├── services/              # API and database services
├── design-system/         # Design tokens
├── contexts/              # React contexts
├── types/                 # TypeScript definitions
└── lib/                   # Utilities (Supabase client)
```

### Navigation Structure
- **Root Layout** (`app/_layout.tsx`): Provides theme and favorites context
- **Tab Layout** (`app/(tabs)/_layout.tsx`): Bottom tab navigation with 4 tabs

---

## Screens

### Home Screen (`app/(tabs)/index.tsx`)
The main dashboard displaying:

**Features:**
- Welcome card with "Get Started" onboarding
- Upcoming meets horizontal carousel
- Top weekly performances with WA scoring
- Latest meet results carousel
- Division filter (All, D1, D2, D3, NAIA, JUCO)
- Week selector (This Week, Last Week, 2-4 weeks ago)
- Pull-to-refresh

**State:**
- `divisionFilter`: Selected division
- `weeksAgo`: Number of weeks back
- `showOnboarding`: Onboarding modal visibility
- `refreshing`: Pull-to-refresh state

**Hooks Used:**
- `useTopPerformances(limit, division, weeksAgo)`
- `useMeets('upcoming')`
- `useLatestResults(limit)`
- `useFirstTimeHint('search_button')`

### Meets Screen (`app/(tabs)/meets.tsx`)
List of all meets with filtering.

**Features:**
- Three tabs: Live, Upcoming, Past
- Search by meet name
- Sort by date, name, or location
- Pull-to-refresh
- Navigate to meet details

**State:**
- `activeTab`: 'live' | 'upcoming' | 'past'
- `searchQuery`: Search text
- `sortBy`: 'date' | 'name' | 'location'

**Hooks Used:**
- `useMeets(status)`: Fetches meets by status

### Athletes Screen (`app/(tabs)/athletes.tsx`)
Browse all athletes with filtering.

**Features:**
- Search by athlete name
- Filter by gender (All, Men, Women)
- Filter by division (All, D1, D2, D3, NAIA, JUCO)
- Infinite scroll pagination (50 per page)
- Pull-to-refresh

**State:**
- `searchQuery`: Search text
- `genderFilter`: 'all' | 'M' | 'F'
- `divisionFilter`: Division filter value
- `page`: Current pagination page

**Hooks Used:**
- `useAthletes(search, gender, division, page)`

### Community Screen (`app/(tabs)/community.tsx`)
Coming soon page with email waitlist.

**Features:**
- Email signup form
- Validates email format
- Stores in `waitlist` table
- Success/error feedback

### Athlete Detail Screen (`app/athlete/[id].tsx`)
Comprehensive athlete profile.

**Features:**
- Header with name, school, class year, gender
- Stats row (Events, Meets, PRs, Relays)
- Favorite button (heart icon)
- Personal Records section
- Meet Results history
- Relay Participations
- Share button (generates image)
- Compare button (navigates to comparison)
- Navigate to school profile

**State:**
- `activeTab`: 'prs' | 'results' | 'relays'
- `showStats`: Stats modal visibility

**Data Structure:**
```typescript
interface AthleteDetails {
  athlete_id: number;
  full_name: string;
  gender: string;
  class_year: string;
  school_id: number;
  school_name: string;
  division: string;
  results: Result[];
  prs: PersonalRecord[];
  relays: RelayResult[];
}
```

### Meet Detail Screen (`app/meet/[id].tsx`)
Meet information and results.

**Features:**
- Meet header with name, date, location
- Gender toggle (Men/Women)
- Events list with results
- WebView for live results (if available)
- Related meets at same venue
- Navigate to event results

**State:**
- `selectedGender`: 'M' | 'F'
- `expandedEvents`: Set of expanded event names

### School Detail Screen (`app/school/[id].tsx`)
School profile with roster.

**Features:**
- School header with name and conference
- Athlete count by gender
- Season filter (All, Indoor, Outdoor)
- Gender filter (All, Men, Women)
- Class year filter (All, FR, SO, JR, SR)
- Athlete roster with search
- Recent meets section

**Filters:**
- `seasonFilter`: 'all' | 'indoor' | 'outdoor'
- `genderFilter`: 'all' | 'M' | 'F'
- `classFilter`: 'all' | 'FR' | 'SO' | 'JR' | 'SR'

### Search Screen (`app/search.tsx`)
Global search for athletes and schools.

**Features:**
- Single search input
- Results grouped by type (Athletes, Schools)
- Debounced search (300ms)
- Navigate to athlete or school detail

**Hooks Used:**
- `useAthleteSearch(query)`
- `useSchoolSearch(query)`

### Compare Athletes Screen (`app/compare-athletes.tsx`)
Side-by-side athlete comparison.

**Features:**
- Select two athletes via search modal
- Season filter (All, Indoor, Outdoor)
- Swap athletes button
- Common events selector (excludes relays)
- Comparison chart showing:
  - Personal bests
  - Season averages
  - Head-to-head record
- Visual bar chart comparison

**State:**
- `athlete1`, `athlete2`: Selected athletes
- `selectedEvent`: Event being compared
- `seasonFilter`: 'all' | 'indoor' | 'outdoor'
- `headToHead`: Head-to-head data

**Services Used:**
- `searchAthletes(query, limit)`
- `getAthleteComparisonStats(id, season)`
- `getHeadToHead(id1, id2, event, season)`

### Event Results Screen (`app/event-results.tsx`)
Detailed event results from a meet.

**Features:**
- Event name header
- Rounds/heats navigation
- Results table with place, name, school, mark
- Relay athlete lists
- Navigate to athlete profiles

**URL Parameters:**
- `meetId`: Meet identifier
- `eventName`: Event name
- `gender`: 'M' or 'F'

---

## Components

### UI Components

#### `SportsPerformanceCard`
Displays a ranked performance with athlete info.

**Props:**
```typescript
{
  rank: number;           // Display rank (1-999)
  athleteName: string;    // Athlete full name
  schoolName: string;     // School name
  event: string;          // Event name
  time: string;           // Mark/time string
  date: string;           // ISO date
  waPoints?: number;      // WA score (optional)
  onPress?: () => void;   // Tap handler
}
```

**Visual Elements:**
- Gold/silver/bronze styling for top 3
- Rank badge with number
- Athlete name and school
- Event badge
- Mark with WA points badge

#### `ModernPerformanceCard`
Alternative performance card with gradient styling.

**Props:** Same as `SportsPerformanceCard`

#### `MeetCardSkeleton`
Loading placeholder for meet cards.

**Props:**
```typescript
{
  count?: number;  // Number of skeletons to show
}
```

#### `SchoolRankingCard`
Displays school in a ranking context.

**Props:**
```typescript
{
  rank: number;
  schoolName: string;
  conferenceAbbrev: string;
  points: number;
  athletes: number;
  onPress?: () => void;
}
```

#### `IconSymbol`
SF Symbol-style icons using MaterialIcons.

**Props:**
```typescript
{
  name: SymbolName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}
```

#### `TabBarBackground`
Blur effect background for tab bar (iOS only).

### Animation Components

#### `AnimatedCard`
Pressable card with scale animation on press.

**Props:**
```typescript
{
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  scaleValue?: number;  // Default: 0.97
}
```

#### `FadeInCard`
Animated entrance with fade and slide.

**Props:**
```typescript
{
  children: ReactNode;
  delay?: number;       // Delay before animation (ms)
  duration?: number;    // Animation duration (ms)
}
```

#### `PulsingBadge`
Badge with pulsing glow animation.

**Props:**
```typescript
{
  children: ReactNode;
  color?: string;
  pulseColor?: string;
  style?: StyleProp<ViewStyle>;
}
```

### Decoration Components

#### `RacingStripes`
Diagonal racing stripe background pattern.

**Props:**
```typescript
{
  colors?: string[];      // Stripe colors
  stripeWidth?: number;   // Width of each stripe
  angle?: number;         // Rotation angle
}
```

#### `SpeedLines`
Motion blur speed lines decoration.

**Props:**
```typescript
{
  count?: number;
  color?: string;
  opacity?: number;
}
```

#### `MedalRibbon`
Decorative medal ribbon shape.

**Props:**
```typescript
{
  color?: string;
  width?: number;
  height?: number;
}
```

#### `SparkleTrophy`
Animated trophy with sparkle effects.

**Props:**
```typescript
{
  size?: number;
  color?: string;
}
```

### Chart Components

#### `AthleteComparisonChart`
Bar chart comparing two athletes.

**Props:**
```typescript
{
  athlete1: {
    name: string;
    school: string;
    personalBest: string;
    average: string;
  };
  athlete2: {
    name: string;
    school: string;
    personalBest: string;
    average: string;
  };
  eventName: string;
  headToHead?: {
    athlete1Wins: number;
    athlete2Wins: number;
    ties: number;
    races: Race[];
  };
}
```

**Visual Elements:**
- Horizontal bars for PB comparison
- Head-to-head win/loss/tie record
- Recent races list

#### `PRHistoryChart`
Line chart showing PR progression over time.

**Props:**
```typescript
{
  data: Array<{
    date: string;
    mark: number;
    markRaw: string;
  }>;
  eventName: string;
}
```

#### `SeasonProgressionChart`
Performance trend chart for a season.

**Props:**
```typescript
{
  results: Result[];
  eventName: string;
  season: 'indoor' | 'outdoor' | 'all';
}
```

### Layout Components

#### `Container`
Consistent padding wrapper.

**Props:**
```typescript
{
  children: ReactNode;
  padding?: number;      // Default: spacing.screen
  style?: StyleProp<ViewStyle>;
}
```

#### `Card`
Styled card with border and shadow.

**Props:**
```typescript
{
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'elevated' | 'outlined';
}
```

#### `Stack`
Flexbox stack with gap spacing.

**Props:**
```typescript
{
  children: ReactNode;
  direction?: 'row' | 'column';
  gap?: number;
  align?: FlexAlignType;
  justify?: FlexJustifyContent;
}
```

#### `Section`
Section with title and optional "See All" link.

**Props:**
```typescript
{
  title: string;
  children: ReactNode;
  onSeeAll?: () => void;
}
```

#### `Grid`
Responsive grid layout.

**Props:**
```typescript
{
  children: ReactNode;
  columns?: number;
  gap?: number;
}
```

### Icon Components

#### `TrophyIcon`
Custom trophy SVG icon.

**Props:**
```typescript
{
  size?: number;
  color?: string;
  variant?: 'gold' | 'silver' | 'bronze';
}
```

#### `MedalIcon`
Medal SVG with ribbon.

**Props:**
```typescript
{
  place: 1 | 2 | 3;
  size?: number;
}
```

#### `AnimatedMedal`
Medal with shine animation.

**Props:**
```typescript
{
  place: 1 | 2 | 3;
  size?: number;
  animated?: boolean;
}
```

### Share Components

#### `AthleteShareCard`
Shareable athlete profile card.

**Props:**
```typescript
{
  athlete: AthleteDetails;
  prs: PersonalRecord[];
}
```

Renders a branded card with:
- TrackHub logo
- Athlete name and school
- Top 5 PRs
- QR code or app link

#### `WeeklyTopPerformancesShareCard`
Shareable top performances card.

**Props:**
```typescript
{
  performances: Performance[];
  weekLabel: string;
  divisionLabel: string;
  dateRange: string;
}
```

### Modal Components

#### `AthleteStatsModal`
Detailed athlete statistics popup.

**Props:**
```typescript
{
  visible: boolean;
  onClose: () => void;
  athlete: AthleteDetails;
}
```

Displays:
- Career statistics
- Best performances by event
- Season comparisons
- Competition frequency

### Other Components

#### `Onboarding`
First-time user walkthrough.

**Props:**
```typescript
{
  onDone: () => void;
}
```

Screens:
1. Welcome to TrackHub
2. Track Top Performances
3. Follow Your Favorites
4. Compare Athletes

#### `WelcomeScreen`
Pre-app welcome/loading screen.

**Props:**
```typescript
{
  onContinue: () => void;
}
```

#### `SplashScreen`
Animated app splash screen.

**Features:**
- Animated logo
- Loading indicator
- Fade transition

#### `HintTooltip`
Contextual hint tooltip.

**Props:**
```typescript
{
  visible: boolean;
  text: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  arrowPosition?: 'left' | 'center' | 'right';
  onDismiss: () => void;
}
```

#### `ErrorBoundary`
Error boundary for graceful error handling.

**Props:**
```typescript
{
  children: ReactNode;
  fallback?: ReactNode;
}
```

#### `AdvancedFilter`
Multi-option filter component.

**Props:**
```typescript
{
  filters: FilterOption[];
  activeFilters: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
}
```

#### `CommentsSection`
Social comments display (placeholder for future).

**Props:**
```typescript
{
  entityType: 'athlete' | 'meet' | 'result';
  entityId: number;
}
```

---

## Hooks

### `useAthletes(search, gender, division, page)`
Fetches paginated athlete list with filters.

**Parameters:**
- `search`: Search query string
- `gender`: 'all' | 'M' | 'F'
- `division`: Division filter
- `page`: Page number (1-indexed)

**Returns:**
```typescript
{
  athletes: Athlete[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
  refresh: () => Promise<void>;
}
```

### `useAthleteDetails(athleteId)`
Fetches complete athlete profile with results.

**Parameters:**
- `athleteId`: Athlete ID number

**Returns:**
```typescript
{
  athlete: AthleteDetails | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}
```

Fetches:
- Basic athlete info
- School information
- Personal records
- All results (sorted by date desc)
- Relay participations

### `useAthleteSearch(query)`
Debounced athlete search.

**Parameters:**
- `query`: Search string (min 2 characters)

**Returns:**
```typescript
{
  results: AthleteSearchResult[];
  loading: boolean;
  error: Error | null;
}
```

### `useMeets(status)`
Fetches meets by status.

**Parameters:**
- `status`: 'upcoming' | 'live' | 'past'

**Returns:**
```typescript
{
  meets: Meet[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}
```

### `useMeetDetails(meetId)`
Fetches complete meet information.

**Parameters:**
- `meetId`: Meet ID number

**Returns:**
```typescript
{
  meet: MeetDetails | null;
  events: EventWithResults[];
  loading: boolean;
  error: Error | null;
}
```

### `useLatestResults(limit)`
Fetches most recent meets with results.

**Parameters:**
- `limit`: Number of meets to return

**Returns:**
```typescript
{
  meets: Meet[];
  loading: boolean;
}
```

### `useLiveResults(meetId)`
Real-time live results subscription.

**Parameters:**
- `meetId`: Meet ID to subscribe to

**Returns:**
```typescript
{
  results: LiveResult[];
  loading: boolean;
  error: Error | null;
  lastUpdated: Date | null;
}
```

Uses Supabase real-time subscriptions for live updates.

### `useTopPerformances(limit, division, weeksAgo)`
Fetches top weekly performances.

**Parameters:**
- `limit`: Number of results
- `division`: Division filter
- `weeksAgo`: Weeks back (0 = current)

**Returns:**
```typescript
{
  performances: Performance[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}
```

Calls the `get_top_performances` database function.

### `useTopPerformancesApi()`
API-based top performances (alternative implementation).

**Returns:**
```typescript
{
  performances: Performance[];
  loading: boolean;
  error: Error | null;
  fetchPerformances: (params) => Promise<void>;
}
```

### `useSchools()`
Fetches all schools.

**Returns:**
```typescript
{
  schools: School[];
  loading: boolean;
  error: Error | null;
}
```

### `useSchoolSearch(query)`
Debounced school search.

**Parameters:**
- `query`: Search string

**Returns:**
```typescript
{
  results: School[];
  loading: boolean;
}
```

### `useColorScheme()`
Detects system color scheme.

**Returns:** `'light' | 'dark'`

### `useThemeColor(props, colorName)`
Gets theme-aware color value.

**Parameters:**
- `props`: Object with optional light/dark overrides
- `colorName`: Color key from theme

**Returns:** `string` (color value)

### `useFirstTimeHint(key, delay)`
Manages first-time user hints.

**Parameters:**
- `key`: Unique hint identifier
- `delay`: Delay before showing (ms)

**Returns:**
```typescript
{
  showHint: boolean;
  dismissHint: () => void;
  resetHint: () => void;
}
```

Uses AsyncStorage to track shown hints.

---

## Services

### `database.ts` (via `services/database-supabase.ts`)
Core database service functions.

#### `searchAthletes(query, limit)`
Search athletes by name.
```typescript
async function searchAthletes(
  query: string,
  limit: number = 20
): Promise<AthleteSearchResult[]>
```

Uses PostgreSQL full-text search with `ilike` matching.

#### `getAthleteComparisonStats(athleteId, season)`
Get athlete stats for comparison.
```typescript
async function getAthleteComparisonStats(
  athleteId: number,
  season: SeasonFilter
): Promise<AthleteComparisonData | null>
```

Returns:
- Basic athlete info
- Event statistics (PB, average, count)
- Filtered by indoor/outdoor/all

#### `getHeadToHead(athlete1Id, athlete2Id, event, season)`
Get head-to-head record between athletes.
```typescript
async function getHeadToHead(
  athlete1Id: number,
  athlete2Id: number,
  event: string,
  season: SeasonFilter
): Promise<HeadToHeadData>
```

Returns:
- Win/loss/tie counts
- List of shared races with results

#### `searchSchools(query, limit)`
Search schools by name.
```typescript
async function searchSchools(
  query: string,
  limit: number = 20
): Promise<School[]>
```

#### `getSchoolDetails(schoolId)`
Get school with athletes and meets.
```typescript
async function getSchoolDetails(
  schoolId: number
): Promise<SchoolDetails | null>
```

#### `getMeetResults(meetId)`
Get all results for a meet.
```typescript
async function getMeetResults(
  meetId: number
): Promise<MeetResults>
```

#### `getEventResults(meetId, eventName, gender)`
Get results for a specific event.
```typescript
async function getEventResults(
  meetId: number,
  eventName: string,
  gender: 'M' | 'F'
): Promise<EventResult[]>
```

#### `addToWaitlist(email)`
Add email to waitlist.
```typescript
async function addToWaitlist(
  email: string
): Promise<{ success: boolean; error?: string }>
```

### `api.ts`
HTTP API functions (for external data).

Currently minimal - most data comes from Supabase directly.

### `lib/supabase.ts`
Supabase client initialization.

```typescript
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
```

---

## Design System

### Colors (`design-system/colors.ts`)

```typescript
export const colors = {
  // Primary brand colors
  primary: {
    trackOrange: '#FF6B35',      // Main brand color
    trackOrangeDark: '#E55A2B',  // Darker variant
    hotPink: '#FF1B8D',          // Accent color
  },

  // Background colors
  backgrounds: {
    skyBlue: '#87CEEB',          // Main app background
    white: '#FFFFFF',            // Card backgrounds
    cream: '#FFF8DC',            // Subtle highlight
    lightGray: '#F5F5F5',        // Disabled states
  },

  // Text colors
  text: {
    primary: '#000000',          // Main text
    secondary: '#333333',        // Secondary text
    tertiary: '#666666',         // Muted text
    muted: '#999999',            // Very muted
    white: '#FFFFFF',            // On dark backgrounds
  },

  // Border colors
  borders: {
    thick: '#000000',            // Bold borders (4px)
    thin: '#E0E0E0',             // Subtle borders
  },

  // Semantic colors
  semantic: {
    success: '#4CAF50',
    error: '#F44336',
    warning: '#FF9800',
    info: '#2196F3',
  },

  // Performance indicators
  performance: {
    newPR: '#4CAF50',            // Green for PRs
    seasonBest: '#2196F3',       // Blue for SBs
    gold: '#FFD700',             // 1st place
    silver: '#C0C0C0',           // 2nd place
    bronze: '#CD7F32',           // 3rd place
  },

  // Medal colors
  medals: {
    gold: '#FFD700',
    goldDark: '#B8860B',
    silver: '#C0C0C0',
    silverDark: '#A8A8A8',
    bronze: '#CD7F32',
    bronzeDark: '#8B4513',
  },
};
```

### Typography (`design-system/typography.ts`)

```typescript
export const typography = {
  // Font families
  fonts: {
    regular: 'System',
    bold: 'System',
    mono: 'Courier',
  },

  // Font sizes
  sizes: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 20,
    xxxl: 24,
    display: 32,
    hero: 40,
  },

  // Font weights
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
    black: '900' as const,
  },

  // Line heights
  lineHeights: {
    tight: 1.1,
    normal: 1.4,
    relaxed: 1.6,
  },

  // Letter spacing
  letterSpacing: {
    tight: -0.5,
    normal: 0,
    wide: 0.5,
    wider: 1,
    widest: 1.5,
  },
};
```

### Spacing (`design-system/spacing.ts`)

```typescript
export const spacing = {
  // Base spacing units
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,

  // Specific use cases
  screen: 20,              // Screen edge padding
  cardPadding: 16,         // Internal card padding
  cardMargin: 12,          // Between cards
  sectionGap: 24,          // Between sections
  headerPadding: 16,       // Header vertical padding
  bottomSpacing: 100,      // Bottom of scrollable content

  // Border radii
  radiusSm: 8,
  radiusMd: 12,
  radiusLg: 16,
  radiusXl: 20,
  radiusFull: 9999,
};
```

### Shadows (`design-system/shadows.ts`)

```typescript
export const shadows = {
  // Comic/bold shadow style
  comic: {
    shadowColor: '#000000',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },

  // Elevated shadow
  elevated: {
    shadowColor: '#000000',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },

  // Subtle shadow
  subtle: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },

  // Card shadow
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
};
```

---

## Scrapers

The scrapers directory contains Node.js scripts for importing data from TFRRS (Track & Field Results Reporting System).

### Directory Structure
```
scrapers/
├── .env                     # Environment variables
├── package.json             # Dependencies
├── tfrrs/
│   ├── athlete-scraper/     # Athlete result scraping
│   │   ├── scrape-athlete-results.js
│   │   └── import-results-to-db.js
│   ├── meet-scraper/        # Meet result scraping
│   │   ├── scrape-meet-results.js
│   │   ├── import-meet-results.js
│   │   ├── import-relay-results.js
│   │   └── sync-weekend-results.js
│   └── check-db-health.js   # Database health checks
└── athletic-net/            # Athletic.net scraping (WIP)
```

### Meet Scraper (`meet-scraper/scrape-meet-results.js`)

Scrapes results from a TFRRS meet page.

**Usage:**
```bash
node scrape-meet-results.js <tfrrs-meet-url>
```

**Process:**
1. Fetches meet page HTML
2. Parses event list with Cheerio
3. For each event:
   - Fetches event results page
   - Parses place, athlete, school, mark
   - Detects round (Finals, Prelims, Heat)
   - Handles relay athletes separately
4. Outputs to `output/meet-results.json`

**Key Functions:**
- `parseMeetEvents(html)`: Extract event links
- `parseEventResults(html)`: Parse results table
- `parseMarkSeconds(mark)`: Convert time to seconds
- `parseMarkMeters(mark)`: Convert distance to meters
- `parseAthleteId(url)`: Extract TFRRS athlete ID

### Import Meet Results (`meet-scraper/import-meet-results.js`)

Imports scraped meet results to database.

**Usage:**
```bash
node import-meet-results.js              # Dry run
node import-meet-results.js --commit     # Actually import
```

**Process:**
1. Loads `output/meet-results.json`
2. Maps school names to team_ids
3. Maps TFRRS athlete IDs to internal athlete_ids
4. Creates new athletes if needed
5. Checks for duplicate results
6. Inserts in batches of 500

### Import Relay Results (`meet-scraper/import-relay-results.js`)

Imports relay results to both `relay_results` and `results` tables.

**Usage:**
```bash
node import-relay-results.js              # Dry run
node import-relay-results.js --commit     # Actually import
```

**Process:**
1. Filters relay events from scraped data
2. Matches team names to team_ids
3. For each relay:
   - Inserts into `relay_results`
   - Inserts into `relay_athletes` (one per leg)
   - Inserts into `results` (one per athlete)

### Sync Weekend Results (`meet-scraper/sync-weekend-results.js`)

Complete pipeline for syncing recent meet results.

**Usage:**
```bash
node sync-weekend-results.js              # Find matches only
node sync-weekend-results.js --scrape     # Find + scrape
node sync-weekend-results.js --commit     # Full pipeline
node sync-weekend-results.js --days 3     # Look back 3 days
```

**Process:**
1. Queries database for meets needing results
2. Searches TFRRS for matching meets by name/date
3. Uses fuzzy matching (40% threshold) for meet names
4. Scrapes matched TFRRS meets
5. Imports results with duplicate checking

**Key Functions:**
- `similarity(s1, s2)`: Calculate string similarity (0-1)
- `normalizeMeetName(name)`: Remove noise words
- `getMeetsNeedingResults(days)`: Query DB for meets without results
- `searchTfrrsForDate(date)`: Search TFRRS results pages
- `scrapeMeet(url)`: Full meet scraping

### Athlete Scraper (`athlete-scraper/scrape-athlete-results.js`)

Scrapes individual athlete performance history.

**Usage:**
```bash
node scrape-athlete-results.js            # Scrape all athletes needing data
node scrape-athlete-results.js --limit 100  # Limit to 100 athletes
```

**Process:**
1. Queries athletes with TFRRS IDs but no results
2. For each athlete:
   - Fetches TFRRS profile page
   - Parses all historical results
   - Extracts event, mark, meet, date
3. Outputs to `output/scraped-results.json`

### Import Results to DB (`athlete-scraper/import-results-to-db.js`)

Imports athlete scraped results.

**Usage:**
```bash
node import-results-to-db.js              # Dry run
node import-results-to-db.js --commit     # Actually import
node import-results-to-db.js --batch 500  # Batch size
```

**Process:**
1. Loads scraped results JSON
2. Parses dates and marks
3. Builds school -> team_id lookup
4. Checks for duplicates by (athlete_id, event_name, date, mark_raw, meet_name)
5. Assigns manual result_ids (sequence workaround)
6. Batch inserts with error recovery

### Environment Variables

Required in `scrapers/.env`:
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### Dependencies

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.x",
    "axios": "^1.x",
    "cheerio": "^1.x",
    "dotenv": "^16.x"
  }
}
```

---

## Configuration

### Expo Configuration (`app.json`)

```json
{
  "expo": {
    "name": "TrackHub",
    "slug": "track-meet-tracker",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "trackhub",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.trackhub.app"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#87CEEB"
      },
      "package": "com.trackhub.app"
    },
    "web": {
      "bundler": "metro",
      "output": "static",
      "favicon": "./assets/favicon.png"
    },
    "plugins": [
      "expo-router",
      "expo-font"
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}
```

### Package Dependencies (`package.json`)

**Core Dependencies:**
- `expo` ~52.0.0
- `react` 18.3.1
- `react-native` 0.76.5
- `expo-router` ~4.0.0

**UI/UX:**
- `@expo/vector-icons`
- `expo-linear-gradient`
- `expo-haptics`
- `react-native-reanimated`
- `react-native-safe-area-context`

**Data/State:**
- `@supabase/supabase-js`
- `@react-native-async-storage/async-storage`

**Sharing:**
- `expo-sharing`
- `react-native-view-shot`

**Navigation:**
- `@react-navigation/native`
- `@react-navigation/bottom-tabs`

---

## Type Definitions

### Core Types (`types/index.ts`)

```typescript
// Athlete Types
export interface Athlete {
  athlete_id: number;
  school_id: number;
  full_name: string;
  gender: 'M' | 'F';
  class_year: string;
  primary_events: string;
  tfrrs_athlete_id: string;
  is_active: boolean;
  school_name?: string;
  division?: string;
}

export interface AthleteDetails extends Athlete {
  results: Result[];
  prs: PersonalRecord[];
  relays: RelayParticipation[];
}

// Result Types
export interface Result {
  result_id: number;
  athlete_id: number;
  team_id: number;
  event_name: string;
  mark_raw: string;
  mark_seconds: number | null;
  mark_meters: number | null;
  place: number;
  date: string;
  meet_name: string;
  meet_id: number;
  round: string;
  is_pr: boolean;
  is_season_best: boolean;
  competed_for_school?: string;
}

export interface PersonalRecord {
  pr_id: number;
  athlete_id: number;
  event_name: string;
  mark_raw: string;
  mark_seconds: number | null;
  mark_meters: number | null;
  date: string;
  meet_name: string;
}

// Meet Types
export interface Meet {
  meet_id: number;
  name: string;
  date: string;
  location: string;
  status: 'upcoming' | 'live' | 'completed';
  timing_platform: string;
  meet_url: string;
  tfrrs_meet_id: number;
}

export interface MeetDetails extends Meet {
  events: EventWithResults[];
}

export interface EventWithResults {
  event_name: string;
  gender: 'M' | 'F';
  results: Result[];
  rounds: string[];
}

// School Types
export interface School {
  school_id: number;
  official_name: string;
  short_name: string;
  city: string;
  state: string;
  conference_id: number;
  division: string;
  logo_url: string;
  primary_color: string;
}

export interface SchoolDetails extends School {
  athletes: Athlete[];
  meets: Meet[];
  conference_name: string;
}

// Relay Types
export interface RelayResult {
  relay_result_id: number;
  team_id: number;
  event_name: string;
  mark_raw: string;
  mark_seconds: number;
  place: number;
  date: string;
  meet_name: string;
}

export interface RelayParticipation {
  relay_result_id: number;
  event_name: string;
  mark_raw: string;
  place: number;
  date: string;
  meet_name: string;
  leg_order: number;
  teammates: string[];
}

// Performance Types
export interface Performance {
  athlete_id: number;
  full_name: string;
  gender: 'M' | 'F';
  school_name: string;
  division: string;
  event_name: string;
  mark_raw: string;
  date: string;
  meet_name: string;
  waPoints: number;
}

// Filter Types
export type SeasonFilter = 'all' | 'indoor' | 'outdoor';
export type GenderFilter = 'all' | 'M' | 'F';
export type DivisionFilter = 'all' | 'D1' | 'D2' | 'D3' | 'NAIA' | 'JUCO';

// Search Types
export interface AthleteSearchResult {
  athlete_id: number;
  full_name: string;
  gender: string;
  class_year: string;
  primary_events: string;
  school_name: string;
  division: string;
}

// Comparison Types
export interface AthleteComparisonData {
  athlete_id: number;
  full_name: string;
  school_name: string;
  gender: string;
  division: string;
  eventStats: Record<string, EventStats>;
}

export interface EventStats {
  personalBest: number;
  personalBestRaw: string;
  average: number;
  averageRaw: string;
  count: number;
}

export interface HeadToHeadData {
  athlete1Wins: number;
  athlete2Wins: number;
  ties: number;
  races: Race[];
}

export interface Race {
  date: string;
  meet_name: string;
  athlete1_place: number;
  athlete1_mark: string;
  athlete2_place: number;
  athlete2_mark: string;
  winner: 1 | 2 | 0;
}
```

---

## Contexts

### FavoritesContext (`contexts/FavoritesContext.tsx`)

Manages user's favorited athletes and schools.

```typescript
interface FavoritesContextType {
  favoriteAthletes: number[];
  favoriteSchools: number[];
  addFavoriteAthlete: (id: number) => void;
  removeFavoriteAthlete: (id: number) => void;
  addFavoriteSchool: (id: number) => void;
  removeFavoriteSchool: (id: number) => void;
  isAthleteFavorite: (id: number) => boolean;
  isSchoolFavorite: (id: number) => boolean;
  toggleAthleteFavorite: (id: number) => void;
  toggleSchoolFavorite: (id: number) => void;
}
```

**Storage:** Uses AsyncStorage with keys:
- `@trackhub/favorite_athletes`
- `@trackhub/favorite_schools`

**Usage:**
```typescript
const { isAthleteFavorite, toggleAthleteFavorite } = useFavorites();

<TouchableOpacity onPress={() => toggleAthleteFavorite(athlete.athlete_id)}>
  <Ionicons
    name={isAthleteFavorite(athlete.athlete_id) ? 'heart' : 'heart-outline'}
    color={colors.semantic.error}
  />
</TouchableOpacity>
```

---

## World Athletics Scoring

The app uses World Athletics (WA) scoring to compare performances across different events. This provides a standardized way to rank athletes.

### Scoring Formula

For timed events (lower is better):
```
Points = A * (B - Mark)^C
```

For field events (higher is better):
```
Points = A * (Mark - B)^C
```

### Coefficients by Event

Example coefficients (from migration files):

**Men's Running Events:**
| Event | A | B | C |
|-------|---|---|---|
| 100m | 25.4347 | 18.0 | 1.81 |
| 200m | 5.8425 | 38.0 | 1.81 |
| 400m | 1.53775 | 82.0 | 1.81 |
| 800m | 0.11193 | 2.35 min | 1.88 |
| 1500m | 0.03768 | 5.0 min | 1.85 |
| Mile | 0.03347 | 5.5 min | 1.85 |
| 5000m | 0.00815 | 17.0 min | 1.85 |
| 10000m | 0.00353 | 35.0 min | 1.85 |

**Men's Field Events:**
| Event | A | B | C |
|-------|---|---|---|
| High Jump | 39.6362 | 0.55m | 1.42 |
| Pole Vault | 3.042 | 1.0m | 1.42 |
| Long Jump | 1.92998 | 2.2m | 1.42 |
| Shot Put | 51.39 | 1.5m | 1.05 |
| Discus | 12.91 | 4.0m | 1.1 |

### Indoor vs Outdoor Detection

The scoring function detects indoor meets based on:
1. Meet name contains "indoor"
2. Date is November-February
3. Event is indoor-specific (60m, 60m hurdles)

Indoor events use different coefficients where applicable.

---

## Data Flow

### Typical Data Flow for Athlete Profile

```
1. User taps athlete card
   ↓
2. Router navigates to /athlete/[id]
   ↓
3. useAthleteDetails(id) hook called
   ↓
4. Hook fetches from Supabase:
   - athletes table (basic info)
   - schools table (school name, division)
   - results table (all results)
   - athlete_prs table (PRs)
   - relay_athletes + relay_results (relays)
   ↓
5. Data normalized and returned to component
   ↓
6. Component renders with tabs:
   - PRs tab: athlete_prs data
   - Results tab: results data sorted by date
   - Relays tab: relay participations
```

### Data Flow for Top Performances

```
1. Home screen mounts
   ↓
2. useTopPerformances(15, division, weeksAgo) called
   ↓
3. Hook calls Supabase RPC:
   supabase.rpc('get_top_performances', {
     limit_count: 15,
     division_filter: 'D1',
     weeks_ago: 0
   })
   ↓
4. Database function:
   - Filters results by date range
   - Joins with athletes, schools
   - Calculates WA points for each result
   - Orders by WA points descending
   - Returns top N results
   ↓
5. Results rendered in SportsPerformanceCard components
```

### Data Flow for Meet Results Sync

```
1. Admin runs: node sync-weekend-results.js --commit
   ↓
2. Script queries meets table for meets without results
   ↓
3. For each meet:
   a. Search TFRRS for matching meet
   b. Fuzzy match by name (40% threshold)
   ↓
4. If match found, scrape TFRRS meet page:
   a. Parse event list
   b. For each event, parse results
   c. Collect athletes, marks, places
   ↓
5. Import to database:
   a. Create missing athletes
   b. Insert results (check duplicates)
   c. Insert relay_results and relay_athletes
   ↓
6. App users see new data on refresh
```

---

## Error Handling

### Component-Level Error Handling

Components use loading/error states from hooks:
```typescript
const { data, loading, error } = useAthleteDetails(id);

if (loading) return <ActivityIndicator />;
if (error) return <ErrorMessage message={error.message} />;
return <AthleteProfile data={data} />;
```

### ErrorBoundary Component

Wraps screens to catch React errors:
```typescript
<ErrorBoundary fallback={<ErrorScreen />}>
  <Screen />
</ErrorBoundary>
```

### Database Error Handling

Services catch and log Supabase errors:
```typescript
const { data, error } = await supabase.from('athletes').select('*');
if (error) {
  console.error('Database error:', error.message);
  throw new Error('Failed to fetch athletes');
}
```

---

## Performance Optimizations

### Data Fetching
- Hooks use pagination for large datasets (50 items per page)
- Search has 300ms debounce to reduce API calls
- Results are cached in state (no SWR/React Query currently)

### Rendering
- FlatList used for long lists (virtualized)
- `React.memo` for expensive child components
- Skeleton loaders for perceived performance

### Images
- School logos lazy loaded
- No athlete profile images currently stored

### Database
- Indexes on frequently queried columns
- Composite indexes for common query patterns
- RPC functions for complex queries (avoid N+1)

---

## Future Considerations

Based on the codebase structure, potential enhancements include:

1. **Push Notifications**: Meet alerts, PR notifications
2. **User Authentication**: Supabase Auth for favorites sync
3. **Social Features**: Comments, reactions (CommentsSection exists as placeholder)
4. **Live Results**: Real-time WebSocket updates for meets
5. **Offline Support**: AsyncStorage caching of viewed data
6. **Analytics**: Track user engagement metrics
7. **Athletic.net Integration**: Additional data source (scraper folder exists)
8. **Team Scores**: Calculate team standings for meets
9. **Predictions**: ML model for performance projections
10. **Coach Dashboard**: Team management features

---

## File Index

### App Screens
| Path | Description |
|------|-------------|
| `app/_layout.tsx` | Root layout with providers |
| `app/(tabs)/_layout.tsx` | Tab bar configuration |
| `app/(tabs)/index.tsx` | Home screen |
| `app/(tabs)/meets.tsx` | Meets list |
| `app/(tabs)/athletes.tsx` | Athletes list |
| `app/(tabs)/community.tsx` | Community/waitlist |
| `app/athlete/[id].tsx` | Athlete detail |
| `app/meet/[id].tsx` | Meet detail |
| `app/school/[id].tsx` | School detail |
| `app/search.tsx` | Global search |
| `app/compare-athletes.tsx` | Athlete comparison |
| `app/event-results.tsx` | Event results |

### Components
| Path | Description |
|------|-------------|
| `components/ui/SportsPerformanceCard.tsx` | Performance card |
| `components/ui/MeetCardSkeleton.tsx` | Loading skeleton |
| `components/animations/AnimatedCard.tsx` | Pressable card |
| `components/animations/FadeInCard.tsx` | Fade entrance |
| `components/charts/AthleteComparisonChart.tsx` | Comparison chart |
| `components/decorations/RacingStripes.tsx` | Background stripes |
| `components/share/AthleteShareCard.tsx` | Share card |
| `components/onboarding/Onboarding.tsx` | First-time flow |
| `components/hints/HintTooltip.tsx` | Hint tooltips |

### Hooks
| Path | Description |
|------|-------------|
| `hooks/useAthletes.ts` | Athlete list |
| `hooks/useAthleteDetails.ts` | Athlete profile |
| `hooks/useAthleteSearch.ts` | Athlete search |
| `hooks/useMeets.ts` | Meets list |
| `hooks/useMeetDetails.ts` | Meet profile |
| `hooks/useTopPerformances.ts` | Top performances |
| `hooks/useSchools.ts` | Schools list |
| `hooks/useSchoolSearch.ts` | School search |
| `hooks/useFirstTimeHint.ts` | Hint management |

### Services
| Path | Description |
|------|-------------|
| `services/database-supabase.ts` | Database functions |
| `lib/supabase.ts` | Supabase client |

### Design System
| Path | Description |
|------|-------------|
| `design-system/colors.ts` | Color tokens |
| `design-system/typography.ts` | Type tokens |
| `design-system/spacing.ts` | Spacing tokens |
| `design-system/shadows.ts` | Shadow tokens |

### Scrapers
| Path | Description |
|------|-------------|
| `scrapers/tfrrs/meet-scraper/scrape-meet-results.js` | Scrape meet |
| `scrapers/tfrrs/meet-scraper/sync-weekend-results.js` | Auto-sync |
| `scrapers/tfrrs/athlete-scraper/scrape-athlete-results.js` | Scrape athlete |
| `scrapers/tfrrs/athlete-scraper/import-results-to-db.js` | Import results |

---

*Document generated on February 12, 2026*
*TrackHub v1.0.0*
