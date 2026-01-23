// Athletic.net Live Results Scraper
// Works for athletic.net, blacksquirreltiming, and other athletic.net-powered platforms

const puppeteer = require('puppeteer');
const fs = require('fs');

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

  // Wait for Angular to render
  await new Promise(resolve => setTimeout(resolve, 8000));

  // Get all event links
  const eventLinks = await page.evaluate(() => {
    const links = [];
    document.querySelectorAll('a').forEach(a => {
      const text = a.textContent.trim();
      const href = a.href;

      // Look for event links (contain "Results" or "Scheduled")
      if ((text.includes('Results') || text.includes('Scheduled') || text.includes('Entries')) &&
          (href.includes('/event/') || href.includes('/events/'))) {
        // Extract clean event name
        const eventName = text
          .replace(/Results?/gi, '')
          .replace(/Scheduled?/gi, '')
          .replace(/Entries?/gi, '')
          .replace(/\s{2,}/g, ' ')
          .trim();

        if (eventName.length > 3) {
          links.push({
            name: eventName,
            url: href,
            status: text.includes('Results') ? 'results' :
                   text.includes('Entries') ? 'entries' : 'scheduled'
          });
        }
      }
    });
    return links;
  });

  console.log(`📋 Found ${eventLinks.length} events\n`);

  const meetData = {
    meetUrl: meetUrl,
    scrapedAt: new Date().toISOString(),
    events: []
  };

  // Scrape each event
  for (const eventLink of eventLinks) {
    console.log(`  Processing: ${eventLink.name}`);

    await page.goto(eventLink.url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Extract results from the page text
    const eventResults = await page.evaluate(() => {
      const pageText = document.body.textContent;
      const results = [];

      // Split into lines
      const lines = pageText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      let inResults = false;
      let eventName = '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Detect event name from title
        if (line.includes('Results') && !eventName) {
          eventName = line.replace(/Results?/gi, '').trim();
        }

        // Start of results section
        if (line.includes('View:') || line.match(/^All Results/i)) {
          inResults = true;
          continue;
        }

        // End of results
        if (line.includes('Timed by') ||
            line.includes('FilterSchedule') ||
            line.includes('Features') ||
            line.includes('Results last updated')) {
          break;
        }

        // Parse result lines
        // Format: "1  Adrianna Rodencal  Concordia (Neb.) 8.43NAIA AUTO..."
        if (inResults && line.match(/^(\d+)\s{2}/)) {
          const placeMatch = line.match(/^(\d+)\s{2,}(.+)/);

          if (placeMatch) {
            const place = parseInt(placeMatch[1]);
            const rest = placeMatch[2];

            // Split by double-spaces to get parts
            const parts = rest.split(/\s{2,}/);

            if (parts.length >= 2) {
              const athleteName = parts[0].trim();
              const schoolAndMark = parts[1];

              // Extract school (in parentheses) and mark (number at start)
              // Format: "Concordia (Neb.) 8.43NAIA AUTO..."
              const schoolMatch = schoolAndMark.match(/^(.+?)\s*\(([^)]+)\)\s*([\d:.]+)/);

              let school = null;
              let mark = null;

              if (schoolMatch) {
                school = schoolMatch[2].trim();  // Text inside parentheses
                mark = schoolMatch[3];
              } else {
                // Fallback: school might not have parentheses, or format is different
                const words = schoolAndMark.split(/\s+/);
                school = words[0];
                mark = words.find(w => w.match(/^[\d:.]+$/));
              }

              results.push({
                place: place,
                athlete: athleteName,
                school: school,
                mark: mark
              });
            }
          }
        }
      }

      return {
        eventName: eventName,
        results: results
      };
    });

    console.log(`    ✅ ${eventResults.results.length} results\n`);

    meetData.events.push({
      name: eventLink.name,
      status: eventLink.status,
      url: eventLink.url,
      results: eventResults.results
    });

    // Small delay
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  await browser.close();

  // Save to JSON file
  fs.writeFileSync(outputFile, JSON.stringify(meetData, null, 2));

  console.log(`\n✅ COMPLETE!`);
  console.log(`📊 Scraped ${meetData.events.length} events`);
  console.log(`💾 Saved to ${outputFile}\n`);

  return meetData;
}

// Run if called directly
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
