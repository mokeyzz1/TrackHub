// Improved Athletic.net Web Crawler - Gets EVERYTHING from a meet
const puppeteer = require('puppeteer');
const fs = require('fs');

function parseResultRow(rawText) {
  // Format: "1  Adrianna Rodencal  Concordia (Neb.) 8.43NAIA AUTO..."
  const match = rawText.match(/^(\d+)\s{2,}([^]+?)\s{2,}(.+?)\s*\(([^)]+)\)\s*([\d:.]+)/);
  if (match) {
    return {
      place: parseInt(match[1]),
      athlete: match[2].trim(),
      school: match[4].trim(),
      mark: match[5]
    };
  }

  // Fallback pattern without parentheses
  const match2 = rawText.match(/^(\d+)\s{2,}([^]+?)\s{2,}(\S+)\s+([\d:.]+)/);
  if (match2) {
    return {
      place: parseInt(match2[1]),
      athlete: match2[2].trim(),
      school: match2[3].trim(),
      mark: match2[4]
    };
  }

  return null;
}

async function crawlAthleticNetMeet(meetUrl, outputFile = 'crawled_meet_data.json') {
  console.log('🕷️  Athletic.net Web Crawler v2\n');
  console.log(`URL: ${meetUrl}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-images',
      '--disable-css'
    ]
  });

  const page = await browser.newPage();

  console.log('🌐 Loading meet page...\n');
  await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Find ALL schedule filter buttons
  const filterButtons = await page.evaluate(() => {
    const buttons = [];
    document.querySelectorAll('button').forEach(btn => {
      const text = btn.textContent.trim();
      if (text.match(/Multis|Field Events|Running Events|Day \d/i) && text.length < 50) {
        buttons.push(text);
      }
    });
    return buttons;
  });

  console.log(`🔍 Found ${filterButtons.length} schedule filters:`);
  filterButtons.forEach(b => console.log(`   - ${b}`));
  console.log('');

  const allEventLinks = new Map();

  const getEventLinks = async () => {
    return await page.evaluate(() => {
      const links = [];
      document.querySelectorAll('a').forEach(a => {
        const text = a.textContent.trim();
        const href = a.href;

        if ((text.includes('Results') || text.includes('Scheduled') || text.includes('Entries')) &&
            href.includes('/events/')) {
          const eventName = text
            .replace(/Results?/gi, '')
            .replace(/Scheduled?/gi, '')
            .replace(/Entries?/gi, '')
            .trim();

          if (eventName.length > 3) {
            links.push({
              name: eventName,
              url: href
            });
          }
        }
      });
      return links;
    });
  };

  // Click through each schedule filter
  for (const filterName of filterButtons) {
    console.log(`📋 Clicking filter: ${filterName}`);

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
      const events = await getEventLinks();
      console.log(`   Found ${events.length} events`);
      events.forEach(event => allEventLinks.set(event.url, event));
    }
  }

  const uniqueEvents = Array.from(allEventLinks.values());
  console.log(`\n📊 Total unique events: ${uniqueEvents.length}\n`);

  const meetData = {
    meetUrl: meetUrl,
    scrapedAt: new Date().toISOString(),
    events: []
  };

  // Crawl each event deeply - create NEW page for each event to avoid detached frame errors
  for (let i = 0; i < uniqueEvents.length; i++) {
    const eventLink = uniqueEvents[i];
    console.log(`\n📍 [${i+1}/${uniqueEvents.length}] ${eventLink.name}`);

    const eventData = {
      name: eventLink.name,
      url: eventLink.url,
      results: [],
      splits: [],
      entries: [],
      startLists: [],
      records: []
    };

    try {
      // Create a new page for each event to avoid frame detachment issues
      const eventPage = await browser.newPage();

      await eventPage.goto(eventLink.url, { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Find all tabs within this event page
      const eventTabs = await eventPage.evaluate(() => {
        const tabs = [];
        document.querySelectorAll('a, button').forEach(el => {
          const text = el.textContent.trim();
          if (text.match(/^(Results?|Splits?|Entries?|Start Lists?|Records?)$/i)) {
            tabs.push(text);
          }
        });
        return [...new Set(tabs)];
      });

      console.log(`   Tabs found: ${eventTabs.join(', ')}`);

      // Click through each tab
      for (const tabName of eventTabs) {
        console.log(`   📑 Scraping: ${tabName}`);

        try {
          const clicked = await eventPage.evaluate((name) => {
            const elements = Array.from(document.querySelectorAll('a, button'));
            const tab = elements.find(el => {
              const text = el.textContent.trim();
              return text.toLowerCase() === name.toLowerCase();
            });
            if (tab) {
              tab.click();
              return true;
            }
            return false;
          }, tabName);

          if (clicked) {
            // Wait longer for content to load after tab click
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Scrape data from current tab
            const tabData = await eventPage.evaluate(() => {
              const rows = document.querySelectorAll('.results-table--row');
              const data = [];

              rows.forEach(row => {
                const text = row.textContent.trim();
                if (text) {
                  data.push(text);
                }
              });

              return data;
            });

            // Store in appropriate category
            if (tabName.toLowerCase().includes('result')) {
              const parsed = tabData.map(parseResultRow).filter(r => r !== null);
              eventData.results = parsed;
              console.log(`      ✅ ${parsed.length} results`);
            } else if (tabName.toLowerCase().includes('split')) {
              eventData.splits = tabData;
              console.log(`      ✅ ${tabData.length} split entries`);
            } else if (tabName.toLowerCase().includes('entries') || tabName.toLowerCase().includes('entry')) {
              eventData.entries = tabData;
              console.log(`      ✅ ${tabData.length} entries`);
            } else if (tabName.toLowerCase().includes('start')) {
              eventData.startLists = tabData;
              console.log(`      ✅ ${tabData.length} start list entries`);
            } else if (tabName.toLowerCase().includes('record')) {
              eventData.records = tabData;
              console.log(`      ✅ ${tabData.length} records`);
            }
          }
        } catch (tabError) {
          console.log(`      ❌ Tab error: ${tabError.message}`);
        }
      }

      await eventPage.close();

    } catch (error) {
      console.log(`   ❌ Event error: ${error.message}`);
    }

    meetData.events.push(eventData);

    // Save progress every 10 events
    if (meetData.events.length % 10 === 0) {
      fs.writeFileSync(outputFile, JSON.stringify(meetData, null, 2));
      console.log(`   💾 Progress saved (${meetData.events.length} events)`);
    }
  }

  await browser.close();

  fs.writeFileSync(outputFile, JSON.stringify(meetData, null, 2));

  console.log(`\n\n✅ CRAWLING COMPLETE!`);
  console.log(`📊 Events crawled: ${meetData.events.length}`);
  console.log(`📊 Total results: ${meetData.events.reduce((sum, e) => sum + e.results.length, 0)}`);
  console.log(`📊 Total entries: ${meetData.events.reduce((sum, e) => sum + e.entries.length, 0)}`);
  console.log(`📊 Total splits: ${meetData.events.reduce((sum, e) => sum + e.splits.length, 0)}`);
  console.log(`📊 Total start lists: ${meetData.events.reduce((sum, e) => sum + e.startLists.length, 0)}`);
  console.log(`📊 Total records: ${meetData.events.reduce((sum, e) => sum + e.records.length, 0)}`);
  console.log(`💾 Saved to ${outputFile}\n`);

  return meetData;
}

if (require.main === module) {
  const meetUrl = process.argv[2] || 'https://results.blacksquirreltiming.com/meets/59182';
  const outputFile = process.argv[3] || 'crawled_meet_data_v2.json';

  crawlAthleticNetMeet(meetUrl, outputFile)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Error:', err.message);
      process.exit(1);
    });
}

module.exports = { crawlAthleticNetMeet };
