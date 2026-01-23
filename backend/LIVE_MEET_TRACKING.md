# Live Meet Tracking System - Complete Guide

## Overview

This system tracks live track & field meets in real-time by scraping AthleticLIVE pages and storing results in Supabase. The frontend automatically refreshes to show live updates.

## System Architecture

```
┌─────────────────────┐
│  AthleticLIVE       │ (External source)
│  Live Meet Pages    │
└──────────┬──────────┘
           │
           │ Scrape every 30s
           ▼
┌─────────────────────┐
│  Node.js Scripts    │
│  - Multi-event      │
│  - Auto polling     │
└──────────┬──────────┘
           │
           │ Upload results
           ▼
┌─────────────────────┐
│  Supabase           │
│  live_results table │
└──────────┬──────────┘
           │
           │ Query every 30s
           ▼
┌─────────────────────┐
│  React Native App   │
│  Live Results UI    │
└─────────────────────┘
```

## Scripts Available

### 1. Multi-Event Scraper (One-Time Run)

**Script:** `scripts/multi_event_live_scraper.js`

**Purpose:** Discover all events at a meet and scrape results once

**Usage:**
```bash
node scripts/multi_event_live_scraper.js <meet_url>
```

**Example:**
```bash
node scripts/multi_event_live_scraper.js https://live.jdlfasttrack.com/meets/54336
```

**Output:**
```
============================================================
🏃 MULTI-EVENT LIVE MEET SCRAPER
============================================================

Meet: Phoenix Academy
Events Scraped: 3
Total Results: 45
Uploaded: 45
Errors: 0
```

**When to Use:**
- Testing a meet URL
- Getting initial data snapshot
- Verifying meet structure

---

### 2. Live Meet Monitor (Continuous Polling)

**Script:** `scripts/live_meet_monitor.js`

**Purpose:** Continuously poll a meet every 30 seconds and update results in real-time

**Usage:**
```bash
node scripts/live_meet_monitor.js <meet_url> [interval_seconds]
```

**Examples:**
```bash
# Default 30-second interval
node scripts/live_meet_monitor.js https://live.jdlfasttrack.com/meets/54336

# Custom 20-second interval
node scripts/live_meet_monitor.js https://live.jdlfasttrack.com/meets/54336 20

# Custom 60-second interval (more polite)
node scripts/live_meet_monitor.js https://live.jdlfasttrack.com/meets/54336 60
```

**Output:**
```
🔴 LIVE MEET MONITOR - STARTED
Meet: Phoenix Academy
Poll Interval: 30 seconds

──────────────────────────────────────────────
📡 POLL #1 - 6:13:38 PM
──────────────────────────────────────────────

[1/3] Girls 1600m
   ✅ Scraped 13 results
   📤 New: 13 | Updated: 0 | Errors: 0

[2/3] Boys 4x800m
   ✅ Scraped 9 results
   📤 New: 9 | Updated: 0 | Errors: 0

[3/3] Girls 800m
   ✅ Scraped 15 results
   📤 New: 15 | Updated: 0 | Errors: 0

💾 Summary: 37 new, 0 updated

⏳ Waiting 30 seconds until next poll...
```

**Features:**
- Auto-discovers all events at the meet
- Polls continuously at your chosen interval
- Detects new results and updates
- Shows live progress in console
- Stops after 5 consecutive errors
- Press Ctrl+C to stop manually

**When to Use:**
- During a live meet
- When you need real-time updates
- For testing the full pipeline

---

### 3. Check Live Results

**Script:** `scripts/check_live_results.js`

**Purpose:** View what's currently in the database

**Usage:**
```bash
node scripts/check_live_results.js
```

**Output:**
```
📊 Checking live_results table...

Total results in database: 45

Unique meets: 1

1. Phoenix Academy
   https://live.jdlfasttrack.com/meets/54336

📋 Latest 10 Results:

1. Girls 1600m - Reou Laeticia Boudemabia
   Place: 13 | Time: 1:50.99
   Scraped: 12/2/2025, 6:09:21 PM

🏃 Events in Database: 3

1. Boys 4x800m (Phoenix Academy)
2. Girls 1600m (Phoenix Academy)
3. Girls 800m (Phoenix Academy)
```

---

## Database Schema

### live_results Table

