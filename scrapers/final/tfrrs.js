#!/usr/bin/env node
/**
 * TFRRS Final Results Scraper
 *
 * Scrapes official final results from TFRRS (Track & Field Results Reporting System)
 * This is the most reliable source for official college track results.
 *
 * Key advantage: TFRRS athlete IDs match our database, so linking is precise.
 *
 * Usage:
 *   node tfrrs.js <tfrrs_meet_url>
 *   node tfrrs.js recent                    # Scrape recent completed meets
 *   node tfrrs.js search "meet name"        # Search for a meet
 */

const puppeteer = require('puppeteer');
const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace('https://', '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Helper for delays
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Supabase REST helper
function supabaseRequest(method, endpoint, data = null) {
  return new Promise((resolve, reject) => {
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
    };
    if (method === 'POST' || method === 'PATCH') {
      headers['Prefer'] = 'return=representation';
    }

    const options = {
      hostname: SUPABASE_URL,
      path: '/rest/v1/' + endpoint,
      method: method,
      headers: headers
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

class TFRRSScraper {
  constructor(options = {}) {
    this.headless = options.headless !== false;
    this.browser = null;
    this.page = null;
    this.athleteCache = new Map(); // tfrrs_athlete_id -> athlete_id
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: this.headless ? 'new' : false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1280, height: 800 });

    // Set user agent to avoid blocks
    await this.page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * Load athlete mapping for specific TFRRS IDs (batch lookup)
   */
  async loadAthleteMapping(tfrrsIds = []) {
    if (tfrrsIds.length === 0) {
      console.log('No TFRRS IDs to look up');
      return;
    }

    console.log(`Looking up ${tfrrsIds.length} athletes by TFRRS ID...`);

    try {
      // Batch lookup - query only the IDs we need
      const batchSize = 100;
      for (let i = 0; i < tfrrsIds.length; i += batchSize) {
        const batch = tfrrsIds.slice(i, i + batchSize);
        const athletes = await supabaseRequest('GET',
          `athletes?select=athlete_id,tfrrs_athlete_id&tfrrs_athlete_id=in.(${batch.join(',')})`
        );

        for (const athlete of athletes) {
          if (athlete.tfrrs_athlete_id) {
            this.athleteCache.set(String(athlete.tfrrs_athlete_id), athlete.athlete_id);
          }
        }
      }

      console.log(`Matched ${this.athleteCache.size} athletes`);
    } catch (e) {
      console.error('Error loading athletes:', e.message);
    }
  }

  /**
   * Extract TFRRS athlete ID from a link
   * Links look like: /athletes/8929216/Mark_Barajas.html
   */
  extractTfrrsAthleteId(href) {
    if (!href) return null;
    const match = href.match(/\/athletes\/(\d+)\//);
    return match ? match[1] : null;
  }

  /**
   * Get list of events from a TFRRS meet page
   */
  async getEvents(meetUrl) {
    if (!this.browser) await this.init();

    console.log(`Loading meet: ${meetUrl}`);
    await this.page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(2000);

    const events = await this.page.evaluate(() => {
      const eventList = [];

      // TFRRS has event links in tables or lists
      // Look for links containing event names
      const links = document.querySelectorAll('a');

      links.forEach(link => {
        const href = link.href;
        const text = link.textContent.trim();

        // Event result links typically contain the meet ID and have event names
        if (href.includes('/results/') && href !== window.location.href) {
          // Check if it looks like an event (has distance/event name)
          const isEvent = text.match(/\d+m|mile|relay|shot|discus|javelin|hammer|pole|high|long|triple|weight|pentathlon|heptathlon|decathlon/i);

          if (isEvent && text.length > 2 && text.length < 100) {
            eventList.push({
              name: text,
              url: href
            });
          }
        }
      });

      // Remove duplicates
      const seen = new Set();
      return eventList.filter(e => {
        if (seen.has(e.url)) return false;
        seen.add(e.url);
        return true;
      });
    });

    console.log(`Found ${events.length} events`);
    return events;
  }

  /**
   * Scrape results from a single event page
   */
  async scrapeEventResults(eventUrl) {
    if (!this.browser) await this.init();

    await this.page.goto(eventUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(2000);

    const results = await this.page.evaluate(() => {
      const data = [];

      // Get event name from page
      const h3 = document.querySelector('h3');
      const eventName = h3 ? h3.textContent.trim() : '';

      // Find result tables
      const tables = document.querySelectorAll('table');

      tables.forEach(table => {
        const rows = table.querySelectorAll('tbody tr');

        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length < 3) return;

          // Try to extract place, name, team, time/mark
          const placeCell = cells[0];
          const place = parseInt(placeCell?.textContent.trim());

          if (isNaN(place)) return;

          // Find athlete link and name
          let athleteName = '';
          let athleteLink = '';
          let teamName = '';
          let mark = '';

          // Look for athlete link
          const athleteAnchor = row.querySelector('a[href*="/athletes/"]');
          if (athleteAnchor) {
            athleteName = athleteAnchor.textContent.trim();
            athleteLink = athleteAnchor.href;
          }

          // Look for team link
          const teamAnchor = row.querySelector('a[href*="/teams/"]');
          if (teamAnchor) {
            teamName = teamAnchor.textContent.trim();
          }

          // Look for time/mark (usually last cell or cell with time format)
          for (let i = cells.length - 1; i >= 0; i--) {
            const cellText = cells[i].textContent.trim();
            // Time format: MM:SS.ss, SS.ss, or field marks like 1.85m, 15.23m
            if (cellText.match(/^\d+:\d+\.\d+$/) ||
                cellText.match(/^\d+\.\d+m?$/) ||
                cellText.match(/^\d+-\d+\.?\d*$/)) {
              mark = cellText;
              break;
            }
          }

          if (athleteName && (mark || place)) {
            data.push({
              place: place,
              athlete_name: athleteName,
              athlete_link: athleteLink,
              team_name: teamName,
              mark: mark
            });
          }
        });
      });

      return {
        event_name: eventName,
        results: data
      };
    });

    return results;
  }

  /**
   * Parse time/mark to seconds (for running events)
   */
  parseTimeToSeconds(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;

    // Handle field marks (keep as is, don't convert)
    if (timeStr.includes('m') || timeStr.includes('-')) return null;

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
   * Scrape all results from a TFRRS meet
   */
  async scrapeMeet(meetUrl) {
    if (!this.browser) await this.init();

    const meetData = {
      meet_url: meetUrl,
      scraped_at: new Date().toISOString(),
      events: [],
      stats: { total_results: 0, matched_athletes: 0 }
    };

    // Get meet name from URL (most reliable) or page
    await this.page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(2000);

    // Extract meet name from URL: /results/12345/Meet_Name -> Meet Name
    const urlMatch = meetUrl.match(/\/results\/\d+\/([^\/\?]+)/);
    if (urlMatch) {
      meetData.meet_name = urlMatch[1].replace(/_/g, ' ');
    } else {
      // Fallback to page content
      meetData.meet_name = await this.page.evaluate(() => {
        // Try to get from breadcrumb or specific meet title element
        const breadcrumb = document.querySelector('.breadcrumb li:last-child a, .breadcrumb li:last-child');
        if (breadcrumb && breadcrumb.textContent.trim() !== 'TFRRS') {
          return breadcrumb.textContent.trim();
        }
        const title = document.title.split('|')[0].trim();
        if (title && title !== 'TFRRS') {
          return title;
        }
        return 'Unknown Meet';
      });
    }

    // Get meet date
    meetData.meet_date = await this.page.evaluate(() => {
      const dateEl = document.querySelector('.panel-heading-normal-text');
      const text = dateEl?.textContent || '';
      const match = text.match(/([A-Z][a-z]+ \d+, \d{4})/);
      return match ? match[1] : null;
    });

    console.log(`\nMeet: ${meetData.meet_name}`);
    console.log(`Date: ${meetData.meet_date || 'Unknown'}`);

    // Get all events
    const events = await this.getEvents(meetUrl);

    // First pass: scrape all events and collect TFRRS IDs
    const allTfrrsIds = new Set();

    for (const event of events) {
      console.log(`  Scraping: ${event.name}`);

      try {
        const eventResults = await this.scrapeEventResults(event.url);

        // Collect all TFRRS IDs
        for (const result of eventResults.results) {
          const tfrrsId = this.extractTfrrsAthleteId(result.athlete_link);
          if (tfrrsId) {
            result.tfrrs_athlete_id = tfrrsId;
            allTfrrsIds.add(tfrrsId);
          }
          meetData.stats.total_results++;
        }

        meetData.events.push({
          name: event.name,
          url: event.url,
          ...eventResults
        });

        console.log(`    ${eventResults.results.length} results`);

      } catch (e) {
        console.log(`    Error: ${e.message}`);
      }

      // Be nice to TFRRS servers
      await delay(1000);
    }

    // Second pass: look up all TFRRS IDs at once
    if (allTfrrsIds.size > 0) {
      await this.loadAthleteMapping(Array.from(allTfrrsIds));

      // Now add athlete_ids to results
      for (const event of meetData.events) {
        for (const result of event.results || []) {
          if (result.tfrrs_athlete_id && this.athleteCache.has(result.tfrrs_athlete_id)) {
            result.athlete_id = this.athleteCache.get(result.tfrrs_athlete_id);
            meetData.stats.matched_athletes++;
          }
        }
      }
    }

    console.log(`\nTotal: ${meetData.stats.total_results} results, ${meetData.stats.matched_athletes} matched to athletes`);

    return meetData;
  }

  /**
   * Search for recent meets on TFRRS
   */
  async searchRecentMeets(daysBack = 7) {
    if (!this.browser) await this.init();

    console.log('Searching for recent TFRRS meets...');

    // TFRRS results calendar
    const calendarUrl = 'https://www.tfrrs.org/results_search.html';
    await this.page.goto(calendarUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(2000);

    const meets = await this.page.evaluate((daysBack) => {
      const meetList = [];
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);

      // Look for meet links
      const links = document.querySelectorAll('a[href*="/results/"]');

      links.forEach(link => {
        const href = link.href;
        const text = link.textContent.trim();

        // Skip non-meet links
        if (!text || text.length < 5 || href.includes('/athletes/')) return;

        // Try to find date near the link
        const parent = link.closest('tr, li, div');
        const dateText = parent?.textContent.match(/([A-Z][a-z]+ \d+, \d{4})/);

        meetList.push({
          name: text,
          url: href,
          date: dateText ? dateText[1] : null
        });
      });

      return meetList.slice(0, 20); // Limit to recent
    }, daysBack);

    console.log(`Found ${meets.length} recent meets`);
    return meets;
  }
}

/**
 * Upload TFRRS results to database
 */
async function uploadResults(meetData) {
  console.log('\nUploading results to database...');

  let uploaded = 0;
  let errors = 0;

  for (const event of meetData.events) {
    for (const result of event.results) {
      try {
        // Check if result already exists
        const existing = await supabaseRequest('GET',
          `live_results?meet_url=eq.${encodeURIComponent(meetData.meet_url)}&event_name=eq.${encodeURIComponent(event.event_name || event.name)}&participant_name=eq.${encodeURIComponent(result.athlete_name)}&select=live_result_id`
        );

        const markSeconds = result.mark ? parseTimeToSeconds(result.mark) : null;

        function parseTimeToSeconds(timeStr) {
          if (!timeStr || timeStr.includes('m') || timeStr.includes('-')) return null;
          const parts = timeStr.split(':');
          if (parts.length === 2) return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
          if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
          return parseFloat(timeStr);
        }

        if (existing && existing.length > 0) {
          // Update existing
          await supabaseRequest('PATCH', `live_results?live_result_id=eq.${existing[0].live_result_id}`, {
            mark_raw: result.mark,
            mark_seconds: markSeconds,
            place: result.place,
            athlete_id: result.athlete_id || null,
            is_final: true,
            result_type: 'final',
            updated_at: new Date().toISOString()
          });
        } else {
          // Insert new
          await supabaseRequest('POST', 'live_results', {
            meet_url: meetData.meet_url,
            meet_name: meetData.meet_name,
            event_name: event.event_name || event.name,
            participant_name: result.athlete_name,
            team_name: result.team_name,
            place: result.place,
            mark_raw: result.mark,
            mark_seconds: markSeconds,
            athlete_id: result.athlete_id || null,
            scraped_at: new Date().toISOString(),
            date: meetData.meet_date ? new Date(meetData.meet_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            round: 'FINAL',
            result_type: 'final',
            is_final: true
          });
        }

        uploaded++;
      } catch (e) {
        errors++;
      }
    }
  }

  console.log(`Uploaded: ${uploaded}, Errors: ${errors}`);
  return { uploaded, errors };
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log('TFRRS Final Results Scraper');
    console.log('');
    console.log('Usage:');
    console.log('  node tfrrs.js <meet_url>          Scrape a specific meet');
    console.log('  node tfrrs.js recent              Search for recent meets');
    console.log('  node tfrrs.js --upload <url>      Scrape and upload to database');
    console.log('');
    console.log('Examples:');
    console.log('  node tfrrs.js https://www.tfrrs.org/results/12345/');
    console.log('  node tfrrs.js --upload https://www.tfrrs.org/results/12345/');
    process.exit(1);
  }

  const scraper = new TFRRSScraper({ headless: true });

  async function run() {
    try {
      if (command === 'recent') {
        const meets = await scraper.searchRecentMeets(7);
        console.log('\nRecent TFRRS meets:');
        meets.forEach((m, i) => console.log(`${i + 1}. ${m.name}\n   ${m.url}`));

      } else if (command === '--upload' && args[1]) {
        const meetData = await scraper.scrapeMeet(args[1]);
        await uploadResults(meetData);

      } else if (command.startsWith('http')) {
        const meetData = await scraper.scrapeMeet(command);

        // Save to JSON
        const fs = require('fs');
        const outFile = `tfrrs_results_${Date.now()}.json`;
        fs.writeFileSync(outFile, JSON.stringify(meetData, null, 2));
        console.log(`\nSaved to: ${outFile}`);

      } else {
        console.log('Unknown command. Run without arguments for help.');
      }
    } finally {
      await scraper.close();
    }
  }

  run().catch(console.error);
}

module.exports = { TFRRSScraper, uploadResults };
