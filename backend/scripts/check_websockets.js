// Check if AthleticLIVE uses WebSockets for real-time updates
const puppeteer = require('puppeteer');

async function checkWebSockets(meetUrl) {
  console.log(`🔍 Checking for WebSocket connections on: ${meetUrl}\n`);

  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  const websockets = [];
  const apiCalls = [];

  // Monitor WebSocket connections
  page.on('websocket', ws => {
    console.log('🔌 WebSocket FOUND:', ws.url());
    websockets.push(ws.url());

    ws.on('framereceived', event => {
      console.log('📥 WebSocket MESSAGE:', event.payload);
    });
  });

  // Monitor network requests
  page.on('request', request => {
    const url = request.url();
    if (url.includes('api') || url.includes('socket') || url.includes('stream')) {
      console.log('📡 API REQUEST:', url);
      apiCalls.push(url);
    }
  });

  page.on('response', async response => {
    const url = response.url();
    if (url.includes('api') || url.includes('socket') || url.includes('stream')) {
      console.log('📥 API RESPONSE:', response.status(), url);
    }
  });

  await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

  console.log('\n⏳ Waiting 30 seconds to monitor for real-time updates...\n');
  await new Promise(resolve => setTimeout(resolve, 30000));

  console.log('\n\n=== SUMMARY ===');
  console.log(`WebSockets found: ${websockets.length}`);
  if (websockets.length > 0) {
    console.log('\nWebSocket URLs:');
    websockets.forEach(ws => console.log(`  - ${ws}`));
  }

  console.log(`\nAPI calls found: ${apiCalls.length}`);
  if (apiCalls.length > 0) {
    console.log('\nAPI URLs:');
    const unique = [...new Set(apiCalls)];
    unique.forEach(api => console.log(`  - ${api}`));
  }

  if (websockets.length === 0 && apiCalls.length === 0) {
    console.log('\n❌ No WebSockets or streaming APIs detected.');
    console.log('📝 This means the site likely uses:');
    console.log('   1. Server-side rendering (SSR) - data embedded in HTML');
    console.log('   2. Periodic page refreshes');
    console.log('   3. Client-side polling to their backend');
    console.log('\n💡 Best option: Scrape the page every 30-60 seconds');
  } else {
    console.log('\n✅ Real-time connection found!');
    console.log('💡 We could potentially tap into this for instant updates');
  }

  await browser.close();
}

const meetUrl = process.argv[2] || 'https://live.jdlfasttrack.com/meets/54336';
checkWebSockets(meetUrl).catch(console.error);
