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

// Parse meet date - returns { start, end } for multi-day meets
function parseMeetDate(dateStr) {
  const year = new Date().getFullYear();
  const nextYear = year + 1;

  // Try to match multi-day format: "Friday-Saturday February 14-15" or "February 14-15"
  const multiDayMatch = dateStr.match(/(\w+)\s+(\d+)-(\d+)/);
  if (multiDayMatch) {
    const [_, month, startDay, endDay] = multiDayMatch;
    let startDate = new Date(`${month} ${startDay}, ${year}`);
    let endDate = new Date(`${month} ${endDay}, ${year}`);

    // If date is in the past, assume next year
    if (startDate < new Date() - 30 * 24 * 60 * 60 * 1000) {
      startDate = new Date(`${month} ${startDay}, ${nextYear}`);
      endDate = new Date(`${month} ${endDay}, ${nextYear}`);
    }

    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    };
  }

  // Single day format: "Friday February 14" or just "February 14"
  const singleDayMatch = dateStr.match(/(\w+)\s+(\d+)/);
  if (singleDayMatch) {
    const [_, month, day] = singleDayMatch;
    let date = new Date(`${month} ${day}, ${year}`);

    // If date is in the past, assume next year
    if (date < new Date() - 30 * 24 * 60 * 60 * 1000) {
      date = new Date(`${month} ${day}, ${nextYear}`);
    }

    const dateStr = date.toISOString().split('T')[0];
    return { start: dateStr, end: dateStr };
  }

  const today = new Date().toISOString().split('T')[0];
  return { start: today, end: today };
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
      // Look for Collegiate and Conference sections
      const targetSections = ['Collegiate', 'Conference'];
      const headings = Array.from(document.querySelectorAll('h4'))
        .filter(h => targetSections.some(s => h.textContent.trim().includes(s)));

      headings.forEach(heading => {
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
    const { start: meetDate, end: meetEndDate } = parseMeetDate(meet.date);

    // Check if meet exists
    const checkRes = await supabaseRequest('GET',
      `meets?name=eq.${encodeURIComponent(meet.name)}&date=eq.${meetDate}`);

    const existing = checkRes.data && checkRes.data.length > 0 ? checkRes.data[0] : null;

    if (existing) {
      // Update timing URL or end_date if changed
      const updates = {};
      if (meet.timingUrl && meet.timingUrl !== existing.meet_url) {
        updates.meet_url = meet.timingUrl;
      }
      if (meetEndDate !== meetDate && existing.end_date !== meetEndDate) {
        updates.end_date = meetEndDate;
      }

      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        await supabaseRequest('PATCH', `meets?meet_id=eq.${existing.meet_id}`, updates);
        log(`  Updated: ${meet.name}`);
        updatedCount++;
      } else {
        skippedCount++;
      }
    } else {
      // Insert new meet
      const res = await supabaseRequest('POST', 'meets', {
        name: meet.name,
        date: meetDate,
        end_date: meetEndDate,
        location: meet.location,
        meet_url: meet.timingUrl,
        status: 'upcoming',
        level: 'college',
        season: 'indoor'
      });

      if (res.status < 400) {
        log(`  Added: ${meet.name} (${meetDate}${meetEndDate !== meetDate ? ' to ' + meetEndDate : ''})`);
        newCount++;
      }
    }
  }

  return { newCount, updatedCount, skippedCount };
}

// Update meet statuses (upcoming -> completed for past dates) - uses end_date for multi-day meets
async function updateMeetStatuses() {
  log('\nUpdating meet statuses...');

  const today = new Date().toISOString().split('T')[0];

  // Get all upcoming meets and check end_date
  const res = await supabaseRequest('GET',
    `meets?status=eq.upcoming&select=meet_id,name,date,end_date`);

  if (res.data && res.data.length > 0) {
    let completedCount = 0;
    for (const meet of res.data) {
      // Use end_date if available, otherwise use date
      const meetEndDate = meet.end_date || meet.date;
      if (meetEndDate < today) {
        await supabaseRequest('PATCH', `meets?meet_id=eq.${meet.meet_id}`, {
          status: 'completed',
          updated_at: new Date().toISOString()
        });
        log(`  Marked completed: ${meet.name} (${meet.date})`);
        completedCount++;
      }
    }
    if (completedCount > 0) {
      log(`Updated ${completedCount} meets to completed status`);
    } else {
      log('No meets to update');
    }
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
