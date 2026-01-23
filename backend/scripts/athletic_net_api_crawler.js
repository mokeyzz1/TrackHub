// Athletic.net API Crawler - Hybrid Approach
// Uses Puppeteer for event discovery + Direct API calls for data fetching

const puppeteer = require('puppeteer');
const https = require('https');
const fs = require('fs');

/**
 * Fetch JSON data from Athletic.net API
 */
async function fetchAPI(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}`));
          }
        } else if (res.statusCode === 404) {
          resolve(null); // Data not available (e.g., no splits)
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Discover all events by clicking through schedule filters
 */
async function discoverEvents(page, meetUrl) {
  console.log('Loading meet homepage...');
  await page.goto(meetUrl, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Find all schedule filter buttons
  const filterButtons = await page.evaluate(() => {
    const buttons = [];
    document.querySelectorAll('button').forEach(btn => {
      const text = btn.textContent.trim();
      // Match: Multis, Field Events, Running Events, Day 1/2/3, etc.
      if (text.match(/Multis|Field Events|Running Events|Day \d/i) && text.length < 50) {
        buttons.push(text);
      }
    });
    return buttons;
  });

  console.log(`Found ${filterButtons.length} schedule filters: ${filterButtons.join(', ')}\n`);

  const allEventLinks = new Map(); // Deduplicate by URL

  // Click through each filter and collect events
  for (const filterName of filterButtons) {
    console.log(`Clicking filter: "${filterName}"...`);

    const clicked = await page.evaluate((name) => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const button = buttons.find(b => b.textContent.trim() === name);
      if (button) {
        button.click();
        return true;
      }
      return false;
    }, filterName);

    if (clicked) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get event links visible after clicking this filter
      const events = await page.evaluate(() => {
        const links = [];
        document.querySelectorAll('a[href*="/events/individual/"]').forEach(link => {
          links.push({
            name: link.textContent.trim(),
            url: link.href
          });
        });
        return links;
      });

      events.forEach(event => {
        allEventLinks.set(event.url, event);
      });

      console.log(`  Found ${events.length} events in this filter`);
    }
  }

  const uniqueEvents = Array.from(allEventLinks.values());
  console.log(`\nTotal unique events discovered: ${uniqueEvents.length}\n`);

  return uniqueEvents;
}

/**
 * Extract meetId and eventId from event URL
 */
function parseEventUrl(url) {
  const match = url.match(/meets\/(\d+)\/events\/individual\/(\d+)/);
  if (match) {
    return {
      meetId: match[1],
      eventId: match[2]
    };
  }
  return null;
}

/**
 * Fetch all data for a single event
 */
async function fetchEventData(eventId, eventName, eventUrl) {
  console.log(`Fetching data for: ${eventName}`);

  const baseUrl = 'https://athleticlive.blob.core.windows.net/$web';

  // Fetch Results, Entries, Heat/Start Lists, Splits (if available)
  const [results, entries, heats, splits] = await Promise.all([
    fetchAPI(`${baseUrl}/ind_res_list/_doc/${eventId}`),
    fetchAPI(`${baseUrl}/ind_ent_list/_doc/${eventId}`),
    fetchAPI(`${baseUrl}/ind_heat_list/_doc/${eventId}`),
    fetchAPI(`${baseUrl}/run_split_report/_doc/IRSR%7C${eventId}`)
  ]);

  return {
    eventId,
    name: eventName,
    url: eventUrl,
    results: results?._source || null,
    entries: entries?._source || null,
    heats: heats?._source || null,
    splits: splits?._source || null
  };
}

/**
 * Main crawler function
 */
async function crawlMeet(meetUrl) {
  console.log('=== Athletic.net API Crawler ===\n');
  console.log(`Meet URL: ${meetUrl}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();

  try {
    // Step 1: Discover all events
    const events = await discoverEvents(page, meetUrl);

    if (events.length === 0) {
      throw new Error('No events found!');
    }

    // Extract meetId from first event
    const firstEvent = parseEventUrl(events[0].url);
    if (!firstEvent) {
      throw new Error('Could not parse event URL');
    }
    const meetId = firstEvent.meetId;

    await browser.close();

    // Step 2: Fetch meet records
    console.log('Fetching meet records...\n');
    const baseUrl = 'https://athleticlive.blob.core.windows.net/$web';
    const records = await fetchAPI(`${baseUrl}/record_report/_doc/records%7C${meetId}`);

    // Step 3: Fetch data for all events (parallel API calls)
    console.log('Fetching event data...\n');
    const eventDataPromises = events.map(event => {
      const parsed = parseEventUrl(event.url);
      if (parsed) {
        return fetchEventData(parsed.eventId, event.name, event.url);
      }
      return null;
    });

    const eventData = await Promise.all(eventDataPromises);
    const validEventData = eventData.filter(e => e !== null);

    // Step 4: Compile final output
    const output = {
      meetUrl,
      meetId,
      scrapedAt: new Date().toISOString(),
      totalEvents: validEventData.length,
      records: records?._source || null,
      events: validEventData
    };

    // Step 5: Generate statistics
    const stats = {
      eventsWithResults: validEventData.filter(e => e.results !== null).length,
      eventsWithEntries: validEventData.filter(e => e.entries !== null).length,
      eventsWithHeats: validEventData.filter(e => e.heats !== null).length,
      eventsWithSplits: validEventData.filter(e => e.splits !== null).length
    };

    console.log('\n=== Crawl Complete ===\n');
    console.log(`Total events: ${output.totalEvents}`);
    console.log(`Events with results: ${stats.eventsWithResults}`);
    console.log(`Events with entries: ${stats.eventsWithEntries}`);
    console.log(`Events with heats: ${stats.eventsWithHeats}`);
    console.log(`Events with splits: ${stats.eventsWithSplits}`);
    console.log(`Meet records: ${records ? 'Available' : 'Not available'}\n`);

    return output;

  } catch (error) {
    await browser.close();
    throw error;
  }
}

// Main execution
if (require.main === module) {
  const meetUrl = process.argv[2];

  if (!meetUrl) {
    console.error('Usage: node athletic_net_api_crawler.js <meet-url>');
    console.error('Example: node athletic_net_api_crawler.js https://results.blacksquirreltiming.com/meets/59182');
    process.exit(1);
  }

  crawlMeet(meetUrl)
    .then(data => {
      const outputFile = 'athletic_net_complete_data.json';
      fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
      console.log(`\n✅ Data saved to ${outputFile}`);
    })
    .catch(err => {
      console.error('\n❌ Error:', err.message);
      process.exit(1);
    });
}

module.exports = { crawlMeet };
