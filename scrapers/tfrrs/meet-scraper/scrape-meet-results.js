/**
 * Meet Results Scraper for TFRRS
 * Scrapes all results from college indoor track meets
 *
 * Usage:
 *   node scrape-meet-results.js                    # Scrape all meets
 *   node scrape-meet-results.js --start-date 2025-12-01 --end-date 2026-01-31
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// Rate limiting
const DELAY_MS = 2000; // 2 seconds between requests
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Test mode - only scrape first meet
const TEST_MODE = process.argv.includes('--test');

// Output files
const OUTPUT_DIR = path.join(__dirname, 'output');
const RESULTS_FILE = path.join(OUTPUT_DIR, 'meet-results.json');
const MEETS_FILE = path.join(OUTPUT_DIR, 'scraped-meets.json');
const PROGRESS_FILE = path.join(OUTPUT_DIR, 'scrape-progress.json');
const LOG_FILE = path.join(OUTPUT_DIR, 'scrape.log');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Logging function - writes to both console and log file
function log(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}`;
  console.log(message);
  fs.appendFileSync(LOG_FILE, logLine + '\n');
}

function logError(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ERROR: ${message}`;
  console.error(message);
  fs.appendFileSync(LOG_FILE, logLine + '\n');
}

// Parse command line args
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    startDate: '2025-12-01',
    endDate: '2026-01-31'
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--start-date' && args[i + 1]) {
      options.startDate = args[i + 1];
      i++;
    } else if (args[i] === '--end-date' && args[i + 1]) {
      options.endDate = args[i + 1];
      i++;
    }
  }

  return options;
}

// Parse athlete ID from URL like /athletes/9292649/Springfield/Josh__Goffe.html
function parseAthleteId(url) {
  const match = url.match(/\/athletes\/(\d+)\//);
  return match ? parseInt(match[1]) : null;
}

// Parse meet ID from URL like /results/93408/Mount_Union-Indoor_Wuske
function parseMeetId(url) {
  const match = url.match(/\/results\/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

// Parse event ID from URL like /results/93408/5765321/Meet_Name/Event_Name
function parseEventId(url) {
  const match = url.match(/\/results\/\d+\/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

// Parse team info from URL like /teams/tf/MA_college_m_Springfield.html
function parseTeamInfo(url) {
  // Format: /teams/tf/STATE_college_GENDER_NAME.html
  const match = url.match(/\/teams\/tf\/([A-Z]{2})_college_([mf])_(.+)\.html/);
  if (match) {
    return {
      state: match[1],
      gender: match[2] === 'm' ? 'M' : 'F',
      teamSlug: match[3]
    };
  }
  return null;
}

// Get gender from event name (e.g., "Men's 200 Meters" -> "M", "Women's 60 Meters" -> "F")
function getGenderFromEventName(eventName) {
  if (!eventName) return null;
  const lower = eventName.toLowerCase();
  if (lower.includes("men's") || lower.includes('men ')) return 'M';
  if (lower.includes("women's") || lower.includes('women ')) return 'F';
  return null;
}

// Parse mark to seconds (for running events)
function parseMarkSeconds(mark) {
  if (!mark) return null;

  // Clean the mark
  mark = mark.trim();

  // Format: "10.45" (seconds only)
  const secMatch = mark.match(/^(\d{1,2}\.\d{2,3})$/);
  if (secMatch) return parseFloat(secMatch[1]);

  // Format: "1:45.67" or "4:32.10" (min:sec)
  const minSecMatch = mark.match(/^(\d{1,2}):(\d{2}\.\d{2,3})$/);
  if (minSecMatch) return parseInt(minSecMatch[1]) * 60 + parseFloat(minSecMatch[2]);

  // Format: "1:02:34.56" (hour:min:sec)
  const hourMatch = mark.match(/^(\d{1,2}):(\d{2}):(\d{2}\.\d{2,3})$/);
  if (hourMatch) {
    return parseInt(hourMatch[1]) * 3600 + parseInt(hourMatch[2]) * 60 + parseFloat(hourMatch[3]);
  }

  return null;
}

// Parse mark to meters (for field events)
function parseMarkMeters(mark) {
  if (!mark) return null;

  // Format: "4.73m" or "15.67m"
  const meterMatch = mark.match(/([\d.]+)\s*m/i);
  if (meterMatch) return parseFloat(meterMatch[1]);

  // Format: "15' 6.75"" (feet and inches)
  const feetInchMatch = mark.match(/(\d+)'\s*([\d.]+)"/);
  if (feetInchMatch) {
    const feet = parseInt(feetInchMatch[1]);
    const inches = parseFloat(feetInchMatch[2]);
    return (feet * 12 + inches) * 0.0254; // Convert to meters
  }

  return null;
}

// Parse date from meet page
function parseDate(dateStr) {
  if (!dateStr) return null;

  const months = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
  };

  // Format: "Jan 24, 2025" or "Jan 24-25, 2025"
  const match = dateStr.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:-\d{1,2})?,?\s*(\d{4})/i);
  if (match) {
    const month = months[match[1].toLowerCase()];
    const day = match[2].padStart(2, '0');
    return `${match[3]}-${month}-${day}`;
  }

  return null;
}

// Fetch the calendar page and get list of meets
// A relay time is EITHER MM:SS.ss (4x400 "3:17.58") OR plain seconds (4x100 "39.30").
// The relay matcher used to accept only the colon form, so every sub-minute relay fell through
// to the DNF/DQ fallback and only teams that actually DNF'd were kept — which is why 4x100
// results were missing while 4x400 looked fine. The individual-result matcher below always had
// the seconds-only pattern; the relay path just never got it.
const RELAY_TIME = /^(\d{1,2}:\d{2}\.\d{2,3}|\d{2}\.\d{2,3})$/;

async function fetchMeetList(startDate, endDate) {
  console.log(`Fetching meets from ${startDate} to ${endDate}...`);

  const meets = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  // TFRRS calendar URL format: https://www.tfrrs.org/results_search.html
  // We need to search by date range
  // Actually, let's use their results search page

  // For indoor season, we can use the indoor results page
  const searchUrl = 'https://www.tfrrs.org/results_search.html';

  try {
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);

    // The results search page has a form - we need to look at results listings
    // Let's try a different approach - scrape the calendar
    console.log('Searching for meets in date range...');

  } catch (error) {
    console.error('Error fetching meet list:', error.message);
  }

  return meets;
}

// Fetch individual meet page and get event links
async function fetchMeetEvents(meetUrl) {
  try {
    const response = await axios.get(meetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const events = [];
    const seenUrls = new Set();

    // Parse meet ID from URL
    const meetId = parseMeetId(meetUrl);

    // Find meet name and date from page
    const meetName = $('h3.panel-title').first().text().trim();
    const dateText = $('.panel-heading-normal-text').first().text().trim();
    const meetDate = parseDate(dateText);

    // Find all event links - format: /results/MEETID/EVENTID/Meet_Name/Event-Name
    $('a[href*="/results/"]').each((_, el) => {
      const href = $(el).attr('href');
      const eventName = $(el).text().trim();

      // Skip non-event links
      if (!eventName || eventName.length < 3) return;
      if (href.includes('_search')) return;

      // Event URLs have format /results/meetid/eventid/meetname/eventname
      // They have 2 numbers in path (meet ID and event ID)
      const pathParts = href.split('/').filter(Boolean);
      const hasEventId = pathParts.filter(p => /^\d+$/.test(p)).length >= 2;
      if (!hasEventId) return;

      // Make absolute URL
      const eventUrl = href.startsWith('http') ? href : `https://www.tfrrs.org${href}`;

      // Avoid duplicates
      if (seenUrls.has(eventUrl)) return;
      seenUrls.add(eventUrl);

      events.push({
        eventName,
        eventUrl,
        meetName,
        meetDate
      });
    });

    return { meetId, meetName, meetDate, events };

  } catch (error) {
    logError(`Error fetching meet ${meetUrl}: ${error.message}`);
    return null;
  }
}

// Fetch event results page and parse all results
async function fetchEventResults(eventUrl, meetId, meetName, meetDate, eventName) {
  try {
    // Parse event ID from URL
    const eventId = parseEventId(eventUrl);

    const response = await axios.get(eventUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const results = [];

    // Use the event name passed in (from the meet page link)
    const pageEventName = eventName;

    // Parse CSS to find hidden columns
    // Format: .round_4_5765321_57 { display: none !important; }
    const hiddenClasses = new Set();
    $('style').each((_, style) => {
      const css = $(style).text();
      const matches = css.matchAll(/\.((?:round|heat)_[\w_]+)\s*\{\s*display:\s*none/g);
      for (const match of matches) {
        hiddenClasses.add(match[1]);
      }
    });

    // Process each table row
    $('table tbody tr').each((_, row) => {
      // Detect round from cell class names
      // round_4_* = Finals, round_1_* = Preliminaries, heat_* = Heats
      let roundName = 'Unknown';
      const $firstTimeCell = $(row).find('td[class*="round_"], td[class*="heat_"]').first();
      if ($firstTimeCell.length) {
        const cellClass = $firstTimeCell.attr('class') || '';
        if (cellClass.includes('round_4')) {
          roundName = 'Finals';
        } else if (cellClass.includes('round_1') || cellClass.includes('round_2') || cellClass.includes('round_3')) {
          roundName = 'Preliminaries';
        } else if (cellClass.includes('heat_')) {
          // Extract heat number: heat_1_2_* means round 1 heat 2
          const heatMatch = cellClass.match(/heat_(\d+)_(\d+)/);
          if (heatMatch) {
            roundName = `Heat ${heatMatch[2]}`;
          } else {
            roundName = 'Heat';
          }
        }
      }

      const $row = $(row);
      const cells = $row.find('td');

      if (cells.length < 4) return;

      // Parse place
      const place = parseInt($(cells[0]).text().trim()) || null;

      // Check if this is a relay event
      const isRelay = pageEventName.toLowerCase().includes('relay') ||
                      pageEventName.toLowerCase().includes('medley');

      // Parse athlete info
      const $athleteLinks = $row.find('a[href*="/athletes/"]');

      // Parse team info
      const $teamLink = $row.find('a[href*="/teams/"]').first();
      let schoolName = null;
      let teamInfo = null;

      if ($teamLink.length) {
        schoolName = $teamLink.text().trim();
        teamInfo = parseTeamInfo($teamLink.attr('href'));
      }

      // For relays: multiple athletes per row, store as team result
      if (isRelay) {
        if (!$teamLink.length) return; // Relays need at least a team

        // Collect all athlete IDs for the relay
        const relayAthletes = [];
        $athleteLinks.each((_, link) => {
          const url = $(link).attr('href');
          const id = parseAthleteId(url);
          // Get text, handling the hidden-xs-down span for first name
          let name = $(link).text().trim().replace(/\s+/g, ' ');
          if (id) relayAthletes.push({ athlete_id: id, name });
        });

        // Find mark (time) for relay - same priority logic as individual events
        let markRaw = null;

        // Priority 1: Look for checkmark icon
        cells.each((i, cell) => {
          const $cell = $(cell);
          const hasCheckmark = $cell.find('img[src*="ico-check"], img[src*="ico-plus"]').length > 0;
          if (hasCheckmark && !markRaw) {
            const text = $cell.text().trim();
            if (text && RELAY_TIME.test(text)) {
              markRaw = text;
            }
          }
        });

        // Priority 2: Find first visible time cell
        if (!markRaw) {
          cells.each((i, cell) => {
            if (markRaw) return;
            const $cell = $(cell);
            const cellClass = $cell.attr('class') || '';
            const isHidden = [...hiddenClasses].some(hc => cellClass.includes(hc));
            if (isHidden) return;

            const text = $cell.text().trim();
            if (RELAY_TIME.test(text)) {
              markRaw = text;
            }
          });
        }

        // Priority 3: DNF, DQ, etc.
        if (!markRaw) {
          cells.each((i, cell) => {
            if (markRaw) return;
            const text = $(cell).text().trim();
            if (/^(DNF|DQ|DNS|NT|SCR)$/i.test(text)) {
              markRaw = text.toUpperCase();
            }
          });
        }

        if (markRaw || relayAthletes.length > 0) {
          results.push({
            athlete_id: null, // Team event
            athlete_name: relayAthletes.map(a => a.name).join(', '),
            relay_athletes: relayAthletes,
            event_name: pageEventName,
            event_id: eventId,
            mark_raw: markRaw,
            mark_seconds: parseMarkSeconds(markRaw),
            mark_meters: null,
            place,
            school_name: schoolName,
            team_state: teamInfo?.state || null,
            team_gender: getGenderFromEventName(pageEventName) || teamInfo?.gender || null,
            team_slug: teamInfo?.teamSlug || null,
            year: null,
            meet_id: meetId,
            meet_name: meetName,
            date: meetDate,
            is_relay: true,
            round: roundName
          });
        }
        return;
      }

      // For individual events: single athlete per row
      const $athleteLink = $athleteLinks.first();

      let athleteId = null;
      let athleteName = null;

      if ($athleteLink.length) {
        // Has athlete profile link
        const athleteUrl = $athleteLink.attr('href');
        athleteId = parseAthleteId(athleteUrl);
        athleteName = $athleteLink.text().trim();
      } else {
        // No athlete link - likely unattached athlete
        // Try to find athlete name in the row (usually 2nd column after place)
        const nameCell = $(cells[1]);
        if (nameCell.length) {
          athleteName = nameCell.text().trim().replace(/\s+/g, ' ');
        }
      }

      // Skip only if we have no name at all
      if (!athleteName) return;

      // Parse year (like "SO-2", "JR-3", "FR-1", "SR-4", or just "FR", "SO")
      let year = null;
      cells.each((i, cell) => {
        const text = $(cell).text().trim();
        if (/^(FR|SO|JR|SR)(-\d)?$/i.test(text)) {
          year = text.toUpperCase();
        }
      });

      // Parse mark (time or distance)
      // Priority 1: Find cell with checkmark icon (ico-check or ico-plus)
      // Priority 2: Find first VISIBLE time cell (not in hiddenClasses)
      // Priority 3: First time-like value as fallback
      let markRaw = null;

      // Priority 1: Look for checkmark icon
      cells.each((i, cell) => {
        const $cell = $(cell);
        const hasCheckmark = $cell.find('img[src*="ico-check"], img[src*="ico-plus"]').length > 0;
        if (hasCheckmark && !markRaw) {
          const text = $cell.text().trim();
          if (text && text.length < 20) {
            markRaw = text;
          }
        }
      });

      // Priority 2: Find first visible time cell
      if (!markRaw) {
        cells.each((i, cell) => {
          if (markRaw) return; // Already found
          const $cell = $(cell);
          const cellClass = $cell.attr('class') || '';

          // Check if this cell's class is hidden
          const isHidden = [...hiddenClasses].some(hc => cellClass.includes(hc));
          if (isHidden) return;

          const text = $cell.text().trim();

          // Time formats
          if (/^\d{1,2}:\d{2}\.\d{2,3}$/.test(text) ||     // 8:24.90
              /^\d{1,2}\.\d{2,3}$/.test(text) ||            // 10.45
              /^\d{1,2}:\d{2}:\d{2}\.\d{2}$/.test(text)) {  // 1:02:34.56
            markRaw = text;
          }
          // Distance formats
          if (/^[\d.]+m$/i.test(text) ||                    // 4.73m
              /^\d+'\s*[\d.]*"?$/.test(text) ||             // 15' 6.75"
              /^\d+-[\d.]+$/.test(text)) {                  // 15-6.75
            markRaw = text;
          }
        });
      }

      // Priority 3: DNF, NT, DNS, etc.
      if (!markRaw) {
        cells.each((i, cell) => {
          if (markRaw) return;
          const text = $(cell).text().trim();
          if (/^(DNF|NT|DNS|FS|FOUL|NH|NM|DQ|SCR|DNQ|NWI)$/i.test(text)) {
            markRaw = text.toUpperCase();
          }
        });
      }

      // Skip only if truly no mark at all
      if (!markRaw) return;

      results.push({
        athlete_id: athleteId,
        athlete_name: athleteName,
        event_name: pageEventName,
        event_id: eventId,
        mark_raw: markRaw,
        mark_seconds: parseMarkSeconds(markRaw),
        mark_meters: parseMarkMeters(markRaw),
        place,
        school_name: schoolName,
        team_state: teamInfo?.state || null,
        team_gender: getGenderFromEventName(pageEventName) || teamInfo?.gender || null,
        team_slug: teamInfo?.teamSlug || null,
        year,
        meet_id: meetId,
        meet_name: meetName,
        date: meetDate,
        is_relay: false,
        round: roundName
      });
    });

    return results;

  } catch (error) {
    logError(`Error fetching event ${eventUrl}: ${error.message}`);
    return [];
  }
}

// Main scraper function
async function scrapeMeets() {
  const options = parseArgs();

  log('========================================');
  log('TFRRS MEET RESULTS SCRAPER');
  log('========================================');
  log(`Date range: ${options.startDate} to ${options.endDate}`);
  log('');

  // Load progress if exists
  let progress = { completedMeets: [], lastMeetUrl: null };
  if (fs.existsSync(PROGRESS_FILE)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    log(`Resuming from progress: ${progress.completedMeets.length} meets done`);
  }

  // Load existing results if any
  let allResults = [];
  if (fs.existsSync(RESULTS_FILE)) {
    allResults = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
    log(`Loaded ${allResults.length} existing results`);
  }

  // For now, let's manually provide the meet URLs
  // We'll build the meet list fetcher next
  log('\nTo use this scraper, provide meet URLs in meets-to-scrape.json');
  log('Format: [{ "url": "https://tfrrs.org/...", "name": "Meet Name" }, ...]');

  const meetsFile = path.join(__dirname, 'meets-to-scrape.json');
  if (!fs.existsSync(meetsFile)) {
    log('\nNo meets-to-scrape.json found. Creating sample file...');
    const sample = [
      { url: 'https://www.tfrrs.org/results/xc/25752/NCAA_DI_Cross_Country_Championships', name: 'Sample Meet' }
    ];
    fs.writeFileSync(meetsFile, JSON.stringify(sample, null, 2));
    log('Edit meets-to-scrape.json with the meets you want to scrape.');
    return;
  }

  const meetsToScrape = JSON.parse(fs.readFileSync(meetsFile, 'utf-8'));
  log(`\nFound ${meetsToScrape.length} meets to scrape`);

  // Filter out already completed meets
  let pendingMeets = meetsToScrape.filter(m => !progress.completedMeets.includes(m.url));
  log(`Pending: ${pendingMeets.length} meets`);

  // In test mode, only do first meet
  if (TEST_MODE) {
    log('TEST MODE: Only scraping first meet');
    pendingMeets = pendingMeets.slice(0, 1);
  }

  log('');

  let meetCount = 0;
  const totalMeets = pendingMeets.length;
  const startTime = Date.now();

  for (const meet of pendingMeets) {
    meetCount++;
    log(`\n[${meetCount}/${totalMeets}] ${meet.name || meet.url}`);

    // Fetch meet page to get event links
    const meetData = await fetchMeetEvents(meet.url);
    if (!meetData) {
      logError(`  Failed to fetch meet page: ${meet.url}`);
      continue;
    }

    // Use date from meets file if available, fallback to parsed date
    const meetDate = meet.date || meetData.meetDate;

    // Use database meet_id if provided (from sync-weekend-results.js), otherwise use TFRRS meet_id
    const dbMeetId = meet.db_meet_id || null;
    const dbMeetName = meet.db_meet_name || null;

    log(`  Found ${meetData.events.length} events`);
    if (dbMeetId) {
      log(`  Linked to database meet_id: ${dbMeetId}`);
    }

    let meetResults = 0;
    // Scrape each event
    for (const event of meetData.events) {
      const results = await fetchEventResults(
        event.eventUrl,
        meetData.meetId,
        meetData.meetName,
        meetDate,
        event.eventName
      );

      // Add database meet_id to results if we have it
      if (dbMeetId && results.length > 0) {
        results.forEach(r => {
          r.db_meet_id = dbMeetId;
          r.db_meet_name = dbMeetName;
        });
      }

      if (results.length > 0) {
        meetResults += results.length;
        allResults.push(...results);
      }

      await sleep(DELAY_MS);
    }

    // Mark meet as complete
    progress.completedMeets.push(meet.url);

    // Save progress
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(allResults, null, 2));

    // Calculate ETA
    const elapsed = (Date.now() - startTime) / 1000 / 60; // minutes
    const avgPerMeet = elapsed / meetCount;
    const remaining = (totalMeets - meetCount) * avgPerMeet;

    log(`  Meet results: ${meetResults} | Total: ${allResults.length} | ETA: ${remaining.toFixed(0)} min`);

    await sleep(DELAY_MS);
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  log('\n========================================');
  log('SCRAPING COMPLETE');
  log('========================================');
  log(`Total results: ${allResults.length}`);
  log(`Total time: ${totalTime} minutes`);
  log(`Saved to: ${RESULTS_FILE}`);
  log(`Log saved to: ${LOG_FILE}`);
}

// Run
scrapeMeets().catch(console.error);
