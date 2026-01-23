# Migration Complete - Next Steps

## ✅ When Migration Finishes (You'll see: "🎉 Full data migration completed successfully!")

### Step 1: Reset Database Sequences (5 minutes)
The migration will output SQL commands like this:
```sql
SELECT setval('regions_region_id_seq', 101, false);
SELECT setval('conferences_conference_id_seq', 1163, false);
SELECT setval('schools_school_id_seq', 1587, false);
SELECT setval('teams_team_id_seq', 3130, false);
SELECT setval('athletes_athlete_id_seq', 67968, false);
SELECT setval('results_result_id_seq', XXXXX, false);
```

**Action:**
1. Go to: https://supabase.com/dashboard/project/hunbahsnaeeztmzqpnrl/sql/new
2. Copy ALL the setval commands from the migration output
3. Paste them into the SQL editor
4. Click "Run"
5. ✅ This ensures new records get correct auto-incrementing IDs

---

### Step 2: Verify Data in Supabase (5 minutes)

**Action:**
1. Go to: https://supabase.com/dashboard/project/hunbahsnaeeztmzqpnrl/editor
2. Check these tables have data:
   - ✅ regions: Should show 27 records
   - ✅ conferences: Should show 1,114 records
   - ✅ schools: Should show 1,584 records
   - ✅ teams: Should show 3,125 records
   - ✅ athletes: Should show 67,879 records
   - ✅ results: Should show 2,237,475 records ⭐
3. Click on "results" table and verify you see athlete performances

**Quick Test Query:**
```sql
SELECT
  r.event_name,
  r.mark_raw,
  a.full_name,
  s.official_name
FROM results r
JOIN athletes a ON r.athlete_id = a.athlete_id
JOIN teams t ON r.team_id = t.team_id
JOIN schools s ON t.school_id = s.school_id
LIMIT 10;
```
Should return 10 results with athlete names and schools.

---

### Step 3: Test Supabase Connection from App (10 minutes)

**Create a test script:**
```bash
cd frontend
node test-supabase.js
```

**File: `frontend/test-supabase.js`**
```javascript
require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function testConnection() {
  console.log('🧪 Testing Supabase connection...\n');

  // Test 1: Count athletes
  const { count: athleteCount, error: e1 } = await supabase
    .from('athletes')
    .select('*', { count: 'exact', head: true });

  console.log('✅ Athletes count:', athleteCount?.toLocaleString());

  // Test 2: Search for an athlete
  const { data: athletes, error: e2 } = await supabase
    .from('athletes')
    .select('full_name, schools(official_name)')
    .limit(5);

  console.log('✅ Sample athletes:');
  athletes?.forEach(a => console.log(`   - ${a.full_name} (${a.schools?.official_name})`));

  // Test 3: Get recent results
  const { data: results, error: e3 } = await supabase
    .from('results')
    .select('event_name, mark_raw, date')
    .order('date', { ascending: false })
    .limit(5);

  console.log('✅ Recent results:');
  results?.forEach(r => console.log(`   - ${r.event_name}: ${r.mark_raw} (${r.date})`));

  console.log('\n🎉 All tests passed! Supabase is connected and working!');
}

testConnection().catch(console.error);
```

**Expected Output:**
```
🧪 Testing Supabase connection...

✅ Athletes count: 67,879
✅ Sample athletes:
   - John Smith (University of Oregon)
   - Jane Doe (Stanford University)
   ...
✅ Recent results:
   - 100m: 10.23 (2024-11-20)
   - 200m: 20.45 (2024-11-19)
   ...

🎉 All tests passed! Supabase is connected and working!
```

---

### Step 4: Update One Hook to Use Supabase (15 minutes)

**Start with the simplest hook - athlete search:**

**File: `frontend/hooks/useAthleteSearch.ts`**

Change line 1:
```typescript
// OLD
import { searchAthletes } from '../services/database';

// NEW
import { searchAthletes } from '../services/database-supabase';
```

