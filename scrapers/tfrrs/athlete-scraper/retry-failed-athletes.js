/**
 * Retry Failed Athletes
 *
 * Retries scraping athletes that failed with HTTP errors.
 * Uses longer delays to avoid rate limiting.
 *
 * Usage:
 *   node retry-failed-athletes.js          # Retry all failed
 *   node retry-failed-athletes.js --slow   # Extra slow (10s between requests)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const cheerio = require('cheerio');

const ERRORS_FILE = path.join(__dirname, './output/scraper-errors.json');
const OUTPUT_RESULTS = path.join(__dirname, './output/retry-results.json');
const OUTPUT_PRS = path.join(__dirname, './output/retry-prs.json');
const CHECKPOINT_FILE = path.join(__dirname, './retry-checkpoint.json');
const STILL_FAILING_FILE = path.join(__dirname, './output/still-failing.json');

// Slower delays to avoid rate limits
const SLOW_MODE = process.argv.includes('--slow');
const DELAY_BETWEEN_REQUESTS = SLOW_MODE ? 10000 : 5000;
const RETRY_DELAY = 30000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

function parseAthleteResults(html, athleteId) {
  const $ = cheerio.load(html);
  const results = [];

  $('table.table-hover').each((_, table) => {
    const $table = $(table);
    const $header = $table.find('thead th, th[colspan]').first();
    if (!$header.length) return;

    const $meetLink = $header.find('a[href*="/results/"]');
    const meetName = $meetLink.text().trim();
    if (!meetName) return;

    const $dateSpan = $header.find('span');
    let date = '';
    if ($dateSpan.length) {
      const dateMatch = $dateSpan.text().match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:-\w+\s+\d{1,2})?,?\s*\d{4}/i);
      if (dateMatch) {
        date = dateMatch[0].trim();
      }
    }

    $table.find('tbody tr, tr').each((_, row) => {
      const $row = $(row);
      const $cells = $row.find('td');
      if ($cells.length < 2) return;

      const eventName = $cells.eq(0).text().trim();
      const $markLink = $cells.eq(1).find('a');
      let mark = $markLink.length ? $markLink.text().trim() : $cells.eq(1).text().trim();

      let place = null;
      if ($cells.length > 2) {
        const placeMatch = $cells.eq(2).text().match(/(\d+)(st|nd|rd|th)?/i);
        if (placeMatch) {
          place = parseInt(placeMatch[1]);
        }
      }

      if (!mark || mark.length < 3) return;

      const cleanMark = mark.replace(/\s*\(\d+(st|nd|rd|th)?\)/gi, '').trim();
      if (cleanMark.toLowerCase().includes('top') || cleanMark.toLowerCase().includes('meters')) return;

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
}

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

function loadCheckpoint() {
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8'));
  } catch {
    return { lastIndex: 0, results: [], prs: [] };
  }
}

function saveCheckpoint(index, results, prs) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({ lastIndex: index, results, prs }, null, 2));
}

async function main() {
  console.log('========================================');
  console.log('RETRY FAILED ATHLETES');
  console.log(`Mode: ${SLOW_MODE ? 'SLOW (10s delay)' : 'NORMAL (5s delay)'}`);
  console.log('========================================\n');

  const errors = JSON.parse(fs.readFileSync(ERRORS_FILE, 'utf-8'));
  console.log(`Loaded ${errors.length} failed athletes\n`);

  const checkpoint = loadCheckpoint();
  const startIndex = checkpoint.lastIndex;
  let allResults = checkpoint.results || [];
  let allPrs = checkpoint.prs || [];

  if (startIndex > 0) {
    console.log(`Resuming from index ${startIndex}\n`);
  }

  let successCount = 0;
  let stillFailing = [];

  for (let i = startIndex; i < errors.length; i++) {
    const athlete = errors[i];

    console.log(`[${i + 1}/${errors.length}] Retrying ${athlete.full_name}...`);

    try {
      const html = await fetchUrl(athlete.url);
      const results = parseAthleteResults(html, athlete.athlete_id);
      const prs = parseAthletePRs(html, athlete.athlete_id);

      successCount++;
      allResults.push(...results);
      allPrs.push(...prs);
      console.log(`  ✓ Found ${results.length} results, ${prs.length} PRs`);
    } catch (err) {
      stillFailing.push({ ...athlete, error: err.message, retryTimestamp: new Date().toISOString() });
      console.log(`  ✗ Still failing: ${err.message}`);

      // Extra delay on error
      await sleep(RETRY_DELAY);
    }

    // Save checkpoint every 10 athletes
    if ((i + 1) % 10 === 0) {
      saveCheckpoint(i + 1, allResults, allPrs);
      console.log(`  [Checkpoint saved at ${i + 1}]`);
    }

    // Delay between requests
    if (i < errors.length - 1) {
      await sleep(DELAY_BETWEEN_REQUESTS);
    }
  }

  // Save results
  fs.writeFileSync(OUTPUT_RESULTS, JSON.stringify(allResults, null, 2));
  fs.writeFileSync(OUTPUT_PRS, JSON.stringify(allPrs, null, 2));
  fs.writeFileSync(STILL_FAILING_FILE, JSON.stringify(stillFailing, null, 2));

  // Clean up checkpoint on completion
  if (fs.existsSync(CHECKPOINT_FILE)) {
    fs.unlinkSync(CHECKPOINT_FILE);
  }

  console.log('\n========================================');
  console.log('RETRY COMPLETE');
  console.log('========================================');
  console.log(`Recovered: ${successCount}/${errors.length}`);
  console.log(`Still failing: ${stillFailing.length}`);
  console.log(`Results: ${allResults.length}`);
  console.log(`PRs: ${allPrs.length}`);
  console.log(`\nSaved to:`);
  console.log(`  ${OUTPUT_RESULTS}`);
  console.log(`  ${OUTPUT_PRS}`);
  if (stillFailing.length > 0) {
    console.log(`  ${STILL_FAILING_FILE}`);
  }
}

main().catch(console.error);
