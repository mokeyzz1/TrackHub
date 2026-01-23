const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  const apiCalls = [];

  // Intercept all network requests
  page.on('response', async (response) => {
    const url = response.url();

    // Look for JSON API responses
    if (url.includes('/api/') || url.includes('.json') || response.headers()['content-type']?.includes('application/json')) {
      apiCalls.push({
        url: url,
        status: response.status(),
        contentType: response.headers()['content-type']
      });
    }
  });

  console.log('🌐 Loading page and intercepting API calls...\n');

  await page.goto('https://results.blacksquirreltiming.com/meets/59182', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('📡 API CALLS MADE:\n');
  apiCalls.forEach((call, i) => {
    console.log(`${i + 1}. ${call.url}`);
    console.log(`   Status: ${call.status}`);
    console.log(`   Type: ${call.contentType}\n`);
  });

  await browser.close();
})();
