#!/usr/bin/env node
/**
 * Live Results Scraper
 *
 * Polls timing sites during meets to get live results.
 * Run: During meet (Fri/Sat)
 *
 * Features:
 * - Polls every 20-30 seconds
 * - Only updates when results change
 * - Links to matched entries for athlete_id
 * - Pushes to Supabase for real-time app updates
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { AthleticNetScraper } = require('../platforms/athletic_net');

const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace('https://', '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Config
const POLL_INTERVAL = 30000; // 30 seconds
const MAX_RUNTIME = 4 * 60 * 60 * 1000; // 4 hours max

// Logging
const LOGS_DIR = path.join(__dirname, '../logs');
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(LOGS_DIR, `live_${timestamp}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(message);
  logStream.write(line + '\n');
}

// Supabase REST helper
function supabaseRequest(method, endpoint, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SUPABASE_URL,
      path: '/rest/v1/' + endpoint,
      method: method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' ? 'return=representation' : 'return=representation'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = body ? JSON.parse(body) : {};
          if (res.statusCode >= 400) {
            reject({ status: res.statusCode, message: result.message || body });
          } else {
            resolve(result);
          }
        } catch (e) {
          resolve(body);
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

/**
 * Parse time string to seconds
 */
function parseTimeToSeconds(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;

  // Handle special cases
  if (['DNF', 'DNS', 'DQ', 'FS', 'NT', 'NM', 'NH', 'FOUL'].includes(timeStr.toUpperCase())) {
    return null;
  }

  const parts = timeStr.split(':');
  if (parts.length === 2) {
    // MM:SS.ss
    const minutes = parseInt(parts[0]);
    const seconds = parseFloat(parts[1]);
    return minutes * 60 + seconds;
  } else if (parts.length === 3) {
    // HH:MM:SS.ss
    const hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  } else {
    // SS.ss
    return parseFloat(timeStr);
  }
}

/**
 * Find matching entry for a result
 */
async function findMatchingEntry(meetId, athleteName, teamName, eventName) {
  // Normalize names for matching
  const normName = athleteName.toLowerCase().replace(/[^a-z\s]/g, '').trim();

  // Try exact match first
  let entries = await supabaseRequest('GET',
    `meet_entries?meet_id=eq.${meetId}&event_name=eq.${encodeURIComponent(eventName)}&select=entry_id,athlete_id,athlete_name,team_name`
  );

  // Find best match
  for (const entry of entries) {
    const entryName = entry.athlete_name.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    if (entryName === normName || entryName.includes(normName) || normName.includes(entryName)) {
      return entry;
    }
  }

  return null;
}

/**
 * Store or update a result
 */
async function upsertResult(meetId, meetUrl, meetName, eventName, result) {
  // Check if result already exists
  const existing = await supabaseRequest('GET',
    `live_results?meet_id=eq.${meetId}&event_name=eq.${encodeURIComponent(eventName)}&participant_name=eq.${encodeURIComponent(result.athlete_name)}&select=live_result_id,mark_raw`
  );

  const markSeconds = parseTimeToSeconds(result.mark);

  if (existing && existing.length > 0) {
    // Update if mark changed
    if (existing[0].mark_raw !== result.mark) {
      await supabaseRequest('PATCH', `live_results?live_result_id=eq.${existing[0].live_result_id}`, {
        mark_raw: result.mark,
        mark_seconds: markSeconds,
        place: result.place,
        is_final: result.is_final || false,
        result_type: result.is_final ? 'final' : 'live',
        updated_at: new Date().toISOString()
      });
      return 'updated';
    }
    return 'unchanged';
  } else {
    // Find matching entry for athlete_id
    const entry = await findMatchingEntry(meetId, result.athlete_name, result.team_name, eventName);

    // Insert new result
    await supabaseRequest('POST', 'live_results', {
      meet_id: meetId,
      meet_url: meetUrl,
      meet_name: meetName,
      event_name: eventName,
      participant_name: result.athlete_name,
      team_name: result.team_name,
      place: result.place,
      mark_raw: result.mark,
      mark_seconds: markSeconds,
      scraped_at: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      round: 'LIVE',
      result_type: result.is_final ? 'final' : 'live',
      is_final: result.is_final || false,
      entry_id: entry?.entry_id || null,
      athlete_id: entry?.athlete_id || null
    });
    return 'new';
  }
}

