// Complete Athletic.net scraper - clicks through ALL filters
const puppeteer = require('puppeteer');
const fs = require('fs');

function parseResultRow(rawText) {
  const match = rawText.match(/^(\d+)\s{2,}([^]+?)\s{2,}(.+?)\s*\(([^)]+)\)\s*([\d:.]+)/);
  if (match) {
    return {
      place: parseInt(match[1]),
      athlete: match[2].trim(),
      school: match[4].trim(),
      mark: match[5]
    };
  }

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

async function scrapeAthleticNetMeet(meetUrl, outputFile = 'complete_meet_results.json') {
  console.log('🏃 Complete Athletic.net Results Scraper\n');
  console.log(`URL: ${meetUrl}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  console.log('🌐 Loading meet page...\n');
  await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 8000));

  // Find ALL filter buttons
  const filterButtons = await page.evaluate(() => {
    const buttons = [];
    document.querySelectorAll('button').forEach(btn => {
      const text = btn.textContent.trim();
      // Look for schedule/category filter buttons
      if (text.match(/Multis|Field Events|Running Events|Day \d/i) && text.length < 50) {
        buttons.push(text);
      }
    });
    return buttons;
  });

  console.log(`🔍 Found ${filterButtons.length} filter buttons:`);
  filterButtons.forEach(b => console.log(`   - ${b}`));
  console.log('');

  const allEventLinks = new Map(); // Use Map to deduplicate by URL

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

  // Click through each filter and collect events
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
      console.log(`   Found ${events.length} events in this filter`);

      events.forEach(event => {
        allEventLinks.set(event.url, event);
      });
    }
  }

  const uniqueEvents = Array.from(allEventLinks.values());
  console.log(`\n📊 Total unique events found: ${uniqueEvents.length}\n`);

  const meetData = {
    meetUrl: meetUrl,
    scrapedAt: new Date().toISOString(),
    events: []
  };

  // Scrape each event
  for (const eventLink of uniqueEvents) {
    console.log(`  ${eventLink.name}`);

    try {
      await page.goto(eventLink.url, { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise(resolve => setTimeout(resolve, 5000));

      const rawResults = await page.evaluate(() => {
        const rows = document.querySelectorAll('.results-table--row');
        const results = [];

        rows.forEach(row => {
          const text = row.textContent.trim();
          if (text) {
            results.push(text);
          }
        });

        return results;
      });

      const parsed = rawResults.map(parseResultRow).filter(r => r !== null);

      console.log(`    ✅ ${parsed.length} results\n`);

      meetData.events.push({
        name: eventLink.name,
        url: eventLink.url,
        results: parsed
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.log(`    ❌ Error: ${error.message}\n`);
      // Continue with next event
    }
  }

  // Save progress even if some events failed
  fs.writeFileSync(outputFile, JSON.stringify(meetData, null, 2));
  console.log(`💾 Progress saved to ${outputFile}\n`);

  await browser.close();

  fs.writeFileSync(outputFile, JSON.stringify(meetData, null, 2));

  console.log(`\n✅ COMPLETE!`);
  console.log(`📊 Scraped ${meetData.events.length} events`);
  console.log(`📊 Total results: ${meetData.events.reduce((sum, e) => sum + e.results.length, 0)}`);
  console.log(`💾 Saved to ${outputFile}\n`);

  return meetData;
}

if (require.main === module) {
  const meetUrl = process.argv[2] || 'https://results.blacksquirreltiming.com/meets/59182';
  const outputFile = process.argv[3] || 'complete_meet_results.json';

  scrapeAthleticNetMeet(meetUrl, outputFile)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Error:', err.message);
      process.exit(1);
    });
}

module.exports = { scrapeAthleticNetMeet };
