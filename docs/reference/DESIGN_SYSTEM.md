# Track Meet Tracker - Complete Documentation

## 📱 App Overview

A React Native/Expo mobile app for tracking track and field athletes, meets, schools, and performances with a bold Simpson-inspired aesthetic that maintains clarity for sports data.

**Key Design Principle:** Sports-first design with fun Simpson aesthetic - bold structure, clean data display, high contrast, thick borders, hard shadows.

---

## 🎨 Design System

### Colors (`design-system/colors.ts`)

**Backgrounds:**
- Sky Blue (`#87CEEB`) - Primary app background
- Sunshine (`#FFE97F`) - Accent background
- White (`#FFFFFF`) - Card backgrounds
- Cream (`#FFFEF0`) - Secondary card backgrounds

**Primary Colors:**
- Track Orange (`#FF6B35`) - Primary brand color
- Finish Yellow (`#FFD700`) - Accent/highlights
- Lane Blue (`#4A90E2`) - Secondary brand
- Duff Pink (`#FF69B4`) - Special accents

**Text:**
- Primary (`#000000`) - Black for maximum readability
- Secondary (`#1E293B`) - Dark gray
- Tertiary (`#475569`) - Medium gray
- White (`#FFFFFF`) - On dark backgrounds
- Muted (`#64748B`) - Subtle text

**Performance Indicators:**
- New PR (`#00C853`) - Green for personal records
- School Record (`#9C27B0`) - Purple for school records
- Season Best (`#2196F3`) - Blue for season bests
- Improvement (`#00BCD4`) - Cyan for improvements
- National Qual (`#FF9800`) - Orange for qualifying marks

**Borders:**
- Thick (`#000000`) - 3-4px black borders everywhere

**Gradients:**
- Gold Medal - For champions/winners
- Division - For division badges
- Track Hero - For hero sections

### Typography (`design-system/typography.ts`)

**Font Weights:**
- Regular: 400
- Medium: 600
- Bold: 700
- Heavy: 800
- Black: 900 (used extensively)

**Key Principles:**
- Monospaced fonts (Courier) for times - ensures perfect alignment
- 900 weight for titles and important text
- High contrast black on white for readability

### Visual Style

**Hard Shadows:**
```typescript
shadowColor: colors.borders.thick,
shadowOffset: { width: 4, height: 4 },
shadowOpacity: 1,
shadowRadius: 0, // No blur = hard shadow
```

**Thick Borders:**
- 3-4px black borders on all cards and buttons
- Creates bold, cartoon-like appearance
- Maintains Simpson aesthetic

---

## 📂 App Structure

### Navigation Structure

```
Root (_layout.tsx)
├── FavoritesProvider (Context wrapper)
└── Tabs (_tabs/_layout.tsx)
    ├── Home (index.tsx)
    ├── Meets (meets.tsx)
    ├── Athletes (athletes.tsx)
    ├── Schools (schools.tsx)
    ├── Following (favorites.tsx)
    └── Discover (explore.tsx)

Screens (outside tabs)
├── Athlete Detail (/athlete/[id].tsx)
├── School Detail (/school/[id].tsx)
├── Event Detail (/event/[name].tsx)
├── Meet Detail (/meet/[id].tsx)
├── Search (/search.tsx)
└── Compare Athletes (/compare-athletes.tsx)
```

---

## 🏠 Tab Screens

### 1. Home (`app/(tabs)/index.tsx`)
**Purpose:** Main dashboard and quick access

**Features:**
- Welcome header with greeting
- Quick action buttons (Compare Athletes, etc.)
- Featured athletes/performances
- Recent activity
- Upcoming meets preview

**Design:**
- Sky blue background
- Yellow title with text shadow
- Large action cards with gradients

### 2. Meets (`app/(tabs)/meets.tsx`)
**Purpose:** Track live, upcoming, and past meets

**Features:**
- 3 tabs: Live, Upcoming, Past
- **Live Meets:**
  - Hot pink gradient cards
  - "LIVE NOW" animated badge
  - Current event count
  - Click to see full meet details
- **Upcoming Meets:**
  - Date, time, location
  - Number of registered athletes
  - Meet type badge
- **Past Meets:**
  - Winner highlights
  - Meet summary
  - View results

