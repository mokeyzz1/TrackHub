/**
 * Debug script to save raw HTML from a TFRRS page
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function debug() {
  const url = 'https://www.tfrrs.org/athletes/8628816/Pitt_State/Keeley_Carpenter.html';

  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  console.log('Loading page:', url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

  // Wait for content
  await new Promise(r => setTimeout(r, 2000));

  // Save HTML
  const html = await page.content();
  fs.writeFileSync(path.join(__dirname, './output/debug-page.html'), html);
  console.log('Saved HTML to debug-page.html');

  // Print page structure info
  const structure = await page.evaluate(() => {
    const info = {
      tables: document.querySelectorAll('table').length,
      tableClasses: [],
      eventHeaders: [],
      mainSections: []
    };

    // Get table info
    document.querySelectorAll('table').forEach((t, i) => {
      info.tableClasses.push({
        index: i,
        class: t.className,
        id: t.id,
        rows: t.rows.length,
        firstRowText: t.rows[0]?.textContent.substring(0, 100)
      });
    });

    // Look for event headers
    document.querySelectorAll('h1, h2, h3, h4, h5').forEach(h => {
      const text = h.textContent.trim();
      if (text.length < 50) {
        info.eventHeaders.push(text);
      }
    });

    // Main content sections
    document.querySelectorAll('div[class], section').forEach(div => {
      if (div.className && div.className.includes && (
        div.className.includes('result') ||
        div.className.includes('event') ||
        div.className.includes('perf') ||
        div.className.includes('history')
      )) {
        info.mainSections.push({
          class: div.className,
          childCount: div.children.length
        });
      }
    });

    return info;
  });

  console.log('\n=== PAGE STRUCTURE ===');
  console.log('Tables:', structure.tables);
  console.log('\nTable details:');
  structure.tableClasses.forEach(t => {
    console.log(`  Table ${t.index}: class="${t.class}" id="${t.id}" rows=${t.rows}`);
    console.log(`    First row: ${t.firstRowText}`);
  });

  console.log('\nEvent Headers:', structure.eventHeaders.slice(0, 20));
  console.log('\nMain sections:', structure.mainSections.slice(0, 10));

  await browser.close();
}

debug().catch(console.error);
