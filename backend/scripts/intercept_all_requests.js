// AGGRESSIVE request interceptor - catch EVERYTHING
const puppeteer = require('puppeteer');
const fs = require('fs');

async function interceptEverything(meetUrl) {
  console.log(`🎯 AGGRESSIVE INTERCEPTION: ${meetUrl}\n`);

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process']
  });

  const page = await browser.newPage();

  // CAPTURE EVERYTHING
  const allTraffic = [];

  // Method 1: CDP (Chrome DevTools Protocol) - lowest level
  const client = await page.target().createCDPSession();
  await client.send('Network.enable');

  client.on('Network.requestWillBeSent', (params) => {
    if (params.request.url.includes('athletic') || params.request.url.includes('meet') || params.request.url.includes('result')) {
      console.log(`\n🌐 CDP REQUEST: ${params.request.method} ${params.request.url}`);
      allTraffic.push({
        type: 'cdp_request',
        method: params.request.method,
        url: params.request.url,
        headers: params.request.headers
      });
    }
  });

  client.on('Network.responseReceived', async (params) => {
    if (params.response.url.includes('athletic') || params.response.url.includes('meet') || params.response.url.includes('result')) {
      console.log(`\n📥 CDP RESPONSE: ${params.response.status} ${params.response.url}`);

      // Try to get response body
      try {
        const response = await client.send('Network.getResponseBody', {
          requestId: params.requestId
        });

        if (response.body) {
          console.log(`   BODY PREVIEW: ${response.body.substring(0, 200)}`);
          allTraffic.push({
            type: 'cdp_response',
            url: params.response.url,
            status: params.response.status,
            body: response.body.substring(0, 1000)
          });
        }
      } catch (e) {
        // Can't get body
      }
    }
  });

  // Method 2: Page-level request interception
  await page.setRequestInterception(true);
  page.on('request', req => {
    console.log(`→ ${req.resourceType()}: ${req.url().substring(0, 100)}`);
    req.continue();
  });

  console.log('\n🌐 Loading page...\n');
  await page.goto(meetUrl, { waitUntil: 'networkidle0', timeout: 120000 });

  console.log('\n⏳ Waiting 60 seconds for Angular to fully load and make API calls...\n');
  await new Promise(resolve => setTimeout(resolve, 60000));

  // Save everything
  fs.writeFileSync('all_traffic.json', JSON.stringify(allTraffic, null, 2));

  console.log(`\n\n📊 CAPTURED ${allTraffic.length} requests/responses`);
  console.log('💾 Saved to: all_traffic.json\n');

  // Print summary of interesting URLs
  const uniqueUrls = [...new Set(allTraffic.map(t => t.url))];
  console.log('\n🎯 UNIQUE URLs FOUND:');
  uniqueUrls.forEach(url => {
    if (url && !url.includes('.js') && !url.includes('.css') && !url.includes('google') && !url.includes('sentry')) {
      console.log(`   ${url}`);
    }
  });

  await browser.close();
}

const meetUrl = process.argv[2] || 'https://live.jdlfasttrack.com/meets/54336/live/track/track';
interceptEverything(meetUrl).catch(console.error);
