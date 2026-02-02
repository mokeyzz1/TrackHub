/**
 * Retry Failed Athletes
 *
 * Reads scraper-errors.json and retries those athletes.
 * Run this after the main scraper finishes.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const config = require('./config');

const SCRIPT_DIR = __dirname;
const OUTPUT_DIR = path.join(SCRIPT_DIR, config.OUTPUT_DIR);
const LOGS_DIR = path.join(SCRIPT_DIR, config.LOGS_DIR);
const ERRORS_FILE = path.join(SCRIPT_DIR, config.ERRORS_FILE);
const RESULTS_FILE = path.join(SCRIPT_DIR, config.RESULTS_FILE);
const RETRY_RESULTS_FILE = path.join(OUTPUT_DIR, 'retry-results.json');

const LOG_FILE = path.join(LOGS_DIR, `retry-${new Date().toISOString().split('T')[0]}.log`);

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeAthletePage(page, url, athleteId) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 }); // Longer timeout for retry

  await sleep(2000); // Extra wait time

  const results = await page.evaluate((athleteId) => {
    const results = [];
    const tables = document.querySelectorAll('table.table-hover');

    tables.forEach(table => {
      const headerTh = table.querySelector('thead th, th[colspan]');
      if (!headerTh) return;

      const meetLink = headerTh.querySelector('a[href*="/results/"]');
      const meetName = meetLink ? meetLink.textContent.trim() : '';
      if (!meetName) return;

      const dateSpan = headerTh.querySelector('span');
      let date = '';
      if (dateSpan) {
        const dateMatch = dateSpan.textContent.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:-\w+\s+\d{1,2})?,?\s*\d{4}/i);
        if (dateMatch) date = dateMatch[0].trim();
      }

      const rows = table.querySelectorAll('tbody tr');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 2) return;

        const eventName = cells[0].textContent.trim();
        const markLink = cells[1].querySelector('a');
        const mark = markLink ? markLink.textContent.trim() : cells[1].textContent.trim();

        let place = null;
        if (cells.length > 2) {
          const placeMatch = cells[2].textContent.match(/(\d+)(st|nd|rd|th)?/i);
          if (placeMatch) place = parseInt(placeMatch[1]);
        }

        const placeInMark = mark.match(/\((\d+)(st|nd|rd|th)?\)/i);
        if (placeInMark && !place) place = parseInt(placeInMark[1]);

        if (!mark || mark.length < 3) return;
        const cleanMark = mark.replace(/\s*\(\d+(st|nd|rd|th)?\)/gi, '').trim();

        results.push({
          athlete_id: athleteId,
          event_name: eventName,
          meet_name: meetName,
          date: date,
          mark_raw: cleanMark,
          place: place
        });
      });
    });

    return results;
  }, athleteId);

  return results;
}

async function retryFailed() {
  log('========================================');
  log('Retrying Failed Athletes');
  log('========================================');

  if (!fs.existsSync(ERRORS_FILE)) {
    log('No errors file found - nothing to retry');
    return;
  }

  const errors = JSON.parse(fs.readFileSync(ERRORS_FILE, 'utf-8'));

  // Get unique athlete IDs (some may have failed multiple times)
  const uniqueAthletes = [];
  const seenIds = new Set();
  for (const err of errors) {
    if (!seenIds.has(err.athlete_id)) {
      seenIds.add(err.athlete_id);
      uniqueAthletes.push({
        athlete_id: err.athlete_id,
        full_name: err.full_name,
        url: err.url
      });
    }
  }

  log(`Found ${uniqueAthletes.length} unique athletes to retry`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  let successCount = 0;
  let failCount = 0;
  const allResults = [];
  const stillFailed = [];

  for (let i = 0; i < uniqueAthletes.length; i++) {
    const athlete = uniqueAthletes[i];
    const progress = `[${i + 1}/${uniqueAthletes.length}]`;

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    try {
      log(`${progress} Retrying ${athlete.full_name} (ID: ${athlete.athlete_id})...`);

      const results = await scrapeAthletePage(page, athlete.url, athlete.athlete_id);
      results.forEach(r => r.scraped_at = new Date().toISOString());

      log(`${progress} Found ${results.length} results for ${athlete.full_name}`);
      allResults.push(...results);
      successCount++;

    } catch (error) {
      log(`${progress} Still failed: ${athlete.full_name} - ${error.message}`, 'ERROR');
      stillFailed.push(athlete);
      failCount++;
    } finally {
      await page.close().catch(() => {});
    }

    await sleep(2000); // Be nice to TFRRS
  }

  await browser.close();

  // Save retry results
  if (allResults.length > 0) {
    fs.writeFileSync(RETRY_RESULTS_FILE, JSON.stringify(allResults, null, 2));
    log(`Saved ${allResults.length} results to ${RETRY_RESULTS_FILE}`);

    // Also append to main results
    let existing = [];
    if (fs.existsSync(RESULTS_FILE)) {
      existing = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
    }
    existing.push(...allResults);
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(existing, null, 2));
    log(`Appended to main results file`);
  }

  // Update errors file with only still-failed athletes
  if (stillFailed.length > 0) {
    fs.writeFileSync(ERRORS_FILE, JSON.stringify(stillFailed.map(a => ({
      athlete_id: a.athlete_id,
      full_name: a.full_name,
      url: a.url,
      error: 'Failed on retry',
      timestamp: new Date().toISOString()
    })), null, 2));
  } else {
    fs.unlinkSync(ERRORS_FILE);
  }

  log('========================================');
  log('RETRY COMPLETE');
  log('========================================');
  log(`Success: ${successCount}`);
  log(`Still failed: ${failCount}`);
}

retryFailed().catch(error => {
  log(`Fatal error: ${error.message}`, 'ERROR');
  process.exit(1);
});
