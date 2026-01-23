#!/usr/bin/env node
/**
 * Athletic.net Family Scraper
 *
 * Handles: athletic.net, live.athletic.net, live.jdlfasttrack.com,
 *          results.blacksquirreltiming.com, and other athletic.net-powered sites
 *
 * Modes:
 *   - entries: Scrape entries before meet (who's running what)
 *   - live: Scrape during meet (times as they happen)
 *   - final: Scrape after meet (complete results)
 */

const puppeteer = require('puppeteer');

// Helper for delays (waitForTimeout was removed in newer puppeteer)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class AthleticNetScraper {
  constructor(options = {}) {
    this.headless = options.headless !== false;
    this.timeout = options.timeout || 60000;
    this.browser = null;
    this.page = null;
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: this.headless ? 'new' : false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1280, height: 800 });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * Get list of events from the meet page
   */
  async getEvents(meetUrl) {
    if (!this.browser) await this.init();

    console.log(`Loading meet: ${meetUrl}`);
    await this.page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: this.timeout });
    await delay(3000);

    const events = await this.page.evaluate(() => {
      const eventList = [];

      // Look for event links in various formats
      const links = document.querySelectorAll('a[href*="/event/"], a[href*="/events/"]');

      links.forEach(link => {
        const text = link.textContent.trim();
        const href = link.href;

        // Skip navigation links
        if (text.length < 3 || text.includes('Back') || text.includes('Home')) return;

        // Determine event status from text or classes
        let status = 'unknown';
        if (text.toLowerCase().includes('result') || link.classList.contains('has-results')) {
          status = 'results';
        } else if (text.toLowerCase().includes('live') || text.toLowerCase().includes('progress')) {
          status = 'live';
        } else if (text.toLowerCase().includes('entries') || text.toLowerCase().includes('scheduled')) {
          status = 'entries';
        }

        // Clean event name
        const eventName = text
          .replace(/results?/gi, '')
          .replace(/live/gi, '')
          .replace(/entries/gi, '')
          .replace(/scheduled/gi, '')
          .replace(/in progress/gi, '')
          .replace(/\s+/g, ' ')
          .trim();

        if (eventName.length > 2) {
          eventList.push({
            name: eventName,
            url: href,
            status: status
          });
        }
      });

      // Remove duplicates
      const seen = new Set();
      return eventList.filter(e => {
        const key = e.name + e.url;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });

    console.log(`Found ${events.length} events`);
    return events;
  }

  /**
   * Scrape entries for a specific event (before meet starts)
   */
  async scrapeEntries(eventUrl) {
    if (!this.browser) await this.init();

    await this.page.goto(eventUrl, { waitUntil: 'networkidle2', timeout: this.timeout });
    await delay(3000);

    const entries = await this.page.evaluate(() => {
      const results = [];
      const pageText = document.body.innerText;
      const lines = pageText.split('\n').map(l => l.trim()).filter(l => l);

      // Try to find entries table or list
      // Format varies but usually: Name, Team/School, Seed Time

      // Method 1: Look for structured rows with double-space separation
      let inEntries = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Start of entries section
        if (line.match(/^(Entries|Seed|Start List)/i)) {
          inEntries = true;
          continue;
        }

        // End of entries
        if (inEntries && (line.match(/^(Results|Heat|Flight)/i) || line.length > 200)) {
          break;
        }

        if (inEntries) {
          // Try to parse entry line
          // Common format: "1  John Smith  University Name  10.50"
          const match = line.match(/^(\d+)?\s*([A-Za-z][A-Za-z\s,.''-]+?)\s{2,}([A-Za-z][A-Za-z\s.()'-]+?)\s{2,}([\d:.]+|NT|NM|NH)?/);

          if (match) {
            results.push({
              seed_rank: match[1] ? parseInt(match[1]) : null,
              athlete_name: match[2].trim(),
              team_name: match[3].trim(),
              seed_time: match[4] || null
            });
          }
        }
      }

      // Method 2: If no structured entries found, try DOM-based extraction
      if (results.length === 0) {
        const rows = document.querySelectorAll('tr, .entry-row, .athlete-row');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td, .cell');
          if (cells.length >= 2) {
            const text1 = cells[0]?.textContent.trim();
            const text2 = cells[1]?.textContent.trim();
            const text3 = cells[2]?.textContent.trim();

            // Skip header rows
            if (text1?.match(/^(Name|Athlete|#|Place)/i)) return;

            if (text1 && text2) {
              results.push({
                seed_rank: null,
                athlete_name: text1,
                team_name: text2,
                seed_time: text3 || null
              });
            }
          }
        });
      }

      return results;
    });

    return entries;
  }

  /**
   * Scrape live/final results for a specific event
   */
  async scrapeResults(eventUrl) {
    if (!this.browser) await this.init();

    await this.page.goto(eventUrl, { waitUntil: 'networkidle2', timeout: this.timeout });
    await delay(3000);

    const results = await this.page.evaluate(() => {
      const data = [];
      const pageText = document.body.innerText;

      // Get event name from page
      const h1 = document.querySelector('h1, .event-name, .event-title');
      const eventName = h1?.textContent.trim() || '';

      // Check if results are live or final
      const isLive = pageText.toLowerCase().includes('in progress') ||
                     pageText.toLowerCase().includes('live');
      const isFinal = pageText.toLowerCase().includes('final') ||
                      pageText.toLowerCase().includes('official');

      // Method 1: Parse from page text (most reliable for athletic.net)
      const lines = pageText.split('\n').map(l => l.trim()).filter(l => l);
      let inResults = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Start of results
        if (line.match(/^(Results|Place|Pos|All Results)/i) || line.includes('View:')) {
          inResults = true;
          continue;
        }

        // End of results
        if (inResults && (
          line.includes('Timed by') ||
          line.includes('Results last updated') ||
          line.match(/^(Heat|Flight|Entries)/i)
        )) {
          break;
        }

        if (inResults) {
          // Parse result line: "1  John Smith  University Name  10.50"
          const match = line.match(/^(\d+)\s{2,}([A-Za-z][A-Za-z\s,.''-]+?)\s{2,}([A-Za-z][A-Za-z\s.()'-]+?)\s{2,}([\d:.]+|DNF|DNS|DQ|FS|NT|NM|NH)/);

          if (match) {
            data.push({
              place: parseInt(match[1]),
              athlete_name: match[2].trim(),
              team_name: match[3].trim(),
              mark: match[4],
              is_live: isLive,
              is_final: isFinal
            });
          }
        }
      }

      // Method 2: Try DOM-based extraction if text parsing didn't work
      if (data.length === 0) {
        const rows = document.querySelectorAll('.results-table--row, tr.result-row, tr');
        rows.forEach(row => {
          const placeEl = row.querySelector('.place, .results-table--place, td:first-child');
          const place = parseInt(placeEl?.textContent.trim());

          if (!place || isNaN(place)) return;

          const cells = row.querySelectorAll('td, .cell');
          if (cells.length >= 3) {
            data.push({
              place: place,
              athlete_name: cells[1]?.textContent.trim() || '',
              team_name: cells[2]?.textContent.trim() || '',
              mark: cells[3]?.textContent.trim() || cells[cells.length - 1]?.textContent.trim() || '',
              is_live: isLive,
              is_final: isFinal
            });
          }
        });
      }

      return {
        event_name: eventName,
        is_live: isLive,
        is_final: isFinal,
        results: data
      };
    });

    return results;
  }

  /**
   * Scrape all events for a meet
   */
  async scrapeMeet(meetUrl, mode = 'results') {
    if (!this.browser) await this.init();

    const meetData = {
      meet_url: meetUrl,
      scraped_at: new Date().toISOString(),
      mode: mode,
      events: []
    };

    // Get meet name
    await this.page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: this.timeout });
    await delay(2000);

    meetData.meet_name = await this.page.evaluate(() => {
      const h1 = document.querySelector('h1, .meet-name, .meet-title');
      return h1?.textContent.trim() || document.title.split('|')[0].trim();
    });

    // Get all events
    const events = await this.getEvents(meetUrl);

    // Scrape each event
    for (const event of events) {
      console.log(`  Scraping: ${event.name}`);

      try {
        if (mode === 'entries') {
          const entries = await this.scrapeEntries(event.url);
          meetData.events.push({
            name: event.name,
            url: event.url,
            status: event.status,
            entries: entries
          });
        } else {
          const results = await this.scrapeResults(event.url);
          meetData.events.push({
            name: event.name,
            url: event.url,
            status: event.status,
            ...results
          });
        }
      } catch (e) {
        console.log(`    Error: ${e.message}`);
        meetData.events.push({
          name: event.name,
          url: event.url,
          status: 'error',
          error: e.message
        });
      }

      // Small delay between events
      await delay(500);
    }

    return meetData;
  }

  /**
   * Quick poll for live results (single event)
   * Used during live meet polling
   */
  async pollEvent(eventUrl) {
    if (!this.browser) await this.init();
    return await this.scrapeResults(eventUrl);
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const url = args[0];
  const mode = args[1] || 'results'; // entries, results, or live

  if (!url) {
    console.log('Usage: node athletic_net.js <meet-url> [mode]');
    console.log('  mode: entries | results | live');
    console.log('');
    console.log('Examples:');
    console.log('  node athletic_net.js https://live.athletic.net/meets/12345 entries');
    console.log('  node athletic_net.js https://live.jdlfasttrack.com/meets/54336 results');
    process.exit(1);
  }

  const scraper = new AthleticNetScraper({ headless: true });

  scraper.scrapeMeet(url, mode)
    .then(data => {
      console.log('\n' + '='.repeat(60));
      console.log(`Meet: ${data.meet_name}`);
      console.log(`Events: ${data.events.length}`);
      console.log(`Mode: ${data.mode}`);

      let totalResults = 0;
      data.events.forEach(e => {
        const count = e.entries?.length || e.results?.length || 0;
        totalResults += count;
        console.log(`  ${e.name}: ${count} ${mode === 'entries' ? 'entries' : 'results'}`);
      });

      console.log(`Total: ${totalResults}`);
      console.log('='.repeat(60));

      // Output JSON
      const fs = require('fs');
      const outFile = `athletic_net_${mode}_${Date.now()}.json`;
      fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
      console.log(`\nSaved to: ${outFile}`);
    })
    .catch(console.error)
    .finally(() => scraper.close());
}

module.exports = { AthleticNetScraper };
