// Test ALL Athletic.net API endpoints by clicking through tabs
const puppeteer = require('puppeteer');
const fs = require('fs');

async function testAllEndpoints(eventUrl) {
  console.log('🔬 Testing Athletic.net API Endpoints\n');
  console.log(`Event URL: ${eventUrl}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();

  // Intercept all network requests
  await page.setRequestInterception(true);
  const apiRequests = [];

  page.on('request', req => {
    const url = req.url();

    // Track API calls to Azure Blob Storage
    if (url.includes('athleticlive.blob.core.windows.net')) {
      apiRequests.push({
        url: url,
        method: req.method()
      });
    }

    req.continue();
  });

  console.log('Loading event page...\n');
  await page.goto(eventUrl, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('Initial API requests:', apiRequests.length);
  apiRequests.forEach(r => console.log(`  ${r.method} ${r.url}`));

  // Find all tabs
  const tabs = await page.evaluate(() => {
    const found = [];
    document.querySelectorAll('a, button').forEach(el => {
      const text = el.textContent.trim();
      if (text.match(/^(Results?|Splits?|Entries?|Start Lists?|Records?)$/i)) {
        found.push(text);
      }
    });
    return [...new Set(found)];
  });

  console.log(`\n📑 Found tabs: ${tabs.join(', ')}\n`);

  const endpointMap = {};

  // Click through each tab and see what API calls are made
  for (const tabName of tabs) {
    console.log(`\n=== Clicking: ${tabName} ===`);

    const beforeCount = apiRequests.length;

    const clicked = await page.evaluate((name) => {
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
      // Wait for any API calls to complete
      await new Promise(resolve => setTimeout(resolve, 4000));

      const newRequests = apiRequests.slice(beforeCount);

      if (newRequests.length > 0) {
        console.log(`✅ ${newRequests.length} new API request(s):`);
        newRequests.forEach(r => {
          console.log(`   ${r.method} ${r.url}`);
          endpointMap[tabName] = r.url;
        });
      } else {
        console.log('❌ No new API requests (data already in DOM)');
        endpointMap[tabName] = 'DOM_ONLY';
      }

      // Check if data is visible in DOM
      const rowCount = await page.evaluate(() => {
        return document.querySelectorAll('.results-table--row').length;
      });

      console.log(`   DOM rows visible: ${rowCount}`);
    }
  }

  await browser.close();

  console.log('\n\n📊 ENDPOINT SUMMARY:\n');
  Object.entries(endpointMap).forEach(([tab, endpoint]) => {
    console.log(`${tab}:`);
    if (endpoint === 'DOM_ONLY') {
      console.log(`  ❌ No API - scrape DOM directly`);
    } else {
      console.log(`  ✅ ${endpoint}`);
    }
    console.log('');
  });

  // Save endpoint map
  fs.writeFileSync('api_endpoint_map.json', JSON.stringify(endpointMap, null, 2));
  console.log('💾 Saved to api_endpoint_map.json\n');

  return endpointMap;
}

if (require.main === module) {
  const eventUrl = process.argv[2] || 'https://results.blacksquirreltiming.com/meets/59182/events/individual/2180795';

  testAllEndpoints(eventUrl)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Error:', err.message);
      process.exit(1);
    });
}

module.exports = { testAllEndpoints };
