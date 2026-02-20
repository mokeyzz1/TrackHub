#!/usr/bin/env node
/**
 * College Meets Scraper - GitHub Actions Version
 *
 * Reads Supabase credentials from environment variables.
 * Designed to run in GitHub Actions with Puppeteer.
 */

const puppeteer = require('puppeteer');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Supabase config from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || 'hunbahsnaeeztmzqpnrl.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_KEY environment variable is required');
  process.exit(1);
}

// Paths
const LOGS_DIR = path.join(__dirname, '../logs');
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

// Logging
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(LOGS_DIR, `github_scrape_${timestamp}.log`);
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
      hostname: SUPABASE_URL.replace('https://', ''),
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

  // Format: "Fri Feb 20-Sat Feb 21" (USTFCCCA format)
  const ustfccaMatch = dateStr.match(/\w+\s+(\w+)\s+(\d+)-\w+\s+(\w+)\s+(\d+)/);
  if (ustfccaMatch) {
    const [_, startMonth, startDay, endMonth, endDay] = ustfccaMatch;
    let startDate = new Date(`${startMonth} ${startDay}, ${year}`);
    let endDate = new Date(`${endMonth} ${endDay}, ${year}`);

    if (startDate < new Date() - 30 * 24 * 60 * 60 * 1000) {
      startDate = new Date(`${startMonth} ${startDay}, ${nextYear}`);
      endDate = new Date(`${endMonth} ${endDay}, ${nextYear}`);
    }

    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    };
  }

  // Format: "February 14-15" or "Feb 14-15"
  const simpleMultiDay = dateStr.match(/(\w+)\s+(\d+)-(\d+)/);
  if (simpleMultiDay) {
    const [_, month, startDay, endDay] = simpleMultiDay;
    let startDate = new Date(`${month} ${startDay}, ${year}`);
    let endDate = new Date(`${month} ${endDay}, ${year}`);

    if (startDate < new Date() - 30 * 24 * 60 * 60 * 1000) {
      startDate = new Date(`${month} ${startDay}, ${nextYear}`);
      endDate = new Date(`${month} ${endDay}, ${nextYear}`);
    }

    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    };
  }

  // Single day format: "Fri Feb 20" or "February 14"
  const singleDayMatch = dateStr.match(/(\w+)\s+(\d+)/);
  if (singleDayMatch) {
    const [_, month, day] = singleDayMatch;
    let date = new Date(`${month} ${day}, ${year}`);

    if (date < new Date() - 30 * 24 * 60 * 60 * 1000) {
      date = new Date(`${month} ${day}, ${nextYear}`);
    }

    const d = date.toISOString().split('T')[0];
    return { start: d, end: d };
  }

  const today = new Date().toISOString().split('T')[0];
  return { start: today, end: today };
}

// Scrape meets from USTFCCCA
async function scrapeMeets(datescope = 'this_week') {
  log(`Scraping USTFCCCA meets: ${datescope}`);

  const url = `https://web4.ustfccca.org/meets-results?datescope=${datescope}`;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    log('Page loaded');

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
  log(`Upserting ${meets.length} meets to Supabase...`);

  let newCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const meet of meets) {
    const { start: meetDate, end: meetEndDate } = parseMeetDate(meet.date);

    try {
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
        await supabaseRequest('POST', 'meets', {
          name: meet.name,
          date: meetDate,
          end_date: meetEndDate,
          location: meet.location,
          meet_url: meet.timingUrl,
          status: 'upcoming',
          level: 'college',
          season: 'indoor'
        });
        log(`  Added: ${meet.name} (${meetDate}${meetEndDate !== meetDate ? ' to ' + meetEndDate : ''})`);
        newCount++;
      }
    } catch (e) {
      log(`  Error processing ${meet.name}: ${e.message}`);
    }
  }

  return { newCount, updatedCount, skippedCount };
}

// Update meet statuses - uses end_date for multi-day meets
async function updateMeetStatuses() {
  log('Updating meet statuses...');

  const today = new Date().toISOString().split('T')[0];

  try {
    // Mark meets as completed if end_date (or date if no end_date) is in the past
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
          completedCount++;
        }
      }
      if (completedCount > 0) {
        log(`Updated ${completedCount} meets to completed`);
      }
    }
  } catch (e) {
    log(`Error updating statuses: ${e.message}`);
  }
}

// Main
async function main() {
  const arg = process.argv[2] || 'all';

  log('='.repeat(60));
  log('COLLEGE MEETS SCRAPER - GitHub Actions');
  log(`Started: ${new Date().toISOString()}`);
  log('='.repeat(60));

  let scopes;
  if (arg === 'all') {
    scopes = ['this_week', 'next_week', 'next_month'];
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

    await updateMeetStatuses();

    log('\n' + '='.repeat(60));
    log('SCRAPE COMPLETE');
    log(`  New meets: ${totalNew}`);
    log(`  Updated: ${totalUpdated}`);
    log(`  Skipped: ${totalSkipped}`);
    log('='.repeat(60));

  } catch (error) {
    log(`ERROR: ${error.message}`);
    process.exit(1);
  }

  logStream.end();
}

main();
