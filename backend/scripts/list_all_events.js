const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  console.log('Loading meet page to find ALL events...\n');
  await page.goto('https://results.blacksquirreltiming.com/meets/59182', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  await new Promise(resolve => setTimeout(resolve, 8000));

  const allEventLinks = await page.evaluate(() => {
    const links = [];
    document.querySelectorAll('a').forEach(a => {
      const text = a.textContent.trim();
      const href = a.href;

      if ((text.includes('Results') || text.includes('Scheduled') || text.includes('Entries')) &&
          href.includes('/events/')) {
        links.push({
          text: text,
          href: href
        });
      }
    });
    return links;
  });

  console.log(`Found ${allEventLinks.length} total event links:\n`);
  allEventLinks.forEach((link, idx) => {
    console.log(`${idx + 1}. ${link.text}`);
  });

  await browser.close();
})();
