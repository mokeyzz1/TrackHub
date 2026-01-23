// Script to analyze AthleticLIVE page and find API endpoints
const puppeteer = require('puppeteer');

async function analyzeLiveMeet(meetUrl) {
  console.log(`Analyzing: ${meetUrl}\n`);

  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Track all network requests
  const apiCalls = [];

  page.on('request', request => {
    const url = request.url();
    if (url.includes('api') || url.includes('json') || url.includes('data')) {
      console.log('📡 REQUEST:', request.method(), url);
      apiCalls.push({
        method: request.method(),
        url: url,
        type: 'request'
      });
    }
  });

  page.on('response', async response => {
    const url = response.url();
    if (url.includes('api') || url.includes('json') || url.includes('data')) {
      console.log('📥 RESPONSE:', response.status(), url);

      try {
        const contentType = response.headers()['content-type'];
        if (contentType && contentType.includes('json')) {
          const data = await response.json();
          console.log('   JSON DATA PREVIEW:', JSON.stringify(data).substring(0, 200));
          apiCalls.push({
            url: url,
            status: response.status(),
            contentType: contentType,
            dataPreview: JSON.stringify(data).substring(0, 500),
            type: 'response'
          });
        }
      } catch (e) {
        // Not JSON or error parsing
      }
    }
  });

  // Navigate to the page
  await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

  console.log('\nPage loaded. Waiting 10 seconds for results data to load...\n');
  await new Promise(resolve => setTimeout(resolve, 10000));

  console.log('Scrolling page to trigger any lazy-loaded content...\n');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  console.log('Waiting another 10 seconds...\n');
  await new Promise(resolve => setTimeout(resolve, 10000));

  console.log('\n\n=== SUMMARY ===');
  console.log(`Found ${apiCalls.length} API-related calls\n`);

  // Group by endpoint pattern
  const endpoints = {};
  apiCalls.forEach(call => {
    const baseUrl = call.url.split('?')[0];
    if (!endpoints[baseUrl]) {
      endpoints[baseUrl] = [];
    }
    endpoints[baseUrl].push(call);
  });

  console.log('Unique endpoints:');
  Object.keys(endpoints).forEach(endpoint => {
    console.log(`\n${endpoint}`);
    console.log(`  Called ${endpoints[endpoint].length} times`);
    const sample = endpoints[endpoint].find(c => c.dataPreview);
    if (sample) {
      console.log(`  Sample data: ${sample.dataPreview}`);
    }
  });

  await browser.close();

  return endpoints;
}

// Run it
const meetUrl = process.argv[2] || 'https://live.jdlfasttrack.com/meets/54336';
analyzeLiveMeet(meetUrl).catch(console.error);
