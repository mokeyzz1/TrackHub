// Simple Athletic.net scraper using DOM selectors
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

  // Fallback for schools without parentheses
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

async function scrapeAthleticNetMeet(meetUrl, outputFile = 'athletic_results.json') {
  console.log('🏃 Athletic.net Results Scraper\n');
  console.log(`URL: ${meetUrl}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  console.log('🌐 Loading meet page...\n');
  await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 8000));

  // Function to get event links from current view
  const getEventLinks = async () => {
    return await page.evaluate(() => {
      const links = [];
      document.querySelectorAll('a').forEach(a => {
        const text = a.textContent.trim();
        const href = a.href;

        if ((text.includes('Results') || text.includes('Scheduled')) &&
            href.includes('/events/')) {
          const eventName = text
            .replace(/Results?/gi, '')
            .replace(/Scheduled?/gi, '')
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

  // Get Day 1 events
  let eventLinks = await getEventLinks();
  console.log(`📋 Day 1: Found ${eventLinks.length} events`);

  // Check for Day 2 button and click it
  const hasDay2 = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const day2Button = buttons.find(b => b.textContent.trim().match(/Day 2|Multis - Day 2/i));
    if (day2Button) {
      day2Button.click();
      return true;
    }
    return false;
  });

  if (hasDay2) {
    console.log('📋 Clicking Day 2 tab...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    const day2Events = await getEventLinks();
    console.log(`📋 Day 2: Found ${day2Events.length} events`);

    // Combine both days
    eventLinks = [...eventLinks, ...day2Events];
  }

  console.log(`📋 Total: ${eventLinks.length} events\n`);

  const meetData = {
    meetUrl: meetUrl,
    scrapedAt: new Date().toISOString(),
    events: []
  };

  for (const eventLink of eventLinks) {
    console.log(`  ${eventLink.name}`);

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
  }

  await browser.close();

  fs.writeFileSync(outputFile, JSON.stringify(meetData, null, 2));

  console.log(`\n✅ COMPLETE!`);
  console.log(`📊 Scraped ${meetData.events.length} events`);
  console.log(`💾 Saved to ${outputFile}\n`);

  return meetData;
}

if (require.main === module) {
  const meetUrl = process.argv[2] || 'https://results.blacksquirreltiming.com/meets/59182';
  const outputFile = process.argv[3] || 'athletic_results.json';

  scrapeAthleticNetMeet(meetUrl, outputFile)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Error:', err.message);
      process.exit(1);
    });
}

module.exports = { scrapeAthleticNetMeet };
