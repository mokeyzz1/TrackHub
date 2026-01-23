// Discover ALL API endpoints by clicking every tab
const puppeteer = require('puppeteer');

async function discoverAllEndpoints(eventUrl) {
  console.log('🔬 Discovering ALL API Endpoints\n');
  console.log(`Event URL: ${eventUrl}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();

  // Intercept all network requests
  await page.setRequestInterception(true);
  const allApiCalls = [];

  page.on('request', req => {
    const url = req.url();
    if (url.includes('athleticlive.blob.core.windows.net')) {
      allApiCalls.push({
        url: url,
        timestamp: Date.now()
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

  const initialCallCount = allApiCalls.length;
  console.log(`Initial API calls on page load: ${initialCallCount}`);
  allApiCalls.forEach(call => {
    const parts = call.url.split('/$web/')[1].split('/_doc/');
    console.log(`  ${parts[0]} -> ${parts[1]}`);
  });

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

  // Click through each tab
  for (const tabName of tabs) {
    console.log(`\n=== Clicking: ${tabName} ===`);

    const beforeCount = allApiCalls.length;

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
      await new Promise(resolve => setTimeout(resolve, 4000));

      const newCalls = allApiCalls.slice(beforeCount);

      if (newCalls.length > 0) {
        console.log(`✅ ${newCalls.length} new API call(s):`);
        newCalls.forEach(call => {
          const parts = call.url.split('/$web/')[1].split('/_doc/');
          console.log(`   ${parts[0]} -> ${parts[1]}`);
          endpointMap[tabName] = call.url;
        });
      } else {
        console.log('❌ No new API calls');
        endpointMap[tabName] = 'NO_API';
      }
    } else {
      console.log('❌ Failed to click tab');
    }
  }

  await browser.close();

  // Extract endpoint patterns
  console.log('\n\n📊 API ENDPOINT SUMMARY:\n');

  const endpoints = {};
  Object.entries(endpointMap).forEach(([tab, url]) => {
    if (url !== 'NO_API') {
      const parts = url.split('/$web/')[1].split('/_doc/');
      const endpoint = parts[0];
      endpoints[tab] = endpoint;
      console.log(`${tab}:`);
      console.log(`  Endpoint: ${endpoint}`);
      console.log(`  Full URL: ${url}\n`);
    }
  });

  return endpoints;
}

if (require.main === module) {
  const eventUrl = process.argv[2] || 'https://results.blacksquirreltiming.com/meets/59182/events/individual/2180795';

  discoverAllEndpoints(eventUrl)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Error:', err.message);
      process.exit(1);
    });
}

module.exports = { discoverAllEndpoints };