/**
 * Poll a single meet
 */
async function pollMeet(meet, scraper) {
  log(`\nPolling: ${meet.name}`);

  try {
    const meetData = await scraper.scrapeMeet(meet.meet_url, 'results');

    let newResults = 0;
    let updatedResults = 0;

    for (const event of meetData.events) {
      if (!event.results || event.results.length === 0) continue;

      for (const result of event.results) {
        try {
          const status = await upsertResult(
            meet.meet_id,
            meet.meet_url,
            meet.name,
            event.name,
            result
          );

          if (status === 'new') newResults++;
          else if (status === 'updated') updatedResults++;
        } catch (e) {
          // Skip individual errors
        }
      }
    }

    if (newResults > 0 || updatedResults > 0) {
      log(`  ${newResults} new, ${updatedResults} updated`);
    } else {
      log(`  No changes`);
    }

    return { new: newResults, updated: updatedResults };

  } catch (e) {
    log(`  Error: ${e.message}`);
    return { new: 0, updated: 0, error: e.message };
  }
}

/**
 * Main polling loop
 */
async function main() {
  const args = process.argv.slice(2);
  const meetId = args[0] ? parseInt(args[0]) : null;
  const pollInterval = args.includes('--fast') ? 15000 : POLL_INTERVAL;

  if (!meetId) {
    console.log('Usage: node live_scraper.js <meet_id> [--fast]');
    console.log('');
    console.log('Options:');
    console.log('  --fast    Poll every 15 seconds instead of 30');
    console.log('');
    console.log('Example:');
    console.log('  node live_scraper.js 123');
    process.exit(1);
  }

  log('='.repeat(60));
  log('LIVE RESULTS SCRAPER');
  log(`Started: ${new Date().toISOString()}`);
  log(`Meet ID: ${meetId}`);
  log(`Poll interval: ${pollInterval / 1000}s`);
  log('='.repeat(60));

  // Get meet info
  const meets = await supabaseRequest('GET',
    `meets?meet_id=eq.${meetId}&select=meet_id,name,date,meet_url,timing_platform`
  );

  if (!meets || meets.length === 0) {
    log('ERROR: Meet not found');
    process.exit(1);
  }

  const meet = meets[0];
  log(`\nMeet: ${meet.name}`);
  log(`Platform: ${meet.timing_platform}`);
  log(`URL: ${meet.meet_url}`);

  if (meet.timing_platform !== 'athletic_net') {
    log(`\nERROR: Only athletic_net platform is currently supported`);
    process.exit(1);
  }

  // Update meet status to live
  await supabaseRequest('PATCH', `meets?meet_id=eq.${meetId}`, {
    status: 'live',
    updated_at: new Date().toISOString()
  });

  // Initialize scraper (keep browser open for faster polling)
  const scraper = new AthleticNetScraper({ headless: true });
  await scraper.init();

  const startTime = Date.now();
  let pollCount = 0;
  let totalNew = 0;
  let totalUpdated = 0;

  log(`\nStarting poll loop (Ctrl+C to stop)...\n`);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    log('\n\nShutting down...');
    await scraper.close();

    log(`\n${'='.repeat(60)}`);
    log('SESSION COMPLETE');
    log(`Total polls: ${pollCount}`);
    log(`Total new results: ${totalNew}`);
    log(`Total updated results: ${totalUpdated}`);
    log(`Duration: ${Math.round((Date.now() - startTime) / 60000)} minutes`);
    log('='.repeat(60));

    logStream.end();
    process.exit(0);
  });

  // Poll loop
  while (Date.now() - startTime < MAX_RUNTIME) {
    pollCount++;
    const result = await pollMeet(meet, scraper);
    totalNew += result.new;
    totalUpdated += result.updated;

    // Wait for next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  log('\nMax runtime reached, shutting down...');
  await scraper.close();
  logStream.end();
}

main().catch(err => {
  log(`FATAL ERROR: ${err.message}`);
  console.error(err);
  process.exit(1);
});