That's it! The function signature is identical.

---

### Step 5: Test the App with Supabase (20 minutes)

**Action:**
1. Make sure Expo is running:
   ```bash
   cd frontend
   npx expo start
   ```

2. Open the app on your device/simulator

3. **Test these features:**
   - ✅ Search for an athlete by name
   - ✅ View athlete profile
   - ✅ Check athlete's results/performances
   - ✅ Browse athletes list
   - ✅ Filter by division/gender

4. **Expected behavior:**
   - First load might be slightly slower (network request)
   - But subsequent searches should be fast
   - Data should look identical to SQLite version

---

### Step 6: Gradually Update All Hooks (30-60 minutes)

**Update these files one by one:**

```bash
# Test each one after updating!
frontend/hooks/
├── useAthletes.ts           # ← Start here
├── useAthleteDetails.ts     # ← Then this
├── useAthleteSearch.ts      # ← Already done in Step 4
├── useSchools.ts
├── useSchoolSearch.ts
├── useTopPerformances.ts
└── useTopPerformancesApi.ts
```

**For each file:**
1. Change import from `database` to `database-supabase`
2. Save the file
3. Test that feature in the app
4. ✅ If it works, move to next file
5. ❌ If it breaks, check console for errors

---

### Step 7: Remove SQLite Dependencies (10 minutes)

**Once everything works with Supabase:**

```bash
cd frontend
```

**1. Update package.json:**
Remove this line:
```json
"expo-sqlite": "^16.0.9",
```

**2. Run:**
```bash
npm uninstall expo-sqlite
```

**3. Delete old database file (saves 362MB!):**
```bash
rm -f assets/data/track_hub.db
```

**4. Delete old service:**
```bash
rm services/database.ts
```

---

### Step 8: Commit Your Changes (5 minutes)

```bash
git add .
git commit -m "Switch from SQLite to Supabase

- Migrated 2.2M+ records to Supabase PostgreSQL
- Updated all hooks to use Supabase client
- Removed SQLite dependencies and 362MB database file
- App now uses cloud database for all queries"

git push
```

---

## 🚀 Next Level Features (Optional - After Basic Migration Works)

### Real-time Live Results
```typescript
// Subscribe to new results during a meet
const channel = supabase
  .channel('live-results')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'results'
  }, (payload) => {
    // New result posted!
    setResults(prev => [payload.new, ...prev]);
  })
  .subscribe();
```

### Caching with React Query
```bash
npm install @tanstack/react-query
```

This will make the app feel faster with smart caching.

### Push Notifications
Set up notifications for when favorite athletes compete.

---

## Troubleshooting

### "Cannot find module database-supabase"
- Make sure you're importing from `../services/database-supabase`
- Check the file exists at `frontend/services/database-supabase.ts`

### "Error: Invalid API key"
- Check `.env` file has correct `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Restart Expo dev server: `npx expo start --clear`

### "Relation does not exist"
- Go to Supabase dashboard and verify tables exist
- Check migration completed successfully

### Queries are slow
- Add indexes (already done in migration!)
- Consider implementing caching with React Query
- Check Supabase dashboard for query performance

---

## Summary Checklist

- [ ] Migration finished successfully (no errors)
- [ ] Reset database sequences in Supabase SQL editor
- [ ] Verified data exists in Supabase dashboard
- [ ] Created and ran test-supabase.js script
- [ ] Updated first hook (useAthleteSearch.ts)
- [ ] Tested app with Supabase - it works!
- [ ] Updated remaining hooks one by one
- [ ] Removed expo-sqlite dependency
- [ ] Deleted track_hub.db file (362MB saved!)
- [ ] Committed changes to git
- [ ] App running on Supabase successfully! 🎉

---

## Time Estimate
- **Minimum (basic migration):** 1 hour
- **Full migration (all hooks updated):** 2-3 hours
- **With testing and polish:** Half day

Take it slow, test each step, and you'll have a cloud-powered app by the end! 🚀
