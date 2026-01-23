// Deep analysis of ALL network traffic to find the timing system data feed
const puppeteer = require('puppeteer');
const fs = require('fs');

async function deepAnalysis(meetUrl) {
  console.log(`🔬 Deep network analysis: ${meetUrl}\n`);

  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  const allRequests = [];
  const allResponses = [];

  // Capture EVERYTHING
  page.on('request', request => {
    const url = request.url();
    const method = request.method();
    const headers = request.headers();

    allRequests.push({
      url,
      method,
      resourceType: request.resourceType(),
      headers
    });

    console.log(`→ ${method} ${request.resourceType()}: ${url}`);
  });

  page.on('response', async response => {
    const url = response.url();
    const status = response.status();
    const contentType = response.headers()['content-type'] || '';

    console.log(`← ${status} ${contentType.split(';')[0]}: ${url}`);

    // Try to capture response body for JSON/text responses
    if (contentType.includes('json') || contentType.includes('text')) {
      try {
        const text = await response.text();
        allResponses.push({
          url,
          status,
          contentType,
          bodyPreview: text.substring(0, 500),
          bodyLength: text.length
        });

        // If it looks like results data, log it
        if (text.includes('time') || text.includes('result') || text.includes('athlete') || text.includes('mark')) {
          console.log('\n🎯 POTENTIAL DATA FOUND:');
          console.log(`   URL: ${url}`);
          console.log(`   Preview: ${text.substring(0, 200)}\n`);
        }
      } catch (e) {
        // Can't read body
      }
    }
  });

  // Monitor XHR/Fetch requests specifically
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
      console.log('\n📡 XHR/FETCH REQUEST:');
      console.log(`   ${request.method()} ${request.url()}`);
      console.log(`   Headers:`, request.headers());
    }
    request.continue();
  });

  console.log('\n🌐 Loading page...\n');
  await page.goto(meetUrl, { waitUntil: 'networkidle0', timeout: 120000 });

  console.log('\n⏳ Waiting 45 seconds and scrolling to trigger all data loads...\n');

  // Scroll through the page to trigger lazy loading
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(resolve => setTimeout(resolve, 3000));
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Click on different events to see if they load data
  console.log('\n🖱️  Trying to click on different events...\n');
  await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="live"]');
    links.forEach(link => console.log('Found link:', link.href));
  });

  console.log('\n\n=== ANALYSIS COMPLETE ===\n');

  // Filter for interesting requests
  const dataRequests = allRequests.filter(r =>
    r.url.includes('api') ||
    r.url.includes('data') ||
    r.url.includes('result') ||
    r.url.includes('live') ||
    r.url.includes('.json') ||
    r.resourceType === 'xhr' ||
    r.resourceType === 'fetch'
  );

  console.log(`\n📊 Found ${dataRequests.length} potential data endpoints:\n`);
  dataRequests.forEach(req => {
    console.log(`   ${req.method} ${req.resourceType}: ${req.url}`);
  });

  // Save to file for analysis
  fs.writeFileSync('network_analysis.json', JSON.stringify({
    allRequests,
    allResponses,
    dataRequests
  }, null, 2));

  console.log('\n💾 Full analysis saved to: network_analysis.json');
  console.log('\n🔍 Look for patterns in URLs that include:');
  console.log('   - /api/');
  console.log('   - /data/');
  console.log('   - /results/');
  console.log('   - .json');
  console.log('   - timing system endpoints');

  await browser.close();
}

const meetUrl = process.argv[2] || 'https://live.jdlfasttrack.com/meets/54336';
deepAnalysis(meetUrl).catch(console.error);
