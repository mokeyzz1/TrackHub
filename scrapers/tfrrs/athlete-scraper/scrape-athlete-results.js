/**
 * TFRRS Athlete Results Scraper
 *
 * Scrapes historical results using simple HTTP requests (no browser needed).
 * Much faster and more reliable than Puppeteer.
 *
 * Usage:
 *   node scrape-athlete-results.js           # Start fresh or resume
 *   node scrape-athlete-results.js --fresh   # Start fresh (ignore checkpoint)
 *   node scrape-athlete-results.js --test 5  # Test with 5 athletes only
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const cheerio = require('cheerio');
const config = require('./config');

// Paths
const SCRIPT_DIR = __dirname;
const OUTPUT_DIR = path.join(SCRIPT_DIR, config.OUTPUT_DIR);
const LOGS_DIR = path.join(SCRIPT_DIR, config.LOGS_DIR);
const CHECKPOINT_FILE = path.join(SCRIPT_DIR, config.CHECKPOINT_FILE);
const RESULTS_FILE = path.join(SCRIPT_DIR, config.RESULTS_FILE);
const ERRORS_FILE = path.join(SCRIPT_DIR, config.ERRORS_FILE);
const PRS_FILE = path.join(OUTPUT_DIR, 'scraped-prs.json');
const ATHLETES_FILE = path.join(OUTPUT_DIR, 'athletes-needing-data.json');

// Ensure directories exist
[OUTPUT_DIR, LOGS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Logging
const LOG_FILE = path.join(LOGS_DIR, `scrape-${new Date().toISOString().split('T')[0]}.log`);

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function logError(message, error = null) {
  log(message, 'ERROR');
  if (error) {
    log(`  ${error.message || error}`, 'ERROR');
  }
}

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch URL with timeout
function fetchUrl(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error(`Timeout after ${timeout}ms`));
    });
  });
}

// Fetch with retry logic and rate limit handling
async function fetchWithRetry(url, maxRetries = 3) {
  let lastError;
  let attempt = 0;
  let rateLimitRetries = 0;

  while (attempt < maxRetries) {
    attempt++;
    try {
      return await fetchUrl(url, config.REQUEST_TIMEOUT);
    } catch (error) {
      lastError = error;

      // If rate limited (403), wait 10 minutes then retry (doesn't count against attempts)
      if (error.message.includes('403')) {
        rateLimitRetries++;
        log(`  Rate limited (403)! Waiting 10 minutes... (rate limit retry ${rateLimitRetries})`, 'WARN');
        await sleep(10 * 60 * 1000); // 10 minutes
        attempt--; // Don't count this against normal retries
        if (rateLimitRetries > 5) {
          log(`  Too many rate limits, giving up on this athlete`, 'ERROR');
          throw error;
        }
        continue;
      }

      if (attempt < maxRetries) {
        const delay = attempt * 2000;
        log(`  Retry ${attempt}/${maxRetries} after ${delay}ms...`, 'WARN');
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

// Parse results from HTML using cheerio
function parseAthleteResults(html, athleteId) {
  const $ = cheerio.load(html);
  const results = [];

  // Track current school context - transfers have multiple school sections
  let currentSchool = null;

  // Find the current school from the header
  // The school is in h3.panel-title but NOT the one with .large-title (that's athlete name)
  $('h3.panel-title').each((_, el) => {
    const $el = $(el);
    // Skip if it's the large-title (athlete name)
    if ($el.hasClass('large-title')) return;
    // This should be the school name
    currentSchool = $el.text().trim();
  });

  // Process meet results tab content
  const $meetResultsTab = $('#meet-results');

  // For transfer athletes, there are "Competing for [School]" sections
  // These appear as: <div class="transfer"><span><b>↓Competing for <a>School</a> ↓</b></span></div>
  // We need to track which school section each result belongs to

  // Get all elements in order: transfer divs and tables
  const elements = $meetResultsTab.find('div.transfer, table').toArray();

  let schoolForNextResults = currentSchool;

  elements.forEach(el => {
    const $el = $(el);

    // Check if this is a transfer section marker
    if ($el.hasClass('transfer')) {
      const $schoolLink = $el.find('a[href*="/teams/"]');
      if ($schoolLink.length) {
        schoolForNextResults = $schoolLink.text().trim();
      }
      return; // Continue to next element
    }

    // This is a table - check if it's a results table (has a meet link in header)
    const $header = $el.find('thead th, th[colspan]').first();
    if (!$header.length) return;

    // Extract meet name from link
    const $meetLink = $header.find('a[href*="/results/"]');
    const meetName = $meetLink.text().trim();
    if (!meetName) return;

    // Extract date from span
    const $dateSpan = $header.find('span');
    let date = '';
    if ($dateSpan.length) {
      // Match dates like "May 22-24, 2025", "Jan 10, 2025", "May  2- 4, 2025"
      const dateMatch = $dateSpan.text().match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:\s*-\s*\d{1,2})?,?\s*\d{4}/i);
      if (dateMatch) {
        date = dateMatch[0].trim();
      }
    }

    // Get result rows (skip header row)
    $el.find('tr').each((_, row) => {
      const $row = $(row);
      const $cells = $row.find('td');
      if ($cells.length < 2) return;

      // First cell: event name
      const eventName = $cells.eq(0).text().trim();

      // Second cell: mark (often in a link)
      const $markLink = $cells.eq(1).find('a');
      let mark = $markLink.length ? $markLink.text().trim() : $cells.eq(1).text().trim();

      // Third cell (if exists): place and round info
      let place = null;
      let round = null;
      if ($cells.length > 2) {
        const placeText = $cells.eq(2).text().trim();
        const placeMatch = placeText.match(/(\d+)(st|nd|rd|th)?/i);
        if (placeMatch) {
          place = parseInt(placeMatch[1]);
        }
        // Check for (F) = Final, (P) = Prelim
        if (placeText.includes('(F)')) round = 'F';
        else if (placeText.includes('(P)')) round = 'P';
      }

      // Skip if no valid mark
      if (!mark || mark.length < 3) return;

      // Clean the mark
      const cleanMark = mark.replace(/\s*\(\d+(st|nd|rd|th)?\)/gi, '').trim();

      // Skip header-like rows
      if (cleanMark.toLowerCase().includes('top') || cleanMark.toLowerCase().includes('meters')) return;

      results.push({
        athlete_id: athleteId,
        event_name: eventName,
        meet_name: meetName,
        date: date,
        mark_raw: cleanMark,
        place: place,
        round: round,
        school_name: schoolForNextResults  // School they competed for
      });
    });
  });

  return results;
}

// Parse PRs (Personal Records / College Bests) from HTML
function parseAthletePRs(html, athleteId) {
  const $ = cheerio.load(html);
  const prs = [];

  // Parse bests tables: all_bests, indoor_bests, outdoor_bests, xc_bests
  const tableConfigs = [
    { selector: 'table#all_bests, table.bests:not(.indoor_bests):not(.outdoor_bests):not(.xc_bests)', season: 'all' },
    { selector: 'table.indoor_bests', season: 'indoor' },
    { selector: 'table.outdoor_bests', season: 'outdoor' },
    { selector: 'table.xc_bests', season: 'xc' }
  ];

  tableConfigs.forEach(({ selector, season }) => {
    $(selector).each((_, table) => {
      const $table = $(table);

      $table.find('tr').each((_, row) => {
        const $cells = $(row).find('td');

        // Each row has pairs: event1, mark1, event2, mark2
        for (let i = 0; i < $cells.length - 1; i += 2) {
          const eventName = $cells.eq(i).text().trim();
          const $markCell = $cells.eq(i + 1);
          const $markLink = $markCell.find('a');
          const mark = $markLink.length ? $markLink.text().trim() : $markCell.text().trim();

          // Skip empty or invalid
          if (!eventName || !mark || mark.length < 3) continue;

          // Skip header-like content
          if (eventName.toLowerCase().includes('event') || mark.toLowerCase().includes('mark')) continue;

          prs.push({
            athlete_id: athleteId,
            event_name: eventName,
            mark_raw: mark,
            season: season
          });
        }
      });
    });
  });

  return prs;
}

// Append PRs to file
function appendPRs(prs) {
  let existing = [];
  if (fs.existsSync(PRS_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(PRS_FILE, 'utf-8'));
    } catch (e) {
      existing = [];
    }
  }
  existing.push(...prs);
  fs.writeFileSync(PRS_FILE, JSON.stringify(existing, null, 2));
}

// Load checkpoint
function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8'));
    } catch (e) {
      log('Could not load checkpoint, starting fresh', 'WARN');
    }
  }
  return { lastIndex: -1, processedIds: [], startedAt: new Date().toISOString() };
}

// Save checkpoint
function saveCheckpoint(checkpoint) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

// Append results to file
function appendResults(results) {
  let existing = [];
  if (fs.existsSync(RESULTS_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
    } catch (e) {
      existing = [];
    }
  }
  existing.push(...results);
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(existing, null, 2));
}

// Append error
function appendError(error) {
  let existing = [];
  if (fs.existsSync(ERRORS_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(ERRORS_FILE, 'utf-8'));
    } catch (e) {
      existing = [];
    }
  }
  existing.push(error);
  fs.writeFileSync(ERRORS_FILE, JSON.stringify(existing, null, 2));
}

// Main scraper function
async function scrapeAthletes(options = {}) {
  const { fresh = false, testLimit = null } = options;

  log('========================================');
  log('TFRRS Athlete Results Scraper (HTTP)');
  log('========================================');

  // Load athletes needing data
  if (!fs.existsSync(ATHLETES_FILE)) {
    log(`Athletes file not found: ${ATHLETES_FILE}`, 'ERROR');
    log('Run get-athletes-needing-data.js first', 'ERROR');
    process.exit(1);
  }

  const athletesData = JSON.parse(fs.readFileSync(ATHLETES_FILE, 'utf-8'));
  const athletes = athletesData.athletes;
  log(`Loaded ${athletes.length.toLocaleString()} athletes needing data`);

  // Load or initialize checkpoint
  let checkpoint = fresh ? { lastIndex: -1, processedIds: [], startedAt: new Date().toISOString() } : loadCheckpoint();
  const startIndex = checkpoint.lastIndex + 1;

  if (startIndex > 0 && !fresh) {
    log(`Resuming from index ${startIndex} (${checkpoint.processedIds.length} already processed)`);
  }

  // Determine end index
  const endIndex = testLimit ? Math.min(startIndex + testLimit, athletes.length) : athletes.length;
  log(`Will process athletes ${startIndex} to ${endIndex - 1}`);

  // Stats
  let successCount = 0;
  let errorCount = 0;
  let totalResults = 0;
  let totalPRs = 0;
  let pendingResults = [];
  let pendingPRs = [];

  // Process athletes
  for (let i = startIndex; i < endIndex; i++) {
    const athlete = athletes[i];
    const progress = `[${i + 1}/${endIndex}]`;

    try {
      log(`${progress} Scraping ${athlete.full_name} (ID: ${athlete.athlete_id})...`);

      // Fetch page with retry
      const html = await fetchWithRetry(athlete.tfrrs_profile_url);

      // Parse results and PRs
      const results = parseAthleteResults(html, athlete.athlete_id);
      const prs = parseAthletePRs(html, athlete.athlete_id);

      // Add timestamp
      const now = new Date().toISOString();
      results.forEach(r => r.scraped_at = now);
      prs.forEach(p => p.scraped_at = now);

      log(`${progress} Found ${results.length} results, ${prs.length} PRs for ${athlete.full_name}`);

      // Add to pending
      pendingResults.push(...results);
      pendingPRs.push(...prs);
      totalResults += results.length;
      totalPRs += prs.length;
      successCount++;

      // Update checkpoint
      checkpoint.lastIndex = i;
      checkpoint.processedIds.push(athlete.athlete_id);

      // Save periodically
      if (pendingResults.length >= config.SAVE_RESULTS_EVERY || i === endIndex - 1) {
        appendResults(pendingResults);
        appendPRs(pendingPRs);
        saveCheckpoint(checkpoint);
        log(`Saved ${pendingResults.length} results, ${pendingPRs.length} PRs to file`);
        pendingResults = [];
        pendingPRs = [];
      }

      // Rate limiting - be nice to TFRRS to avoid 403s
      // Random delay between 2-4 seconds
      await sleep(2000 + Math.random() * 2000);

    } catch (error) {
      errorCount++;
      logError(`${progress} Failed to scrape ${athlete.full_name}`, error);

      appendError({
        athlete_id: athlete.athlete_id,
        full_name: athlete.full_name,
        url: athlete.tfrrs_profile_url,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      // Update checkpoint even on error
      checkpoint.lastIndex = i;
      saveCheckpoint(checkpoint);

      await sleep(1000);
    }

    // Progress report every 100 athletes
    if ((i + 1) % 100 === 0) {
      log(`--- Progress: ${i + 1}/${endIndex} | Success: ${successCount} | Errors: ${errorCount} | Results: ${totalResults} ---`);
    }
  }

  // Final save
  if (pendingResults.length > 0 || pendingPRs.length > 0) {
    appendResults(pendingResults);
    appendPRs(pendingPRs);
    saveCheckpoint(checkpoint);
  }

  // Final report
  log('========================================');
  log('SCRAPING COMPLETE');
  log('========================================');
  log(`Total processed: ${successCount + errorCount}`);
  log(`Successful: ${successCount}`);
  log(`Errors: ${errorCount}`);
  log(`Total results scraped: ${totalResults}`);
  log(`Total PRs scraped: ${totalPRs}`);
  log(`Results saved to: ${RESULTS_FILE}`);
  log(`PRs saved to: ${PRS_FILE}`);
  if (errorCount > 0) {
    log(`Errors logged to: ${ERRORS_FILE}`);
  }
}

// Parse command line args
const args = process.argv.slice(2);
const options = {
  fresh: args.includes('--fresh'),
  testLimit: null
};

const testIndex = args.indexOf('--test');
if (testIndex !== -1 && args[testIndex + 1]) {
  options.testLimit = parseInt(args[testIndex + 1]);
}

// Run
scrapeAthletes(options).catch(error => {
  logError('Fatal error', error);
  process.exit(1);
});
