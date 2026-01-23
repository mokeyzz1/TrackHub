#!/usr/bin/env node
/**
 * Entries Scraper
 *
 * Scrapes entries (who's entered in each event) before meets start.
 * Run: Thu/Fri before meet weekend
 *
 * Flow:
 * 1. Get upcoming meets with timing URLs
 * 2. Scrape entries from timing sites
 * 3. Store in meet_entries table
 * 4. Match athlete names to athlete_id
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { AthleticNetScraper } = require('../platforms/athletic_net');
const { AthleteMatcher } = require('../shared/athlete_matcher');

const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace('https://', '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Logging
const LOGS_DIR = path.join(__dirname, '../logs');
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(LOGS_DIR, `entries_${timestamp}.log`);
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
        'Prefer': method === 'POST' ? 'return=representation,resolution=merge-duplicates' : 'return=representation'
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
 * Get upcoming meets with timing URLs
 */
async function getUpcomingMeets(daysAhead = 3) {
  const today = new Date();
  const futureDate = new Date(today);
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const todayStr = today.toISOString().split('T')[0];
  const futureStr = futureDate.toISOString().split('T')[0];

  log(`Looking for meets from ${todayStr} to ${futureStr}`);

  const meets = await supabaseRequest('GET',
    `meets?date=gte.${todayStr}&date=lte.${futureStr}&meet_url=not.is.null&status=eq.upcoming&select=meet_id,name,date,meet_url,timing_platform`
  );

  return meets;
}

/**
 * Get the right scraper for a platform
 */
function getScraperForPlatform(platform) {
  switch (platform) {
    case 'athletic_net':
      return new AthleticNetScraper({ headless: true });
    case 'milesplit':
      // TODO: Implement MileSplit scraper
      log(`  MileSplit scraper not yet implemented`);
      return null;
    case 'pt_timing':
      // TODO: Implement PT Timing scraper
      log(`  PT Timing scraper not yet implemented`);
      return null;
    case 'finish_timing':
      // TODO: Implement Finish Timing scraper
      log(`  Finish Timing scraper not yet implemented`);
      return null;
    default:
      log(`  Unknown platform: ${platform}`);
      return null;
  }
}

/**
 * Store entries in database
 */
async function storeEntries(meetId, events) {
  let totalStored = 0;

  for (const event of events) {
    if (!event.entries || event.entries.length === 0) continue;

    for (const entry of event.entries) {
      try {
        await supabaseRequest('POST', 'meet_entries', {
          meet_id: meetId,
          event_name: event.name,
          athlete_name: entry.athlete_name,
          team_name: entry.team_name,
          seed_time: entry.seed_time,
          scraped_at: new Date().toISOString()
        });
        totalStored++;
      } catch (e) {
        // Likely duplicate - skip
        if (!e.message?.includes('duplicate')) {
          log(`    Error storing entry: ${e.message}`);
        }
      }
    }
  }

  return totalStored;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const meetIdArg = args.find(a => !a.startsWith('-'));
  const daysAhead = args.includes('--week') ? 7 : 3;
  const skipMatch = args.includes('--skip-match');

  log('='.repeat(60));
  log('ENTRIES SCRAPER');
  log(`Started: ${new Date().toISOString()}`);
  log('='.repeat(60));

  let meets;

  if (meetIdArg) {
    // Scrape specific meet
    const meetId = parseInt(meetIdArg);
    meets = await supabaseRequest('GET',
      `meets?meet_id=eq.${meetId}&select=meet_id,name,date,meet_url,timing_platform`
    );
  } else {
    // Get upcoming meets
    meets = await getUpcomingMeets(daysAhead);
  }

  log(`\nFound ${meets.length} meets to scrape\n`);

  const matcher = new AthleteMatcher();
  let totalEntries = 0;
  let totalMatched = 0;

  for (const meet of meets) {
    log(`\n${'─'.repeat(50)}`);
    log(`Meet: ${meet.name}`);
    log(`Date: ${meet.date}`);
    log(`Platform: ${meet.timing_platform || 'unknown'}`);
    log(`URL: ${meet.meet_url}`);

    const scraper = getScraperForPlatform(meet.timing_platform);
    if (!scraper) {
      log(`Skipping - no scraper available`);
      continue;
    }

    try {
      // Scrape entries
      log(`Scraping entries...`);
      const meetData = await scraper.scrapeMeet(meet.meet_url, 'entries');

      // Count entries
      const entryCount = meetData.events.reduce((sum, e) => sum + (e.entries?.length || 0), 0);
      log(`Found ${entryCount} entries across ${meetData.events.length} events`);

      // Store in database
      if (entryCount > 0) {
        const stored = await storeEntries(meet.meet_id, meetData.events);
        log(`Stored ${stored} entries in database`);
        totalEntries += stored;

        // Match athletes
        if (!skipMatch) {
          log(`Matching athletes...`);
          const matchResult = await matcher.matchEntries(meet.meet_id);
          totalMatched += matchResult.matched;
        }
      }

    } catch (e) {
      log(`Error scraping meet: ${e.message}`);
    } finally {
      await scraper.close();
    }
  }

  log(`\n${'='.repeat(60)}`);
  log('COMPLETE');
  log(`Total entries scraped: ${totalEntries}`);
  log(`Total athletes matched: ${totalMatched}`);
  log(`Log file: ${logFile}`);
  log('='.repeat(60));

  logStream.end();
}

main().catch(err => {
  log(`FATAL ERROR: ${err.message}`);
  console.error(err);
  process.exit(1);
});
