# TrackHub: Technical Deep Dive

## Database Architecture

### Core Schema

```sql
-- Athletes: 123,000+ records
athletes (
  athlete_id INT PRIMARY KEY,
  full_name TEXT,
  gender CHAR(1),           -- 'M' or 'F'
  class_year TEXT,          -- FR, SO, JR, SR, GR
  primary_events TEXT,
  school_id INT REFERENCES schools(school_id)
)

-- Results: 2.8 million+ records
results (
  result_id BIGSERIAL PRIMARY KEY,
  athlete_id INT REFERENCES athletes(athlete_id),
  meet_id INT REFERENCES meets(meet_id),
  event_name TEXT,          -- Normalized: "100m", "Shot Put"
  mark_raw TEXT,            -- Original: "10.45", "4:15.67"
  mark_seconds NUMERIC,     -- Parsed for track events
  mark_meters NUMERIC,      -- Parsed for field events
  place SMALLINT,
  round TEXT,               -- Finals, Preliminaries
  date DATE
)

-- Meets: 12,000+ records
meets (
  meet_id INT PRIMARY KEY,
  name TEXT,
  date DATE,
  end_date DATE,            -- Multi-day support
  location TEXT,
  meet_url TEXT,            -- Live timing link
  status TEXT,              -- upcoming, live, completed
  season TEXT               -- indoor, outdoor
)
```

### Performance Optimization: Database Functions

The key performance breakthrough was moving scoring logic from 45+ client queries to a single PostgreSQL function:

```sql
CREATE OR REPLACE FUNCTION get_top_performances(
  p_start_date DATE,
  p_end_date DATE,
  p_division TEXT DEFAULT NULL,
  p_gender CHAR(1) DEFAULT NULL,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  athlete_id INT,
  full_name TEXT,
  school_name TEXT,
  event_name TEXT,
  mark_raw TEXT,
  wa_points NUMERIC,
  meet_name TEXT,
  date DATE
) AS $$
BEGIN
  RETURN QUERY
  WITH scored_results AS (
    SELECT
      r.athlete_id,
      a.full_name,
      s.official_name as school_name,
      r.event_name,
      r.mark_raw,
      -- WA Scoring calculation inline
      CASE
        WHEN r.event_name = '100m' AND a.gender = 'M' THEN
          GREATEST(0, LEAST(1600,
            1.341 * POWER(r.mark_seconds, 2)
            - 233.012 * r.mark_seconds
            + 6385.543
          ))
        -- ... 100+ event cases
      END as wa_points,
      r.meet_name,
      r.date,
      -- Detect indoor meets by 60m presence
      EXISTS(
        SELECT 1 FROM results r2
        WHERE r2.meet_id = r.meet_id
        AND r2.event_name LIKE '%60m%'
      ) as is_indoor
    FROM results r
    JOIN athletes a ON r.athlete_id = a.athlete_id
    JOIN schools s ON a.school_id = s.school_id
    WHERE r.date BETWEEN p_start_date AND p_end_date
      AND (p_division IS NULL OR s.division = p_division)
      AND (p_gender IS NULL OR a.gender = p_gender)
  ),
  -- Deduplicate: best performance per athlete
  ranked AS (
    SELECT *, ROW_NUMBER() OVER (
      PARTITION BY athlete_id
      ORDER BY wa_points DESC
    ) as rn
    FROM scored_results
    WHERE wa_points > 0
  )
  SELECT athlete_id, full_name, school_name, event_name,
         mark_raw, wa_points, meet_name, date
  FROM ranked
  WHERE rn = 1
  ORDER BY wa_points DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
```

**Result:** Query time reduced from 2-3 seconds to 50-100ms.

---

## World Athletics Scoring Implementation

### The Formula

World Athletics uses a quadratic equation for each event:

```
points = a × x² + b × x + c

Where:
- x = performance (seconds for track, meters for field)
- a, b, c = event-specific coefficients
- Points capped at 0-1600 range
```

### Coefficient Storage

```typescript
// frontend/utils/waScoring.ts
const WA_COEFFICIENTS = {
  men: {
    // Track Events (lower time = higher score)
    "100m": { a: 1.341, b: -233.012, c: 6385.543 },
    "200m": { a: 5.083, b: -360.826, c: 6403.154 },
    "400m": { a: 24.381, b: -831.256, c: 7104.321 },
    "800m": { a: 132.500, b: -2085.000, c: 8220.000 },
    "1500m": { a: 0.0069, b: -26.690, c: 25790.000 },
    "5000m": { a: 0.000057, b: -1.308, c: 7496.136 },
    // ... 50+ events

    // Field Events (higher distance = higher score)
    "Shot Put": { a: -0.042, b: 5.733, c: -76.234 },
    "Long Jump": { a: -1.966, b: 29.134, c: -92.232 },
    // ...
  },
  women: {
    "100m": { a: 2.808, b: -294.184, c: 4476.976 },
    // ... 50+ events
  }
};
```

