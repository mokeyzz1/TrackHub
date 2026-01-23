// Live meet results scraper for AthleticLIVE
const puppeteer = require('puppeteer');

async function scrapeLiveMeet(meetUrl) {
  console.log(`🏃 Scraping live meet: ${meetUrl}\n`);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Extract structured results
  const meetData = await page.evaluate(() => {
    const results = [];

    // Find all result rows (teams/athletes)
    const rows = document.querySelectorAll('.results-table--row');

    rows.forEach(row => {
      try {
        const placeEl = row.querySelector('.results-table--place');
        const containerTop = row.querySelector('.results-table--container--top');

        if (placeEl && containerTop) {
          const place = placeEl.textContent.trim();

          // Get all text from container, then extract team name and times
          const fullText = containerTop.textContent.trim();

          // Split by whitespace and filter out the place number
          const parts = fullText.split(/\s+/).filter(p => p && p !== place);

          // Times are usually at the end (format: MM:SS.SS or SS.SS)
          const timeRegex = /^\d+:\d+\.\d+$|^\d+\.\d+$/;
          const times = parts.filter(p => timeRegex.test(p));

          // Team name is everything before the times
          const teamParts = [];
          for (let i = 0; i < parts.length; i++) {
            if (!timeRegex.test(parts[i])) {
              teamParts.push(parts[i]);
            } else {
              break;
            }
          }

          const teamName = teamParts.join(' ');
          const primaryTime = times[0] || 'In Progress';

          results.push({
            place: place,
            name: teamName,
            time: primaryTime,
            splits: times.slice(1), // Additional split times if available
            timestamp: new Date().toISOString()
          });
        }
      } catch (e) {
        // Skip malformed rows
      }
    });

    // Get event info from the page
    // Event name is typically in the body text structure
    const bodyText = document.body.innerText;
    const eventMatch = bodyText.match(/(Boys|Girls|Men|Women)\s+[^\n]+?m/);
    const eventName = eventMatch ? eventMatch[0] : 'Unknown Event';

    // Meet name from page title or header
    const meetName = document.querySelector('h1')?.textContent.trim() ||
                     bodyText.split('\n')[0] ||
                     'Unknown Meet';

    return {
      meetName,
      eventName,
      results,
      scrapedAt: new Date().toISOString(),
      totalResults: results.length
    };
  });

  await browser.close();

  console.log('\n📊 SCRAPED RESULTS:\n');
  console.log(`Meet: ${meetData.meetName}`);
  console.log(`Event: ${meetData.eventName}`);
  console.log(`Results: ${meetData.totalResults}\n`);

  meetData.results.slice(0, 10).forEach(result => {
    console.log(`${result.place}. ${result.name} - ${result.time}`);
  });

  return meetData;
}

// Run it
const meetUrl = process.argv[2] || 'https://live.jdlfasttrack.com/meets/54336/live/track/track';

scrapeLiveMeet(meetUrl)
  .then(data => {
    console.log('\n\n✅ Scraping complete! Ready to push to Supabase.');
    console.log(`Total results scraped: ${data.totalResults}`);
  })
  .catch(console.error);
