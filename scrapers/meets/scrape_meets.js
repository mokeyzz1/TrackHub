#!/usr/bin/env node
/**
 * College Meets Scraper
 *
 * Scrapes college track meets from USTFCCCA and uploads to Supabase.
 * Can be run manually or scheduled via cron.
 *
 * Usage:
 *   node scrape_meets.js                    # Scrape this_week + next_week
 *   node scrape_meets.js this_week          # Scrape specific scope
 *   node scrape_meets.js next_month         # Scrape next month
 *   node scrape_meets.js all                # Scrape all scopes
 *
 * Scopes: this_week, next_week, next_month
 */

const puppeteer = require('puppeteer');
const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Supabase config from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL?.replace('https://', '') || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: Missing Supabase credentials. Check your .env file.');
  process.exit(1);
}

// Paths
const LOGS_DIR = path.join(__dirname, '../logs');
const OUTPUT_DIR = path.join(__dirname, '../output');

// Ensure directories exist
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Logging
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(LOGS_DIR, `scrape_${timestamp}.log`);
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
        'Prefer': 'return=representation'
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
            resolve({ data: result, status: res.statusCode });
          }
        } catch (e) {
          resolve({ data: body, status: res.statusCode });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// Parse meet date
function parseMeetDate(dateStr) {
  const year = new Date().getFullYear();
  const nextYear = year + 1;

  const match = dateStr.match(/\w+\s+(\w+)\s+(\d+)/);
  if (match) {
    const [_, month, day] = match;
    const date = new Date(`${month} ${day}, ${year}`);

    // If date is in the past, assume next year
    if (date < new Date() - 30 * 24 * 60 * 60 * 1000) {
      return new Date(`${month} ${day}, ${nextYear}`).toISOString().split('T')[0];
    }
    return date.toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

// Scrape meets from USTFCCCA
async function scrapeMeets(datescope = 'this_week') {
  log(`\nScraping USTFCCCA meets: ${datescope}`);

  const url = `https://www.ustfccca.org/meets-results?datescope=${datescope}`;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Set a reasonable viewport
  await page.setViewport({ width: 1280, height: 800 });

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    log('Page loaded');

    // Wait for content
    await new Promise(resolve => setTimeout(resolve, 3000));

    const meets = await page.evaluate(() => {
      const results = [];
      const collegiateHeadings = Array.from(document.querySelectorAll('h4'))
        .filter(h => h.textContent.trim() === 'Collegiate');

      collegiateHeadings.forEach(heading => {
        let nextElement = heading.nextElementSibling;
        let table = null;

        while (nextElement && !table) {
          if (nextElement.tagName === 'TABLE') {
            table = nextElement;
            break;
          }
          if (nextElement.tagName === 'H3' || nextElement.tagName === 'H2') break;
          nextElement = nextElement.nextElementSibling;
        }

        if (!table) return;

        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            const meetCol = cells[0];
            const hostCol = cells[1];
            const infoCol = cells[2];

            const meetNameSpan = meetCol.querySelector('span[style*="font-weight:bold"]');
            const locationSpan = meetCol.querySelector('span[style*="font-size:0.85em"]');
            const hostSpan = hostCol.querySelector('span:first-child');
            const dateSpan = hostCol.querySelector('span[style*="font-size:0.85em"]');

            const links = Array.from(infoCol.querySelectorAll('a'));
            const timingLink = links.find(a =>
              a.href.includes('tfrrs.org') ||
              a.href.includes('athletic.net') ||
              a.href.includes('milesplit') ||
              a.href.includes('live.') ||
              a.textContent.includes('Timing') ||
              a.textContent.includes('Results')
            );

            if (meetNameSpan && hostSpan) {
              results.push({
                name: meetNameSpan.textContent.trim(),
                location: locationSpan ? locationSpan.textContent.trim() : '',
                host: hostSpan.textContent.trim(),
                date: dateSpan ? dateSpan.textContent.trim() : '',
                timingUrl: timingLink ? timingLink.href : null
              });
            }
          }
        });
      });

      return results;
    });

    await browser.close();
    log(`Found ${meets.length} meets for ${datescope}`);
    return meets;

  } catch (error) {
    await browser.close();
    throw error;
  }
}