```sql
CREATE TABLE live_results (
    live_result_id BIGSERIAL PRIMARY KEY,
    meet_url TEXT NOT NULL,
    meet_name TEXT,
    event_name TEXT NOT NULL,
    participant_name TEXT NOT NULL,
    place INTEGER,
    mark_raw TEXT NOT NULL,
    mark_seconds DOUBLE PRECISION,
    splits TEXT[],
    scraped_at TIMESTAMP WITH TIME ZONE NOT NULL,
    date DATE,
    round TEXT DEFAULT 'LIVE',
    is_processed BOOLEAN DEFAULT FALSE,
    athlete_id BIGINT REFERENCES athletes(athlete_id) ON DELETE SET NULL,
    team_id BIGINT REFERENCES teams(team_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Key Fields:**
- `meet_url`: Source URL for the live meet
- `event_name`: Event name (e.g., "Boys 4x800m", "Girls 1600m")
- `participant_name`: Athlete or team name
- `mark_raw`: Original time string (e.g., "4:31.35", "1:50.99")
- `mark_seconds`: Converted to seconds for querying
- `splits`: Array of split times for relays
- `scraped_at`: When this result was last seen (updated each poll)
- `is_processed`: False until matched to real athletes post-meet

---

## Frontend Hooks

### 1. useLiveResults

**Purpose:** Fetch all live results (optionally filtered by meet)

**Usage:**
```typescript
import { useLiveResults } from '@/hooks/useLiveResults';

function LiveResultsScreen() {
  const { results, loading, error, lastUpdated, refresh } = useLiveResults();

  // Or for a specific meet:
  // const { results, loading } = useLiveResults('https://live.jdlfasttrack.com/meets/54336');

  if (loading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error}</Text>;

  return (
    <View>
      <Text>Last Updated: {lastUpdated?.toLocaleTimeString()}</Text>
      {results.map(result => (
        <View key={result.live_result_id}>
          <Text>{result.event_name}</Text>
          <Text>{result.place}. {result.participant_name} - {result.mark_raw}</Text>
        </View>
      ))}
    </View>
  );
}
```

**Auto-refresh:** Every 30 seconds

---

### 2. useLiveMeets

**Purpose:** Get list of all active live meets

**Usage:**
```typescript
import { useLiveMeets } from '@/hooks/useLiveResults';