### Indoor vs Outdoor Detection

Indoor meets have different coefficients for some events due to banked tracks:

```typescript
function detectIndoorMeet(results: Result[]): boolean {
  // 60m is an indoor-only event
  return results.some(r =>
    r.event_name.includes('60m') &&
    !r.event_name.includes('60mH')
  );
}

function getCoefficients(event: string, gender: string, isIndoor: boolean) {
  if (isIndoor && INDOOR_EVENTS.includes(event)) {
    return WA_COEFFICIENTS[gender][`${event}_indoor`];
  }
  return WA_COEFFICIENTS[gender][event];
}
```

---

## Scraping Architecture

### Meet Discovery (Puppeteer + Stealth)

```javascript
// scrapers/meets/scrape_meets_github.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

async function scrapeMeets() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Mimic real browser
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/120.0.0.0 Safari/537.36'
  );

  await page.goto('https://www.ustfccca.org/meets-results', {
    waitUntil: 'networkidle0',
    timeout: 60000
  });

  // Wait for dynamic content
  await page.waitForSelector('.meet-card', { timeout: 30000 });

  // Extract meet data
  const meets = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.meet-card'))
      .map(card => ({
        name: card.querySelector('.meet-name')?.textContent,
        date: card.querySelector('.meet-date')?.textContent,
        location: card.querySelector('.meet-location')?.textContent,
        url: card.querySelector('a')?.href
      }));
  });

  await browser.close();
  return meets;
}
```

### Results Scraping (Cheerio)

```javascript
// scrapers/tfrrs/meet-scraper/scrape-meet-results.js
const cheerio = require('cheerio');
const axios = require('axios');

async function scrapeResults(meetUrl) {
  const { data: html } = await axios.get(meetUrl, {
    headers: { 'User-Agent': 'TrackHub/1.0' }
  });

  const $ = cheerio.load(html);
  const results = [];

  // Parse each event section
  $('.event-results').each((_, eventSection) => {
    const eventName = $(eventSection).find('.event-name').text();

    $(eventSection).find('tr.result-row').each((_, row) => {
      results.push({
        event_name: normalizeEventName(eventName),
        place: parseInt($(row).find('.place').text()),
        athlete_name: $(row).find('.athlete-name').text(),
        mark_raw: $(row).find('.mark').text(),
        school: $(row).find('.school').text()
      });
    });
  });

  return results;
}
```

### Event Name Normalization

```javascript
// 100+ variations handled
const EVENT_MAPPINGS = {
  // Sprints
  '100 meters': '100m',
  '100 meter dash': '100m',
  '100m dash': '100m',
  '100': '100m',

  // Hurdles
  '110 meter hurdles': '110mH',
  '110m hurdles': '110mH',
  '110mh': '110mH',
  '110 hurdles': '110mH',

  // Field Events
  'shot put': 'Shot Put',
  'sp': 'Shot Put',
  'shot': 'Shot Put',

  // Distance
  '5000 meters': '5000m',
  '5000m run': '5000m',
  '5k': '5000m',

  // ...
};

function normalizeEventName(raw) {
  const cleaned = raw.toLowerCase().trim();
  return EVENT_MAPPINGS[cleaned] || inferEventName(cleaned);
}
```

### Meet Matching Algorithm