**Design:**
- Live meets: Pink gradient with pulsing indicator
- Standard meets: White cards with thick borders
- Meet type badges (Invitational, Conference, etc.)

### 3. Athletes (`app/(tabs)/athletes.tsx`)
**Purpose:** Browse and search athletes

**Features:**
- Search bar with icon
- Filter chips (All, Sprints, Distance, etc.)
- Athlete performance cards with:
  - Rank badge (gold for #1)
  - Athlete name and school
  - Event and time
  - Performance badges (PR, SR, SB, NQ)
  - Improvement indicator
- Click to view athlete detail

**Design:**
- SportsPerformanceCard component
- Monospaced times for alignment
- Color-coded performance badges
- Filter integration ready

### 4. Schools (`app/(tabs)/schools.tsx`)
**Purpose:** Browse school/team rankings

**Features:**
- Conference filter
- Division filter (D1, D2, D3, NAIA, NJCAA)
- SchoolRankingCard with:
  - Rank number
  - Trophy badges for top 3
  - School name
  - Conference
  - Division badge (color-coded)
  - Points (if applicable)
- Click to view school detail

**Design:**
- Division badges with specific colors
- Trophy icons for top 3
- Clean ranking display

### 5. Following (`app/(tabs)/favorites.tsx`)
**Purpose:** View all favorited/followed items

**Features:**
- Search favorites
- Filter tabs: All, Athletes, Schools, Events, Meets
- Count badges on tabs
- Favorite cards showing:
  - Type icon
  - Name
  - Type badge
  - Metadata (school, conference, etc.)
  - Unfollow button
- Click to navigate to detail screen
- Empty state when no favorites

**Design:**
- Heart icon tab indicator
- Interactive filter tabs
- Easy unfollow with filled heart icon
- Empty state with large heart outline

### 6. Discover (`app/(tabs)/explore.tsx`)
**Purpose:** Browse events, divisions, and conferences

**Features:**
- Event cards with gradients:
  - Sprints (orange gradient)
  - Distance (blue gradient)
  - Hurdles (purple gradient)
  - Jumps (green gradient)
  - Throws (red gradient)
  - Multi-events (rainbow gradient)
- Division sections with color-coded bars
- Conference browsing
- Top performers per category

**Design:**
- Gradient event cards with icons
- Color-coded division bars
- Clean category organization

---

## 📄 Detail Screens

### 1. Athlete Detail (`app/athlete/[id].tsx`)
**Purpose:** Complete athlete profile

**Features:**
- **Header:**
  - Back button
  - Follow/unfollow button (heart icon)
- **Hero Card:**
  - Gradient background
  - Avatar placeholder
  - Athlete name
  - School, year, division badges
- **Stats Row:**
  - Events count
  - Meets count
  - Wins count
- **Season Progression Chart:**
  - Performance over time
  - PR indicators
  - Grid lines
  - Stats summary
- **PR History Chart:**
  - Timeline of all PRs
  - Grouped by event
  - Improvement tracking
  - Latest PR highlight
- **Personal Bests:**
  - Event name
  - Time
  - When achieved
  - School Record badge (if applicable)
- **Season Performances:**
  - Uses SportsPerformanceCard
  - Shows recent season bests
- **Recent Results:**
  - Meet name
  - Event
  - Place badge (1st, 2nd, 3rd)
  - Time

**Design:**
- Gradient hero with white text shadows
- Integrated chart components
- Follow button toggles between outline/filled heart
- Scrollable content

### 2. School Detail (`app/school/[id].tsx`)
**Purpose:** School/team profile

**Features:**
- Rank badge with gradient
- School name and division
- Conference information
- Team stats
- Top athletes list
- Recent meets
- Team records

**Design:**
- Gold gradient for rank badge
- Team colors (if available)
- Athlete cards for top performers

### 3. Event Detail (`app/event/[name].tsx`)
**Purpose:** Event leaderboard and records

**Features:**
- Event name header
- Record cards:
  - World Record
  - Collegiate Record
  - Record holder name
- Current season leaderboard
- All-time best performances
- Recent results

**Design:**
- Record cards with gradients
- Leaderboard using performance cards
- Clean time comparisons

### 4. Meet Detail (`app/meet/[id].tsx`)
**Purpose:** Meet information and results

**Features:**
- 3 tabs: Live, Schedule, Results
- **Live Tab:**
  - Currently running events
  - Status indicators (Running, Starting Soon, Results In)
  - Heat/flight information
  - Real-time updates
- **Schedule Tab:**
  - Full event schedule
  - Organized by time
  - Event type icons
  - Entry counts
- **Results Tab:**
  - Final results by event
  - Place rankings
  - Times/marks
  - Winner highlights

**Design:**
- Tab switcher
- Status badges for live events
- Clean result cards
- Time-organized schedule

### 5. Search (`app/search.tsx`)
**Purpose:** Global search interface

**Features:**
- Auto-focused search input
- Recent searches
- Popular searches
- Search suggestions
- Results by category:
  - Athletes
  - Schools
  - Events
  - Meets

**Design:**
- Prominent search bar
- Recent searches with X to clear
- Popular searches as chips
- Categorized results

### 6. Compare Athletes (`app/compare-athletes.tsx`)
**Purpose:** Side-by-side athlete comparison

**Features:**
- Two athlete selectors
- Searchable athlete picker modal
- Swap button to switch athletes
- AthleteComparisonChart showing:
  - Personal Best comparison
  - Season Best comparison
  - Average Time comparison
  - Meets, PRs, Wins comparison
  - Visual winner indication
  - Difference calculation
- Head-to-head stats
- Better performance highlighted

**Design:**
- Side-by-side selection cards
- Swap button in center
- Green highlighting for better stats
- Modal picker with search

---

## 🧩 Reusable Components

### UI Components (`components/ui/`)

#### 1. SportsPerformanceCard
**File:** `components/ui/SportsPerformanceCard.tsx`

**Props:**
```typescript
interface SportsPerformanceCardProps {
  rank?: number;
  athleteName: string;
  schoolName: string;
  event: string;
  time: string;
  badge?: 'PR' | 'SR' | 'SB' | 'NQ';
  improvement?: string;
  onPress?: () => void;
}
```

**Features:**
- Rank badge (gold gradient for #1)
- Athlete and school names
- Event name
- Monospaced time
- Performance badge (PR/SR/SB/NQ) with gradients
- Improvement indicator
- Pressable

**Usage:**
```tsx
<SportsPerformanceCard
  rank={1}
  athleteName="Sarah Johnson"
  schoolName="Oregon State"
  event="Women's 800m"
  time="2:02.15"
  badge="PR"
  improvement="-2.4s"
  onPress={() => router.push('/athlete/1')}
/>
```

#### 2. SchoolRankingCard
**File:** `components/ui/SchoolRankingCard.tsx`

**Props:**
```typescript
interface SchoolRankingCardProps {
  rank: number;
  schoolName: string;
  conference: string;
  division: 'D1' | 'D2' | 'D3' | 'NAIA' | 'NJCAA';
  points?: number;
  onPress?: () => void;
}
```

**Features:**
- Rank number
- Trophy badges for top 3
- School name
- Conference
- Division badge (color-coded)
- Points display
- Pressable

**Usage:**
```tsx
<SchoolRankingCard
  rank={1}
  schoolName="Oregon State"
  conference="Pac-12"
  division="D1"
  points={245}
  onPress={() => router.push('/school/1')}
/>
```

#### 3. ModernPerformanceCard
**File:** `components/ui/ModernPerformanceCard.tsx`

**Features:**
- Alternative performance card style
- Used in home screen examples

### Chart Components (`components/charts/`)

#### 1. SeasonProgressionChart
**File:** `components/charts/SeasonProgressionChart.tsx`

**Props:**
```typescript
interface PerformanceData {
  date: string;
  time: number; // in seconds
  displayTime: string; // "2:02.15"
  meet: string;
  isPR?: boolean;
}

interface SeasonProgressionChartProps {
  data: PerformanceData[];
  eventName: string;
}
```

**Features:**
- Line chart showing performance over season
- Data points (larger/green for PRs)
- Grid lines
- Y-axis with time labels
- X-axis with dates
- Connecting lines between points
- Stats summary:
  - Season Best
  - Average Time
  - Total Improvement
- Legend (PR vs Performance)

**Usage:**
```tsx
<SeasonProgressionChart
  data={progressionData}
  eventName="Women's 800m"
/>
```

#### 2. PRHistoryChart
**File:** `components/charts/PRHistoryChart.tsx`

**Props:**
```typescript
interface PRRecord {
  date: string;
  time: number;
  displayTime: string;
  meet: string;
  event: string;
}

interface PRHistoryChartProps {
  data: PRRecord[];
  athleteName: string;
}
```

**Features:**
- Timeline view of PRs
- Grouped by event
- Chronological within each event
- Timeline connector dots and lines
- Latest PR highlighted in green
- Improvement badges showing time difference
- Summary stats:
  - Total PRs
  - Events count
  - Latest PR date
- Meet and date for each PR

**Usage:**
```tsx
<PRHistoryChart
  data={prHistoryData}
  athleteName="Sarah Johnson"
/>
```

#### 3. AthleteComparisonChart
**File:** `components/charts/AthleteComparisonChart.tsx`

**Props:**
```typescript
interface AthleteStats {
  name: string;
  school: string;
  personalBest: string;
  seasonBest: string;
  avgTime: string;
  meets: number;
  prs: number;
  wins: number;
}

interface AthleteComparisonChartProps {
  athlete1: AthleteStats;
  athlete2: AthleteStats;
  eventName: string;
}
```

**Features:**
- Head-to-head comparison
- Athlete headers with names and schools
- VS badge in center
- Comparison rows for:
  - Personal Best (time comparison)
  - Season Best (time comparison)
  - Average Time
  - Meets
  - PRs
  - Wins
- Better value highlighted in green
- Winner summary at bottom
- Time difference calculation

**Usage:**
```tsx
<AthleteComparisonChart
  athlete1={athlete1Stats}
  athlete2={athlete2Stats}
  eventName="Women's 800m"
/>
```

### Filter Components (`components/filters/`)

#### AdvancedFilter
**File:** `components/filters/AdvancedFilter.tsx`

**Props:**
```typescript
interface FilterOptions {
  gender?: 'all' | 'men' | 'women' | 'mixed';
  eventType?: string[];
  division?: string[];
  conference?: string[];
  sortBy?: 'time' | 'date' | 'name' | 'rank';
  sortOrder?: 'asc' | 'desc';
  qualifyingOnly?: boolean;
}

interface AdvancedFilterProps {
  visible: boolean;
  onClose: () => void;
  onApply: (filters: FilterOptions) => void;
  initialFilters?: FilterOptions;
  showEventTypeFilter?: boolean;
  showDivisionFilter?: boolean;
  showConferenceFilter?: boolean;
  showSortOptions?: boolean;
}
```

**Features:**
- Full-screen modal
- Gender filter (All/Men/Women/Mixed)
- Event type multi-select (Sprints/Distance/Hurdles/Jumps/Throws/Multi)
- Division multi-select (D1/D2/D3/NAIA/NJCAA)
- Conference multi-select
- Qualifying times toggle
- Sort options with direction (asc/desc)
- Reset button
- Apply button
- Configurable sections (show/hide specific filters)

**Usage:**
```tsx
const [filterVisible, setFilterVisible] = useState(false);
const [filters, setFilters] = useState<FilterOptions>({});

<AdvancedFilter
  visible={filterVisible}
  onClose={() => setFilterVisible(false)}
  onApply={(newFilters) => {
    setFilters(newFilters);
    // Apply filters to data
  }}
  initialFilters={filters}
  showEventTypeFilter={true}
  showDivisionFilter={true}
/>
```

### Social Components (`components/social/`)

#### CommentsSection
**File:** `components/social/CommentsSection.tsx`

**Props:**
```typescript
interface Comment {
  id: string;
  user: string;
  userAvatar?: string;
  text: string;
  timestamp: string;
  likes: number;
  isLiked?: boolean;
  replies?: Comment[];
}

interface CommentsSectionProps {
  comments: Comment[];
  onAddComment?: (text: string) => void;
  onLikeComment?: (commentId: string) => void;
  onReplyToComment?: (commentId: string, text: string) => void;
}
```

**Features:**
- Add new comments
- Like/unlike comments
- Reply to comments
- Nested replies display
- User avatars
- Timestamps
- Like count
- Comment count badge
- Empty state
- Keyboard-aware scrolling
- Real-time updates

**Usage:**
```tsx
<CommentsSection
  comments={meetComments}
  onAddComment={(text) => console.log('New comment:', text)}
  onLikeComment={(id) => console.log('Liked:', id)}
  onReplyToComment={(id, text) => console.log('Reply to', id, ':', text)}
/>
```

---

## 🔧 Context/State Management

### FavoritesContext
**File:** `contexts/FavoritesContext.tsx`

**Purpose:** Global state for favorites/following

**Interface:**
```typescript
interface Favorite {
  id: string;
  type: 'athlete' | 'school' | 'event' | 'meet';
  name: string;
  metadata?: any;
}

interface FavoritesContextType {
  favorites: Favorite[];
  addFavorite: (item: Favorite) => void;
  removeFavorite: (id: string, type: string) => void;
  isFavorite: (id: string, type: string) => boolean;
  getFavoritesByType: (type: string) => Favorite[];
}
```

**Usage:**
```tsx
// Wrap app with provider (already done in _layout.tsx)
<FavoritesProvider>
  {/* app content */}
</FavoritesProvider>

// Use in components
import { useFavorites } from '@/contexts/FavoritesContext';

const { favorites, addFavorite, removeFavorite, isFavorite } = useFavorites();

// Check if favorited
const isFollowing = isFavorite('athlete-123', 'athlete');

// Add to favorites
addFavorite({
  id: 'athlete-123',
  type: 'athlete',
  name: 'Sarah Johnson',
  metadata: { school: 'Oregon State' }
});

// Remove from favorites
removeFavorite('athlete-123', 'athlete');

// Get all favorites of a type
const athleteFavorites = getFavoritesByType('athlete');
```

**Features:**
- Prevents duplicate favorites
- Type-safe favorite types
- Metadata support for additional info
- Filter by type
- Check favorite status

---

## 🎯 Key Features Summary

### ✅ Completed Features

1. **Navigation System**
   - 6-tab bottom navigation
   - Stack navigation for detail screens
   - Deep linking ready

2. **Favorites/Following**
   - Global context for state
   - Follow/unfollow from detail screens
   - Dedicated favorites tab
   - Search and filter favorites

3. **Performance Tracking**
   - Season progression charts
   - PR history timelines
   - Performance comparisons
   - Stats summaries

4. **Athlete Features**
   - Athlete browsing
   - Detailed profiles
   - Performance history
   - Follow athletes
   - Compare athletes

5. **School Features**
   - School rankings
   - Division filtering
   - Conference organization
   - School profiles

6. **Meet Features**
   - Live meet tracking
   - Upcoming meets
   - Past meet results
   - Full schedule view
   - Live event status

7. **Event Features**
   - Event browsing
   - Records display
   - Leaderboards
   - Event filtering

8. **Social Features**
   - Comments system
   - Like/reply functionality
   - User interactions

9. **Data Visualization**
   - 3 chart types
   - Performance trends
   - Comparison views
   - Statistical summaries

10. **Search & Filter**
    - Global search
    - Advanced filtering
    - Multi-criteria filters
    - Sort options

---

## 🎨 Design Principles

### Simpson Aesthetic
- **Bright Backgrounds:** Sky blue primary color
- **Thick Borders:** 3-4px black borders on all elements
- **Hard Shadows:** No blur (shadowRadius: 0)
- **Bold Typography:** 900 weight for titles
- **Cartoon Feel:** Gradients, bold colors, playful

### Sports-First Design
- **High Contrast:** Black text on white for readability
- **Monospaced Times:** Perfect alignment for performance data
- **Clear Hierarchy:** Important data stands out
- **Performance Indicators:** Color-coded badges (PR/SR/SB/NQ)
- **Data Clarity:** Never sacrifice readability for style

### Consistency
- **Component Reuse:** Same components across screens
- **Color Usage:** Consistent color meanings
- **Spacing:** Regular padding/margin patterns
- **Shadows:** Consistent shadow offsets
- **Border Radius:** Standard border radius values

---

## 📊 Sample Data Structures

### Athlete
```typescript
{
  id: string;
  name: string;
  school: string;
  year: 'Freshman' | 'Sophomore' | 'Junior' | 'Senior';
  division: 'D1' | 'D2' | 'D3' | 'NAIA' | 'NJCAA';
  hometown: string;
  events: string[];
  personalBests: {
    event: string;
    time: string;
    when: string;
    isSR?: boolean;
  }[];
  seasonBests: {
    event: string;
    time: string;
    badge: 'PR' | 'SR' | 'SB' | 'NQ';
  }[];
  recentResults: {
    meet: string;
    event: string;
    place: number;
    time: string;
  }[];
}
```

### School
```typescript
{
  id: string;
  name: string;
  division: 'D1' | 'D2' | 'D3' | 'NAIA' | 'NJCAA';
  conference: string;
  rank: number;
  points?: number;
  topAthletes: Athlete[];
  recentMeets: Meet[];
}
```

### Meet
```typescript
{
  id: string;
  name: string;
  date: string;
  location: string;
  isLive: boolean;
  type: 'Invitational' | 'Conference' | 'Regional' | 'National';
  events: {
    event: string;
    time: string;
    status: 'Completed' | 'In Progress' | 'Scheduled';
    results?: Performance[];
  }[];
}
```

### Performance
```typescript
{
  id: string;
  athleteId: string;
  athleteName: string;
  school: string;
  event: string;
  time: string;
  place: number;
  meetId: string;
  meetName: string;
  date: string;
  isPR?: boolean;
  isSR?: boolean;
}
```

---

## 🚀 Next Steps / Future Enhancements

### Potential Additions:
1. **Backend Integration**
   - Connect to real database
   - Live data updates
   - User authentication

2. **Push Notifications**
   - Live meet alerts
   - Favorite athlete updates
   - PR notifications

3. **Offline Support**
   - Cache data locally
   - Offline viewing
   - Sync when online

4. **Video Integration**
   - Race/performance videos
   - Technique analysis
   - Highlights

5. **Training Logs**
   - Workout tracking
   - Training plans
   - Progress monitoring

6. **Team Features**
   - Team pages
   - Roster management
   - Team stats

7. **Advanced Analytics**
   - Predictive modeling
   - Performance trends
   - Comparative analytics

8. **Social Expansion**
   - User profiles
   - Follow other users
   - Share performances
   - Activity feed

9. **Calendar Integration**
   - Add meets to calendar
   - Reminders
   - Schedule sync

10. **Export/Sharing**
    - Share charts
    - Export data
    - PDF reports

---

## 📝 File Structure

```
track-meet-tracker/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx          # Tab navigation config
│   │   ├── index.tsx             # Home tab
│   │   ├── meets.tsx             # Meets tab
│   │   ├── athletes.tsx          # Athletes tab
│   │   ├── schools.tsx           # Schools tab
│   │   ├── favorites.tsx         # Following tab
│   │   └── explore.tsx           # Discover tab
│   ├── athlete/
│   │   └── [id].tsx              # Athlete detail screen
│   ├── school/
│   │   └── [id].tsx              # School detail screen
│   ├── event/
│   │   └── [name].tsx            # Event detail screen
│   ├── meet/
│   │   └── [id].tsx              # Meet detail screen
│   ├── _layout.tsx               # Root layout with providers
│   ├── search.tsx                # Search screen
│   └── compare-athletes.tsx      # Athlete comparison
├── components/
│   ├── ui/
│   │   ├── SportsPerformanceCard.tsx
│   │   ├── SchoolRankingCard.tsx
│   │   └── ModernPerformanceCard.tsx
│   ├── charts/
│   │   ├── SeasonProgressionChart.tsx
│   │   ├── PRHistoryChart.tsx
│   │   └── AthleteComparisonChart.tsx
│   ├── filters/
│   │   └── AdvancedFilter.tsx
│   └── social/
│       └── CommentsSection.tsx
├── contexts/
│   └── FavoritesContext.tsx      # Global favorites state
├── design-system/
│   ├── colors.ts                 # Color palette
│   └── typography.ts             # Typography system
├── assets/
│   └── fonts/
├── DOCUMENTATION.md              # This file
└── package.json
```

---

## 🎯 Component Usage Examples

### Example 1: Athletes List with Filters
```tsx
import { useState } from 'react';
import { SportsPerformanceCard } from '@/components/ui/SportsPerformanceCard';
import { AdvancedFilter, FilterOptions } from '@/components/filters/AdvancedFilter';

export default function AthletesScreen() {
  const [filterVisible, setFilterVisible] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({});

  return (
    <View>
      <TouchableOpacity onPress={() => setFilterVisible(true)}>
        <Text>Filters</Text>
      </TouchableOpacity>

      {athletes.map(athlete => (
        <SportsPerformanceCard
          key={athlete.id}
          athleteName={athlete.name}
          schoolName={athlete.school}
          event={athlete.event}
          time={athlete.time}
          badge={athlete.badge}
          onPress={() => router.push(`/athlete/${athlete.id}`)}
        />
      ))}

      <AdvancedFilter
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        onApply={setFilters}
        initialFilters={filters}
      />
    </View>
  );
}
```

### Example 2: Athlete Detail with Charts
```tsx
import { SeasonProgressionChart } from '@/components/charts/SeasonProgressionChart';
import { PRHistoryChart } from '@/components/charts/PRHistoryChart';
import { useFavorites } from '@/contexts/FavoritesContext';

export default function AthleteDetail() {
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const isFollowing = isFavorite(athlete.id, 'athlete');

  return (
    <ScrollView>
      <TouchableOpacity onPress={() =>
        isFollowing
          ? removeFavorite(athlete.id, 'athlete')
          : addFavorite({ id: athlete.id, type: 'athlete', name: athlete.name })
      }>
        <Ionicons name={isFollowing ? 'heart' : 'heart-outline'} />
      </TouchableOpacity>

      <SeasonProgressionChart
        data={progressionData}
        eventName="Women's 800m"
      />

      <PRHistoryChart
        data={prHistoryData}
        athleteName={athlete.name}
      />
    </ScrollView>
  );
}
```

### Example 3: Meet with Comments
```tsx
import { CommentsSection } from '@/components/social/CommentsSection';

export default function MeetDetail() {
  const [comments, setComments] = useState(meetComments);

  return (
    <View>
      {/* Meet info */}

      <CommentsSection
        comments={comments}
        onAddComment={(text) => {
          // Add to backend
          setComments([...comments, newComment]);
        }}
        onLikeComment={(id) => {
          // Update backend
          // Update local state
        }}
      />
    </View>
  );
}
```

---

## 💡 Best Practices

### When Creating New Screens:
1. Use SafeAreaView with edges prop
2. Set sky blue background
3. Include ScrollView for content
4. Add thick borders to cards
5. Use hard shadows consistently
6. Follow spacing patterns

### When Creating New Components:
1. Export interface for props
2. Use colors from design system
3. Apply thick borders (3-4px)
4. Use hard shadows
5. Make pressable items obvious
6. Support dark mode (future)

### Performance:
1. Use React.memo for heavy components
2. Avoid inline function creation in lists
3. Use FlatList for long lists
4. Optimize images
5. Lazy load data

### Accessibility:
1. Add accessible labels
2. Support text scaling
3. Ensure color contrast
4. Test with screen readers
5. Support keyboard navigation

---

## 🐛 Known Limitations

1. **Sample Data:** All data is currently hardcoded samples
2. **No Backend:** Not connected to real database
3. **No Auth:** No user authentication system
4. **Limited Persistence:** State doesn't persist across app restarts
5. **Chart Interactivity:** Charts are static, not interactive
6. **Search:** Search is local only, not comprehensive
7. **Filters:** Filters don't actually filter data yet (UI only)

---

## 📚 Dependencies

Key packages used:
- `expo` - Mobile app framework
- `expo-router` - File-based routing
- `react-native` - Core mobile framework
- `expo-linear-gradient` - Gradient backgrounds
- `@expo/vector-icons` - Icon library
- `react-native-safe-area-context` - Safe area handling

---

## 🎓 Learning Resources

To understand this codebase:
1. React Native basics
2. Expo Router navigation
3. React Context API
4. TypeScript interfaces
5. React Native styling
6. Component composition patterns

---

**Last Updated:** November 2025
**Version:** 1.0.0
**Status:** MVP Complete with Advanced Features
