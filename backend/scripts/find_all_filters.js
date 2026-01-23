const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  await page.goto('https://results.blacksquirreltiming.com/meets/59182', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  await new Promise(resolve => setTimeout(resolve, 8000));

  const allFilters = await page.evaluate(() => {
    const filters = [];

    document.querySelectorAll('button').forEach(btn => {
      const text = btn.textContent.trim();
      if (text && text.length < 100) {
        filters.push({
          type: 'button',
          text: text,
          className: btn.className,
          isActive: btn.className.includes('active')
        });
      }
    });

    document.querySelectorAll('[role="tab"], .tab, .nav-link').forEach(tab => {
      const text = tab.textContent.trim();
      if (text && text.length < 100) {
        filters.push({
          type: 'tab',
          text: text,
          className: tab.className,
          isActive: tab.className.includes('active')
        });
      }
    });

    return filters;
  });

  console.log('ALL FILTERS/TABS FOUND:\n');
  allFilters.forEach((f, i) => {
    console.log(`${i + 1}. [${f.type}] ${f.text} ${f.isActive ? '(ACTIVE)' : ''}`);
  });

  await browser.close();
})();