```javascript
const MEET_NAME_MAPPINGS = {
  'ncaa division i indoor': 'ncaa division i indoor track',
  'ncaa division ii indoor': 'ncaa division ii indoor track',
  'ncaa division iii indoor': 'ncaa division iii indoor track',
};

function findMatchingMeet(tffrrsMeetName, tfrrsDate, dbMeets) {
  // 1. Check manual mappings
  const mapped = MEET_NAME_MAPPINGS[tffrrsMeetName.toLowerCase()];
  if (mapped) {
    const match = dbMeets.find(m =>
      m.name.toLowerCase().includes(mapped) &&
      isWithinDateRange(m.date, m.end_date, tfrrsDate)
    );
    if (match) return match;
  }

  // 2. Fuzzy match on normalized names
  const candidates = dbMeets
    .filter(m => isWithinDateRange(m.date, m.end_date, tfrrsDate, 1))
    .map(m => ({
      meet: m,
      score: calculateSimilarity(
        normalizeMeetName(m.name),
        normalizeMeetName(tffrrsMeetName)
      )
    }))
    .sort((a, b) => b.score - a.score);

  // 3. Return best match if above threshold
  if (candidates.length > 0 && candidates[0].score > 0.35) {
    return candidates[0].meet;
  }

  return null;
}

function calculateSimilarity(name1, name2) {
  const words1 = name1.split(/\s+/);
  const words2 = name2.split(/\s+/);

  let matches = 0;
  for (const word of words1) {
    if (word.length > 2 && words2.some(w => w.includes(word) || word.includes(w))) {
      matches++;
    }
  }

  return matches / Math.max(words1.length, words2.length);
}
```

---

## Caching Strategy

### Three-Layer Cache

```typescript
// Layer 1: AsyncStorage (persistent)
const CACHE_KEY = `top_performances_week${weeksAgo}_${division}_${gender}`;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getTopPerformances(filters) {
  // Check cache
  const cached = await AsyncStorage.getItem(CACHE_KEY);
  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < CACHE_TTL) {
      return data;
    }
  }

  // Fetch fresh
  const data = await supabase.rpc('get_top_performances', filters);

  // Update cache
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
    data,
    timestamp: Date.now()
  }));

  return data;
}

// Layer 2: In-memory (session)
const meetsCache: Record<string, Meet[]> = {};

// Layer 3: Database indexes
// CREATE INDEX idx_results_date ON results(date DESC);
// CREATE INDEX idx_results_athlete ON results(athlete_id);
```

---

## GitHub Actions Workflows

### Meets Scraper

```yaml
# .github/workflows/scrape-meets.yml
name: Scrape Meets

on:
  schedule:
    - cron: '0 6 * * 1,4,5'  # Mon, Thu, Fri at 6 AM UTC
  workflow_dispatch:
    inputs:
      scope:
        description: 'Scope'
        required: true
        default: 'this_week'
        type: choice
        options:
          - this_week
          - next_week
          - next_month
          - all

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          cd scrapers/meets
          npm ci

      - name: Run scraper
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
        run: |
          cd scrapers/meets
          node scrape_meets_github.js --scope=${{ inputs.scope || 'this_week' }}

      - name: Upload logs
        uses: actions/upload-artifact@v4
        with:
          name: scraper-logs
          path: scrapers/meets/logs/
          retention-days: 30
```

### Results Sync

```yaml
# .github/workflows/sync-results.yml
name: Sync Weekend Results

on:
  schedule:
    - cron: '0 4 * * 1'   # Sunday 10 PM Central (4 AM UTC Monday)
    - cron: '0 14 * * 1'  # Monday 8 AM Central (2 PM UTC)
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          cd scrapers/tfrrs/meet-scraper
          npm ci

      - name: Sync results
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
        run: |
          cd scrapers/tfrrs/meet-scraper
          node sync-weekend-results.js --days=3
```

---

## Error Handling & Resilience

### Scraper Error Handling

```javascript
async function scrapeWithRetry(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.get(url, { timeout: 30000 });
      return response.data;
    } catch (error) {
      console.error(`Attempt ${attempt} failed: ${error.message}`);

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }
}
```

### Rate Limiting

```javascript
const DELAY_BETWEEN_REQUESTS = 1500;  // 1.5 seconds
const DELAY_ON_RATE_LIMIT = 30000;    // 30 seconds

async function scrapeAllAthletes(athleteIds) {
  for (const id of athleteIds) {
    try {
      await scrapeAthlete(id);
      await sleep(DELAY_BETWEEN_REQUESTS);
    } catch (error) {
      if (error.response?.status === 429) {
        console.log('Rate limited, waiting 30 seconds...');
        await sleep(DELAY_ON_RATE_LIMIT);
      }
    }
  }
}
```

---

## Performance Metrics

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Leaderboard queries | 45 | 1 | 45x fewer |
| Leaderboard load time | 2-3s | 50-100ms | 20-30x faster |
| Cache hit rate | 0% | ~80% | New feature |
| Meet match rate | 6% | 57% | 9.5x better |
| Cloudflare bypass | 0% | 100% | Fixed |

---

*This document provides technical depth for engineering interviews and portfolio reviews.*
