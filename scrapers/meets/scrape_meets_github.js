#!/usr/bin/env node
/**
 * College Meets Scraper - GitHub Actions Version
 *
 * Reads Supabase credentials from environment variables.
 * Designed to run in GitHub Actions with Puppeteer.
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const https = require('https');
const fs = require('fs');
const path = require('path');

// Supabase config from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
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

function isMissingResultLinkColumn(error) {
  const message = String(error?.message || error?.body || error || '');
  return [
    'tfrrs_url',
    'athletic_net_results_url',
    'wa_results_url',
    'results_status',
    'results_last_checked_at',
    'results_imported_at',
    'results_error'
  ].some(column => message.includes(column));
}

function withoutResultLinkColumns(data) {
  const {
    tfrrs_url,
    athletic_net_results_url,
    wa_results_url,
    results_status,
    results_last_checked_at,
    results_imported_at,
    results_error,
    ...rest
  } = data;
  return rest;
}

async function meetRequest(method, endpoint, data = null) {
  try {
    return await supabaseRequest(method, endpoint, data);
  } catch (error) {
    if (data && isMissingResultLinkColumn(error)) {
      log('  Result-link columns are not in Supabase yet; retrying without them');
      return await supabaseRequest(method, endpoint, withoutResultLinkColumns(data));
    }
    throw error;
  }
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

function detectTimingPlatform(url) {
  if (!url) return null;

  const lower = url.toLowerCase();

  if (lower.includes('athletic.net') || lower.includes('jdlfasttrack') || lower.includes('blacksquirreltiming')) {
    return 'athletic_net';
  }
  if (lower.includes('milesplit')) return 'milesplit';
  if (lower.includes('pttiming')) return 'pt_timing';
  if (lower.includes('finishtiming') || lower.includes('finishlynx')) return 'finish_timing';
  if (lower.includes('tfrrs')) return 'tfrrs';
  if (lower.includes('flashresults')) return 'flashresults';
  if (lower.includes('rosterathletics')) return 'rosterathletics';
  if (lower.includes('xpresstiming')) return 'xpresstiming';
  if (lower.includes('halfmiletiming')) return 'halfmiletiming';
  if (lower.includes('windsortiming')) return 'windsortiming';
  if (lower.includes('leonetiming')) return 'leonetiming';
  if (lower.includes('wayzatatiming')) return 'wayzatatiming';
  if (lower.includes('deltatiming')) return 'deltatiming';
  if (lower.includes('lexicontiming')) return 'lexicontiming';
  if (lower.includes('herostiming')) return 'herostiming';
  if (lower.includes('omegatiming')) return 'omegatiming';
  if (lower.includes('domtel-sport')) return 'domtel';
  if (lower.includes('liveres.')) return 'live_results';
  if (lower.includes('timing')) return 'other_timing';

  return 'other';
}

const MEET_SELECT = [
  'meet_id',
  'name',
  'date',
  'end_date',
  'location',
  'meet_url',
  'timing_platform',
  'tfrrs_url',
  'athletic_net_results_url',
  'wa_results_url',
  'results_status'
].join(',');

function normalizeMeetName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\s*\[[^\]]+\]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeLocation(location) {
  return (location || '')
    .split('*')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

function datesOverlap(startA, endA, startB, endB) {
  const aEnd = endA || startA;
  const bEnd = endB || startB;
  return startA <= bEnd && startB <= aEnd;
}

function pickBestMeetCandidate(candidates, meet, meetDate, meetEndDate) {
  const targetName = normalizeMeetName(meet.name);
  const targetLocation = normalizeLocation(meet.location);

  const scored = candidates
    .map(candidate => {
      const candidateName = normalizeMeetName(candidate.name);
      const candidateLocation = normalizeLocation(candidate.location);
      const candidateEndDate = candidate.end_date || candidate.date;
      let score = 0;

      if (candidateName === targetName) score += 80;
      else if (candidateName.includes(targetName) || targetName.includes(candidateName)) score += 45;

      if (candidateLocation && targetLocation) {
        if (candidateLocation === targetLocation) score += 30;
        else if (candidateLocation.includes(targetLocation) || targetLocation.includes(candidateLocation)) score += 15;
      }

      if (datesOverlap(meetDate, meetEndDate, candidate.date, candidateEndDate)) score += 25;
      if (candidate.date === meetDate) score += 10;
      if (candidateEndDate === meetEndDate) score += 10;

      return { candidate, score };
    })
    .filter(({ score }) => score >= 100)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.candidate.meet_id - b.candidate.meet_id;
    });

  return scored[0]?.candidate || null;
}

async function findExistingMeet(meet, meetDate, meetEndDate) {
  const encodedUrls = [
    ['meet_url', meet.timingUrl],
    ['tfrrs_url', meet.tfrrsUrl],
    ['athletic_net_results_url', meet.athleticNetResultsUrl],
    ['wa_results_url', meet.waResultsUrl]
  ].filter(([, url]) => url);

  for (const [column, url] of encodedUrls) {
    try {
      const response = await supabaseRequest('GET',
        `meets?${column}=eq.${encodeURIComponent(url)}&select=${MEET_SELECT}&limit=1`);
      if (response.data && response.data.length > 0) {
        return response.data[0];
      }
    } catch (error) {
      if (!isMissingResultLinkColumn(error)) throw error;
    }
  }

  const startWindow = addDays(meetDate, -3);
  const endWindow = addDays(meetEndDate, 3);
  const response = await supabaseRequest('GET',
    `meets?date=gte.${startWindow}&date=lte.${endWindow}&select=${MEET_SELECT}`);
  const candidates = response.data || [];

  return pickBestMeetCandidate(candidates, meet, meetDate, meetEndDate);
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
      // Look for Collegiate, Conference, and Championship sections
      const targetSections = ['Collegiate', 'Conference', 'NCAA', 'NAIA', 'NJCAA'];
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
            const findLinkByText = (patterns) => links.find(anchor => {
              const text = (anchor.textContent || '').trim().toLowerCase();
              return patterns.some(pattern => text.includes(pattern));
            });
            // USTFCCCA labels the live/timing link as "Timing Site". Trust that
            // label only. Guessing from the other links (Meet Info, AthNET Meet
            // Hub, registration pages, etc.) reliably picked the wrong URL, so
            // we store no timing URL when the page has no "Timing Site" link.
            const timingLink = findLinkByText(['timing site']);
            const tfrrsLink = findLinkByText(['tfrrs results']);
            const athleticNetResultsLink = findLinkByText(['athleticnet final results', 'athletic.net final results']);
            const waResultsLink = findLinkByText(['wa meet results']);

            if (meetNameSpan && hostSpan) {
              results.push({
                name: meetNameSpan.textContent.trim(),
                location: locationSpan ? locationSpan.textContent.trim() : '',
                host: hostSpan.textContent.trim(),
                date: dateSpan ? dateSpan.textContent.trim() : '',
                timingUrl: timingLink ? timingLink.href : null,
                tfrrsUrl: tfrrsLink ? tfrrsLink.href : null,
                athleticNetResultsUrl: athleticNetResultsLink ? athleticNetResultsLink.href : null,
                waResultsUrl: waResultsLink ? waResultsLink.href : null
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
    const timingPlatform = detectTimingPlatform(meet.timingUrl);

    try {
      const existing = await findExistingMeet(meet, meetDate, meetEndDate);

      if (existing) {
        // Update timing URL or end_date if changed
        const updates = {};
        if (meet.timingUrl && meet.timingUrl !== existing.meet_url) {
          updates.meet_url = meet.timingUrl;
        }
        if (timingPlatform && timingPlatform !== existing.timing_platform) {
          updates.timing_platform = timingPlatform;
        }
        if (meet.tfrrsUrl && meet.tfrrsUrl !== existing.tfrrs_url) {
          updates.tfrrs_url = meet.tfrrsUrl;
          if (existing.results_status !== 'imported') {
            updates.results_status = 'tfrrs_available';
          }
        }
        if (meet.athleticNetResultsUrl && meet.athleticNetResultsUrl !== existing.athletic_net_results_url) {
          updates.athletic_net_results_url = meet.athleticNetResultsUrl;
        }
        if (meet.waResultsUrl && meet.waResultsUrl !== existing.wa_results_url) {
          updates.wa_results_url = meet.waResultsUrl;
        }
        if (meetEndDate !== meetDate && existing.end_date !== meetEndDate) {
          updates.end_date = meetEndDate;
        }

        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString();
          await meetRequest('PATCH', `meets?meet_id=eq.${existing.meet_id}`, updates);
          log(`  Updated: ${meet.name}`);
          updatedCount++;
        } else {
          skippedCount++;
        }
      } else {
        await meetRequest('POST', 'meets', {
          name: meet.name,
          date: meetDate,
          end_date: meetEndDate,
          location: meet.location,
          meet_url: meet.timingUrl,
          timing_platform: timingPlatform,
          tfrrs_url: meet.tfrrsUrl,
          athletic_net_results_url: meet.athleticNetResultsUrl,
          wa_results_url: meet.waResultsUrl,
          results_status: meet.tfrrsUrl ? 'tfrrs_available' : 'pending',
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
    scopes = ['last_week', 'this_week', 'next_week', 'next_month'];
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
