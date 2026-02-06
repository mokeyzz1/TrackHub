/**
 * Fetch list of college indoor meets from TFRRS
 *
 * Usage:
 *   node fetch-meet-list.js
 *   node fetch-meet-list.js --start-date 2025-12-01 --end-date 2026-01-31
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'output');
const MEETS_FILE = path.join(__dirname, 'meets-to-scrape.json');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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

// Parse date from TFRRS format like "12/05/25" or "01/31-02/01/26"
function parseTfrrsDate(dateStr) {
  if (!dateStr) return null;

  // Format: "MM/DD/YY" or "MM/DD-DD/YY" or "MM/DD-MM/DD/YY"
  // Take the first date in range
  const match = dateStr.match(/(\d{2})\/(\d{2})(?:-\d{2})?(?:\/\d{2})?\/(\d{2})/);
  if (match) {
    const month = match[1];
    const day = match[2];
    const year = parseInt(match[3]) >= 50 ? `19${match[3]}` : `20${match[3]}`;
    return `${year}-${month}-${day}`;
  }

  return null;
}

// Fetch meets from TFRRS using pagination
async function fetchCollegeMeets() {
  const options = parseArgs();
  const startDate = new Date(options.startDate);
  const endDate = new Date(options.endDate);

  console.log('========================================');
  console.log('FETCH COLLEGE INDOOR MEETS');
  console.log('========================================');
  console.log(`Date range: ${options.startDate} to ${options.endDate}\n`);

  const allMeets = [];
  let page = 1;
  let foundEarlier = false; // Flag when we find meets before our start date
  let foundInRange = false; // Flag when we find meets in our range

  console.log('Scanning results pages...');

  while (!foundEarlier && page <= 100) {
    const url = `https://www.tfrrs.org/results_search.html?page=${page}`;

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      let meetsOnPage = 0;
      let meetsInRange = 0;

      // Find table rows with meet data
      $('table tbody tr').each((_, row) => {
        const $row = $(row);
        const cells = $row.find('td');

        if (cells.length < 4) return;

        // First cell is date
        const dateStr = $(cells[0]).text().trim();
        const meetDate = parseTfrrsDate(dateStr);

        // Second cell has meet name and link
        const $meetLink = $(cells[1]).find('a');
        if (!$meetLink.length) return;

        const meetName = $meetLink.text().trim();
        const href = $meetLink.attr('href');
        if (!href || !meetName) return;

        meetsOnPage++;

        // Check if meet is in our date range
        if (meetDate) {
          const meetDateObj = new Date(meetDate);

          // If meet is before our start date, we've gone past our range
          if (meetDateObj < startDate) {
            foundEarlier = true;
            return;
          }

          // If meet is after our end date, skip but continue
          if (meetDateObj > endDate) {
            return;
          }

          foundInRange = true;
          meetsInRange++;
        }

        const meetUrl = href.startsWith('http') ? href : `https://www.tfrrs.org${href}`;

        // Only add meets in our date range
        if (meetDate) {
          const meetDateObj = new Date(meetDate);
          if (meetDateObj >= startDate && meetDateObj <= endDate) {
            allMeets.push({
              name: meetName,
              url: meetUrl,
              date: meetDate
            });
          }
        }
      });

      console.log(`  Page ${page}: ${meetsOnPage} meets, ${meetsInRange} in range`);

      if (meetsOnPage === 0) {
        console.log('  No more meets found');
        break;
      }

      page++;
      await sleep(1500);

    } catch (error) {
      console.error(`Error fetching page ${page}:`, error.message);
      break;
    }
  }

  // Deduplicate by URL
  const uniqueMeets = [];
  const seenUrls = new Set();
  for (const meet of allMeets) {
    if (!seenUrls.has(meet.url)) {
      seenUrls.add(meet.url);
      uniqueMeets.push(meet);
    }
  }

  // Sort by date descending (newest first)
  uniqueMeets.sort((a, b) => new Date(b.date) - new Date(a.date));

  console.log(`\n========================================`);
  console.log(`FOUND ${uniqueMeets.length} MEETS IN DATE RANGE`);
  console.log(`========================================\n`);

  // Save to file
  fs.writeFileSync(MEETS_FILE, JSON.stringify(uniqueMeets, null, 2));
  console.log(`Saved to: ${MEETS_FILE}`);

  // Show sample
  console.log('\nSample meets (first 10):');
  uniqueMeets.slice(0, 10).forEach(m => {
    console.log(`  - ${m.date} | ${m.name}`);
  });

  // Count by month
  const byMonth = {};
  uniqueMeets.forEach(m => {
    const month = m.date?.substring(0, 7) || 'unknown';
    byMonth[month] = (byMonth[month] || 0) + 1;
  });
  console.log('\nMeets by month:', byMonth);

  return uniqueMeets;
}

// Run
fetchCollegeMeets().catch(console.error);
