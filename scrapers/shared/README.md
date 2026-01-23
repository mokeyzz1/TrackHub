# Shared Utilities

Shared code used across multiple scrapers.

## Contents

### `athlete_matcher.js`

Matches scraped athlete names to `athlete_id` in the database.

#### How It Works

1. Takes raw athlete name + team from scraper
2. Searches athletes table by name similarity
3. Filters by team/school match
4. Returns best match with confidence score

#### Usage

```javascript
const { AthleteMatcher } = require('../shared/athlete_matcher');

const matcher = new AthleteMatcher();

// Match entries for a meet
const result = await matcher.matchEntries(meetId);
console.log(`Matched ${result.matched} of ${result.total} entries`);

// Match single athlete
const athleteId = await matcher.findAthlete('John Smith', 'University of Example');
```

#### Match Algorithm

```
1. Normalize names (lowercase, remove accents, handle suffixes)
2. Search by last name in athletes table
3. Score candidates by:
   - First name similarity (Levenshtein distance)
   - Team name match
   - School match
4. Return best match if confidence > threshold
```

### `sql/`

Database migrations and schema files.

| File | Purpose |
|------|---------|
| `001_schema_updates.sql` | Initial schema for meet_entries, live_results |
| `run_migrations.js` | Migration runner script |

#### Running Migrations

Migrations should be run directly in Supabase SQL Editor:

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Open SQL Editor
3. Copy/paste the SQL file contents
4. Execute

## Environment Variables

All shared utilities expect these environment variables (from `.env` at project root):

```bash
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
```

## Adding Shared Code

When adding new shared utilities:

1. Create file in `shared/`
2. Export functions/classes
3. Import in scrapers with `require('../shared/filename')`
4. Document usage in this README
