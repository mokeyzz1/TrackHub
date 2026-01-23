# Supabase Migration Guide

## Overview

We're migrating from local SQLite to cloud-based Supabase PostgreSQL. This gives us:

- ✅ **Cloud database** - No more bundling 362MB database with the app
- ✅ **Real-time updates** - Live meet results via subscriptions
- ✅ **Better performance** - Indexed PostgreSQL queries
- ✅ **Multi-platform** - Same data across iOS, Android, web
- ✅ **Scalability** - Handles thousands of concurrent users

## Key Differences

### 1. No Database Initialization

**SQLite (old):**
```typescript
const db = await getDatabase();  // Load and open local file
const results = await db.getAllAsync(query, params);
```

**Supabase (new):**
```typescript
import { supabase } from '../lib/supabase';  // Already connected
const { data, error } = await supabase.from('results').select('*');
```

### 2. Query Builder vs SQL Strings

**SQLite (old):**
```typescript
const query = `
  SELECT a.*, s.official_name as school_name
  FROM athletes a
  LEFT JOIN schools s ON a.school_id = s.school_id
  WHERE a.athlete_id = ?
`;
const result = await db.getFirstAsync(query, [athleteId]);
```

**Supabase (new):**
```typescript
const { data } = await supabase
  .from('athletes')
  .select(`
    *,
    schools (
      official_name
    )
  `)
  .eq('athlete_id', athleteId)
  .single();
```

### 3. Automatic Foreign Key Joins

Supabase automatically follows foreign key relationships:

```typescript
// This nested select automatically joins via school_id foreign key
.select(`
  athlete_id,
  full_name,
  schools (
    official_name,
    division
  )
`)
```

### 4. Error Handling

**SQLite:** Throws exceptions
**Supabase:** Returns `{ data, error }` tuple

```typescript
const { data, error } = await supabase.from('athletes').select('*');

if (error) {
  console.error('Error:', error);
  throw error;
}

// Use data safely here
```

### 5. Boolean Values

- **SQLite:** Uses integers (0 = false, 1 = true)
- **Supabase:** Uses native booleans (true/false)

```typescript
// SQLite
.eq('is_active', 1)

// Supabase
.eq('is_active', true)
```

### 6. Pagination

**SQLite:**
```typescript
LIMIT ? OFFSET ?
```

**Supabase:**
```typescript
.range(offset, offset + limit - 1)
.select('*', { count: 'exact' })  // Also returns total count!
```

## Migration Checklist

### Phase 1: Setup (DONE ✅)
- [x] Create Supabase project
- [x] Run schema migration
- [x] Migrate all data (2.2M+ records)
- [x] Install @supabase/supabase-js
- [x] Configure environment variables
- [x] Create supabase client

### Phase 2: Convert Database Layer (IN PROGRESS)
- [x] Create database-supabase.ts with all functions
- [ ] Test each function with Supabase data
- [ ] Update imports in hooks to use database-supabase
- [ ] Remove SQLite dependencies

### Phase 3: Update Hooks
Files to update:
- [ ] `hooks/useAthletes.ts`
- [ ] `hooks/useSchools.ts`
- [ ] `hooks/useAthleteDetails.ts`
- [ ] `hooks/useTopPerformances.ts`
- [ ] Any other hooks using database.ts

### Phase 4: Enable Real-time Features
- [ ] Subscribe to live result updates
- [ ] Add push notifications
- [ ] Live meet leaderboards

### Phase 5: Cleanup
- [ ] Remove expo-sqlite dependency
- [ ] Delete frontend/assets/data/track_hub.db (save 362MB!)
- [ ] Remove database.ts (old SQLite version)

## Converting a Hook Example

**Before (SQLite):**
```typescript
// hooks/useAthletes.ts
import { getAthletes } from '../services/database';

export function useAthletes() {
  const [athletes, setAthletes] = useState([]);

  useEffect(() => {
    const loadAthletes = async () => {
      const result = await getAthletes({ limit: 50 });
      setAthletes(result.data);
    };
    loadAthletes();
  }, []);

  return athletes;
}
```

**After (Supabase):**
```typescript
// hooks/useAthletes.ts
import { getAthletes } from '../services/database-supabase';

export function useAthletes() {
  const [athletes, setAthletes] = useState([]);

  useEffect(() => {
    const loadAthletes = async () => {
      const result = await getAthletes({ limit: 50 });
      setAthletes(result.data);
    };
    loadAthletes();
  }, []);

  return athletes;
}
```

**That's it!** Just change the import. The API is identical.

## Real-time Subscriptions (NEW!)

Once we're on Supabase, we can add live updates:

```typescript
// Subscribe to new results for a meet
const subscription = supabase
  .channel('meet-results')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'results',
    filter: `meet_id=eq.${meetId}`
  }, (payload) => {
    console.log('New result posted!', payload.new);
    // Update UI with new result
  })
  .subscribe();

// Cleanup
return () => {
  subscription.unsubscribe();
};
```

## Testing Strategy

1. **Test one function at a time**
   - Start with `searchAthletes()` - simple query
   - Then `getAthleteDetails()` - with joins
   - Finally complex ones like `getAthleteComparisonStats()`

2. **Use both databases temporarily**
   - Keep SQLite working during migration
   - Add a feature flag to switch between them
   - Compare results side-by-side

3. **Test performance**
   - Supabase might be slower initially (network)
   - But no 362MB database load on app start
   - Add loading states for better UX

## Environment Variables

Make sure you have in `.env`:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://hunbahsnaeeztmzqpnrl.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Next Steps

1. **Wait for migration to complete** (~20 more minutes)
2. **Test database-supabase.ts functions** with real data
3. **Update one hook at a time** to use new service
4. **Test the app** on both iOS and Android
5. **Enable real-time features** once basic CRUD works

## Questions?

- **Q: Will this work offline?**
  - A: Not initially. We can add offline caching later with React Query or similar.

- **Q: What about the 362MB database?**
  - A: Once migration is complete, we can delete it from assets! App will be much smaller.

- **Q: Performance concerns?**
  - A: Network requests are slower than local SQLite, but we can add caching and the UX will be much better (no 2-3 second load time on app start).

- **Q: Cost?**
  - A: Supabase free tier is very generous (500MB database, 2GB bandwidth/month). Should be fine for now.