function LiveMeetsScreen() {
  const { meets, loading, error, refresh } = useLiveMeets();

  return (
    <View>
      {meets.map(meet => (
        <TouchableOpacity key={meet.meet_url} onPress={() => navigate('LiveMeet', { meetUrl: meet.meet_url })}>
          <Text>{meet.meet_name}</Text>
          <Text>{meet.event_count} events</Text>
          <Text>Updated: {new Date(meet.last_updated).toLocaleTimeString()}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
```

**Auto-refresh:** Every 60 seconds

---

### 3. useLiveEvent

**Purpose:** Get results for a specific event

**Usage:**
```typescript
import { useLiveEvent } from '@/hooks/useLiveResults';

function LiveEventScreen({ meetUrl, eventName }) {
  const { results, loading, lastUpdated } = useLiveEvent(meetUrl, eventName);

  return (
    <View>
      <Text>{eventName}</Text>
      <Text>Last Updated: {lastUpdated?.toLocaleTimeString()}</Text>
      {results.map(result => (
        <View key={result.live_result_id}>
          <Text>{result.place}. {result.participant_name}</Text>
          <Text>{result.mark_raw}</Text>
          {result.splits.length > 0 && (
            <Text>Splits: {result.splits.join(', ')}</Text>
          )}
        </View>
      ))}
    </View>
  );
}
```

**Auto-refresh:** Every 20 seconds

---

## Production Deployment

### Option 1: Run on Server (Recommended)

Use **PM2** to keep the monitor running:

```bash
# Install PM2 globally
npm install -g pm2

# Start monitoring a meet
pm2 start scripts/live_meet_monitor.js --name "phoenix-academy" -- https://live.jdlfasttrack.com/meets/54336 30

# View logs
pm2 logs phoenix-academy

# Stop monitoring
pm2 stop phoenix-academy

# List all running monitors
pm2 list
```

### Option 2: Run with systemd (Linux)

Create `/etc/systemd/system/live-meet-monitor.service`:

```ini
[Unit]
Description=Track Meet Live Monitor
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/track-meet-tracker/backend
ExecStart=/usr/bin/node scripts/live_meet_monitor.js https://live.jdlfasttrack.com/meets/54336 30
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable live-meet-monitor
sudo systemctl start live-meet-monitor
sudo systemctl status live-meet-monitor
```

### Option 3: Docker Container

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./

CMD ["node", "scripts/live_meet_monitor.js", "${MEET_URL}", "30"]
```

Run:
```bash
docker build -t live-meet-monitor .
docker run -d --name monitor -e MEET_URL=https://live.jdlfasttrack.com/meets/54336 live-meet-monitor
```

---

## Workflow: Tracking a Live Meet

### Before the Meet:

1. **Get the meet URL** from AthleticLIVE
   - Example: `https://live.jdlfasttrack.com/meets/54336`

2. **Test the scraper:**
   ```bash
   node scripts/multi_event_live_scraper.js https://live.jdlfasttrack.com/meets/54336
   ```

3. **Verify data in Supabase:**
   ```bash
   node scripts/check_live_results.js
   ```

### During the Meet:

4. **Start the monitor:**
   ```bash
   # Production (30-second interval)
   pm2 start scripts/live_meet_monitor.js --name "meet-54336" -- https://live.jdlfasttrack.com/meets/54336 30

   # Testing (20-second interval)
   node scripts/live_meet_monitor.js https://live.jdlfasttrack.com/meets/54336 20
   ```

5. **Open the app** - Live results will auto-update every 30 seconds

6. **Monitor the logs:**
   ```bash
   pm2 logs meet-54336
   ```

### After the Meet:

7. **Stop the monitor:**
   ```bash
   pm2 stop meet-54336
   ```

8. **Optional: Match results to athletes**
   - Set `is_processed = true` after matching
   - Link to `athlete_id` and `team_id`

---

## Troubleshooting

### Issue: No results found

**Solution:**
```bash
# Check if the URL is correct
curl -s "https://live.jdlfasttrack.com/meets/54336" | grep "results-table--row"

# Test the scraper manually
node scripts/multi_event_live_scraper.js https://live.jdlfasttrack.com/meets/54336
```

### Issue: Monitor keeps stopping

**Cause:** 5 consecutive errors

**Solution:**
- Check internet connection
- Verify meet is still live
- Check Supabase credentials in `.env`
- Increase error threshold in script (change `MAX_ERRORS`)

### Issue: Duplicate results

**Prevention:** The scraper checks for duplicates before inserting

**If it happens:**
```sql
DELETE FROM live_results
WHERE live_result_id NOT IN (
    SELECT MIN(live_result_id)
    FROM live_results
    GROUP BY meet_url, event_name, participant_name, place, mark_raw
);
```

### Issue: Frontend not updating

**Checks:**
1. Verify Supabase credentials in frontend `.env`
2. Check browser/app console for errors
3. Manually refresh: `refresh()` function in hooks
4. Query Supabase directly to confirm data exists

---

## Performance Considerations

### Polling Interval Guidelines:

- **20 seconds:** Testing/development only
- **30 seconds:** Recommended for live meets (ESPN-standard delay)
- **60 seconds:** Polite option for less critical meets

### Resource Usage:

**Per Meet Monitor:**
- Memory: ~100-150 MB
- CPU: Minimal (spikes during scrape)
- Network: ~1-2 MB per poll
- Supabase: ~20-50 database operations per poll

**Concurrent Meets:**
- You can run multiple monitors for different meets
- Use PM2 to manage: `pm2 start --instances 3`

---

## Best Practices

1. **Test before going live**
   - Always run multi-event scraper first
   - Verify data structure matches

2. **Use production interval (30s+)**
   - Be respectful to AthleticLIVE servers
   - 30 seconds is industry standard

3. **Monitor logs**
   - Watch for errors
   - Track upload success rate

4. **Clean up after meets**
   - Delete test data
   - Archive old live results

5. **Handle meet end gracefully**
   - Stop monitor when meet ends
   - Don't leave monitors running overnight

---

## Future Enhancements

### Planned Features:

1. **Automatic Meet Discovery**
   - Scrape AthleticLIVE schedule
   - Auto-start monitors for today's meets

2. **Push Notifications**
   - Alert when new PR
   - Notify when event starts

3. **Advanced Matching**
   - Auto-link participants to athlete_id
   - Use fuzzy matching for team names

4. **Live Visualizations**
   - Real-time race progression
   - Split time analysis
   - Leader boards

5. **WebSocket Support**
   - If AthleticLIVE adds WebSocket API
   - Instant updates without polling

---

## Summary

You now have a complete live meet tracking system:

✅ **Backend Scripts:**
- Multi-event scraper for one-time runs
- Automated monitor for continuous polling
- Database verification tool

✅ **Database:**
- `live_results` table in Supabase
- Optimized indexes for fast queries
- Support for relay splits

✅ **Frontend Hooks:**
- `useLiveResults` - All results or by meet
- `useLiveMeets` - List of active meets
- `useLiveEvent` - Specific event results
- Auto-refresh every 20-60 seconds

✅ **Production Ready:**
- PM2 deployment guide
- Docker containerization
- Error handling and retry logic

**Next Steps:**
1. Build the UI screens using the hooks
2. Test with a live meet this weekend
3. Deploy monitor to production server
