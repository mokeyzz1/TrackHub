#!/usr/bin/env node
/**
 * Final Results Scraper
 *
 * Scrapes final/official results after meets complete.
 * Run: Sunday night / Monday morning
 *
 * Sources:
 * - Athletic.net (and family)
 * - TFRRS (TODO)
 *
 * Updates live_results with is_final=true and result_type='final'
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
const logFile = path.join(LOGS_DIR, `final_${timestamp}.log`);
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
  if (['DNF', 'DNS', 'DQ', 'FS', 'NT', 'NM', 'NH', 'FOUL'].includes(timeStr.toUpperCase())) {
    return null;
  }

  const parts = timeStr.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  } else if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  } else {
    return parseFloat(timeStr);
  }
}

/**
 * Get meets that need final results
 */
async function getMeetsNeedingFinalResults(daysBack = 3) {
  const today = new Date();
  const pastDate = new Date(today);
  pastDate.setDate(pastDate.getDate() - daysBack);

  const todayStr = today.toISOString().split('T')[0];
  const pastStr = pastDate.toISOString().split('T')[0];

  log(`Looking for meets from ${pastStr} to ${todayStr}`);

  // Get meets that are completed or live (happened recently)
  const meets = await supabaseRequest('GET',
    `meets?date=gte.${pastStr}&date=lte.${todayStr}&meet_url=not.is.null&status=in.(live,completed)&select=meet_id,name,date,meet_url,timing_platform`
  );

  return meets;
}

/**
 * Find matching entry for athlete matching
 */
async function findMatchingEntry(meetId, athleteName, eventName) {
  const normName = athleteName.toLowerCase().replace(/[^a-z\s]/g, '').trim();

  const entries = await supabaseRequest('GET',
    `meet_entries?meet_id=eq.${meetId}&event_name=eq.${encodeURIComponent(eventName)}&select=entry_id,athlete_id,athlete_name`
  );

  for (const entry of entries) {
    const entryName = entry.athlete_name.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    if (entryName === normName || entryName.includes(normName) || normName.includes(entryName)) {
      return entry;
    }
  }

  return null;
}

/**
 * Store or update final result
 */
async function upsertFinalResult(meetId, meetUrl, meetName, eventName, result, matcher) {
  // Check for existing result
  const existing = await supabaseRequest('GET',
    `live_results?meet_id=eq.${meetId}&event_name=eq.${encodeURIComponent(eventName)}&participant_name=eq.${encodeURIComponent(result.athlete_name)}&select=live_result_id`
  );

  const markSeconds = parseTimeToSeconds(result.mark);

  // Try to find athlete_id from entry or matcher
  let athleteId = null;
  let entryId = null;

  const entry = await findMatchingEntry(meetId, result.athlete_name, eventName);
  if (entry) {
    entryId = entry.entry_id;
    athleteId = entry.athlete_id;
  }

  // If no entry match, try direct athlete matching
  if (!athleteId && matcher) {
    const match = await matcher.findMatch(result.athlete_name, result.team_name);
    if (match && match.confidence > 0.8) {
      athleteId = match.athlete_id;
    }
  }

  if (existing && existing.length > 0) {
    // Update to final
    await supabaseRequest('PATCH', `live_results?live_result_id=eq.${existing[0].live_result_id}`, {
      mark_raw: result.mark,
      mark_seconds: markSeconds,
      place: result.place,
      is_final: true,
      result_type: 'final',
      athlete_id: athleteId,
      entry_id: entryId,
      updated_at: new Date().toISOString()
    });
    return 'updated';
  } else {
    // Insert new final result
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
      round: 'FINAL',
      result_type: 'final',
      is_final: true,
      entry_id: entryId,
      athlete_id: athleteId
    });
    return 'new';
  }
}

/**
 * Scrape final results for a meet
 */
async function scrapeFinalResults(meet, scraper, matcher) {
  log(`\nScraping final results: ${meet.name}`);

  try {
    const meetData = await scraper.scrapeMeet(meet.meet_url, 'results');

    let newResults = 0;
    let updatedResults = 0;

    for (const event of meetData.events) {
      if (!event.results || event.results.length === 0) continue;

      log(`  ${event.name}: ${event.results.length} results`);

      for (const result of event.results) {
        // Force is_final for final scraper
        result.is_final = true;

        try {
          const status = await upsertFinalResult(
            meet.meet_id,
            meet.meet_url,
            meet.name,
            event.name,
            result,
            matcher
          );

          if (status === 'new') newResults++;
          else if (status === 'updated') updatedResults++;
        } catch (e) {
          // Skip individual errors
        }
      }
    }

    return { new: newResults, updated: updatedResults };

  } catch (e) {
    log(`  Error: ${e.message}`);
    return { new: 0, updated: 0, error: e.message };
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const meetIdArg = args.find(a => !a.startsWith('-'));
  const daysBack = args.includes('--week') ? 7 : 3;

  log('='.repeat(60));
  log('FINAL RESULTS SCRAPER');
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
    // Get recent meets
    meets = await getMeetsNeedingFinalResults(daysBack);
  }

  log(`\nFound ${meets.length} meets to scrape\n`);

  const matcher = new AthleteMatcher();
  let totalNew = 0;
  let totalUpdated = 0;
  let meetsProcessed = 0;

  for (const meet of meets) {
    if (meet.timing_platform !== 'athletic_net') {
      log(`Skipping ${meet.name} - ${meet.timing_platform} not supported yet`);
      continue;
    }

    const scraper = new AthleticNetScraper({ headless: true });

    try {
      const result = await scrapeFinalResults(meet, scraper, matcher);
      totalNew += result.new;
      totalUpdated += result.updated;
      meetsProcessed++;

      // Update meet status to completed
      await supabaseRequest('PATCH', `meets?meet_id=eq.${meet.meet_id}`, {
        status: 'completed',
        updated_at: new Date().toISOString()
      });

      log(`  Total: ${result.new} new, ${result.updated} updated`);

    } catch (e) {
      log(`  Error processing meet: ${e.message}`);
    } finally {
      await scraper.close();
    }
  }

  log(`\n${'='.repeat(60)}`);
  log('COMPLETE');
  log(`Meets processed: ${meetsProcessed}`);
  log(`Total new results: ${totalNew}`);
  log(`Total updated results: ${totalUpdated}`);
  log(`Log file: ${logFile}`);
  log('='.repeat(60));

  logStream.end();
}

main().catch(err => {
  log(`FATAL ERROR: ${err.message}`);
  console.error(err);
  process.exit(1);
});
