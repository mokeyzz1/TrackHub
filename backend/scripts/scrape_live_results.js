// Simple HTML scraper for AthleticLIVE results
const puppeteer = require('puppeteer');

async function scrapeLiveResults(meetUrl) {
  console.log(`Scraping live results from: ${meetUrl}\n`);

  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

  console.log('Page loaded. Waiting for results to render...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Extract all visible results from the page
  const results = await page.evaluate(() => {
    const data = [];

    // Look for common result table/list patterns
    // Try to find athlete names, times, places
    const resultElements = document.querySelectorAll('[class*="result"], [class*="athlete"], [class*="performance"]');

    resultElements.forEach(el => {
      const text = el.textContent.trim();
      if (text.length > 0 && text.length < 500) {
        data.push({
          html: el.outerHTML.substring(0, 200),
          text: text.substring(0, 100),
          classes: el.className
        });
      }
    });

    // Also try to get the page structure
    const bodyText = document.body.innerText;

    return {
      foundElements: data.length,
      sampleElements: data.slice(0, 5),
      pageText: bodyText.substring(0, 2000)
    };
  });

  console.log('=== SCRAPED DATA ===\n');
  console.log(`Found ${results.foundElements} potential result elements\n`);

  console.log('Sample elements:');
  results.sampleElements.forEach((el, i) => {
    console.log(`\n${i + 1}. Class: ${el.classes}`);
    console.log(`   Text: ${el.text}`);
  });

  console.log('\n\n=== PAGE TEXT PREVIEW ===');
  console.log(results.pageText);

  await browser.close();
  return results;
}

// Run it
const meetUrl = process.argv[2] || 'https://live.jdlfasttrack.com/meets/54336/live/track/track';
scrapeLiveResults(meetUrl).catch(console.error);