// Upsert meets to Supabase
async function upsertMeets(meets) {
  log(`\nUpserting ${meets.length} meets to Supabase...`);

  let newCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const meet of meets) {
    const meetDate = parseMeetDate(meet.date);

    // Check if meet exists
    const checkRes = await supabaseRequest('GET',
      `meets?name=eq.${encodeURIComponent(meet.name)}&date=eq.${meetDate}`);

    const existing = checkRes.data && checkRes.data.length > 0 ? checkRes.data[0] : null;

    if (existing) {
      // Update if live link changed
      if (meet.timingUrl && meet.timingUrl !== existing.meet_url) {
        await supabaseRequest('PATCH', `meets?meet_id=eq.${existing.meet_id}`, {
          meet_url: meet.timingUrl,
          updated_at: new Date().toISOString()
        });
        log(`  Updated: ${meet.name} (added live link)`);
        updatedCount++;
      } else {
        skippedCount++;
      }
    } else {
      // Insert new meet
      const res = await supabaseRequest('POST', 'meets', {
        name: meet.name,
        date: meetDate,
        location: meet.location,
        meet_url: meet.timingUrl,
        status: 'upcoming',
        level: 'college',
        season: 'indoor'
      });

      if (res.status < 400) {
        log(`  Added: ${meet.name}`);
        newCount++;
      }
    }
  }

  return { newCount, updatedCount, skippedCount };
}

// Update meet statuses (upcoming -> completed for past dates)
async function updateMeetStatuses() {
  log('\nUpdating meet statuses...');

  const today = new Date().toISOString().split('T')[0];

  // Get meets that should be completed (date is in the past, but status is still upcoming)
  const res = await supabaseRequest('GET',
    `meets?date=lt.${today}&status=eq.upcoming&select=meet_id,name,date`);

  if (res.data && res.data.length > 0) {
    for (const meet of res.data) {
      await supabaseRequest('PATCH', `meets?meet_id=eq.${meet.meet_id}`, {
        status: 'completed',
        updated_at: new Date().toISOString()
      });
      log(`  Marked completed: ${meet.name} (${meet.date})`);
    }
    log(`Updated ${res.data.length} meets to completed status`);
  } else {
    log('No meets to update');
  }
}

// Main
async function main() {
  const arg = process.argv[2] || 'default';

  log('='.repeat(60));
  log('COLLEGE MEETS SCRAPER');
  log(`Started: ${new Date().toISOString()}`);
  log('='.repeat(60));

  let scopes;
  if (arg === 'all') {
    scopes = ['this_week', 'next_week', 'next_month'];
  } else if (arg === 'default') {
    scopes = ['this_week', 'next_week'];
  } else {
    scopes = [arg];
  }

  let totalNew = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  try {
    for (const scope of scopes) {
      const meets = await scrapeMeets(scope);
      const result = await upsertMeets(meets);
      totalNew += result.newCount;
      totalUpdated += result.updatedCount;
      totalSkipped += result.skippedCount;
    }

    // Update statuses for past meets
    await updateMeetStatuses();

    // Save summary
    const summary = {
      timestamp: new Date().toISOString(),
      scopes,
      newMeets: totalNew,
      updatedMeets: totalUpdated,
      skippedMeets: totalSkipped
    };

    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'last_scrape_summary.json'),
      JSON.stringify(summary, null, 2)
    );

    log('\n' + '='.repeat(60));
    log('SCRAPE COMPLETE');
    log(`  New meets: ${totalNew}`);
    log(`  Updated: ${totalUpdated}`);
    log(`  Skipped: ${totalSkipped}`);
    log('='.repeat(60));

  } catch (error) {
    log(`\nERROR: ${error.message}`);
    process.exit(1);
  }

  logStream.end();
}

main();
