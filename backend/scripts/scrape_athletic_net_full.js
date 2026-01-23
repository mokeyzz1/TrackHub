const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function scrapeFullMeet(meetId, meetUrl) {
  console.log(`\n📊 SCRAPING ALL DATA FROM ATHLETIC.NET MEET\n`);
  console.log(`Meet ID: ${meetId}`);
  console.log(`URL: ${meetUrl}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Extract ALL data from the page
  const meetData = await page.evaluate(() => {
    const allData = {
      events: [],
      results: [],
      teams: new Set(),
      athletes: new Set()
    };

    // Get all table rows
    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
      const rows = table.querySelectorAll('tr');
      rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td, th')).map(c => c.textContent.trim());
        if (cells.length > 0 && cells.some(c => c.length > 0)) {
          allData.results.push(cells);
        }
      });
    });

    // Get event names
    const eventLinks = document.querySelectorAll('a[href*="event"], h2, h3, .event-name');
    eventLinks.forEach(el => {
      const text = el.textContent.trim();
      if (text.match(/\d+(m|meter|km|Mile)/i) || text.match(/(Jump|Throw|Hurdle|Relay)/i)) {
        allData.events.push(text);
      }
    });

    const allText = document.body.textContent;
    const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    return {
      events: allData.events,
      results: allData.results,
      allLines: lines.slice(0, 500),
      pageTitle: document.title,
      html: document.body.innerHTML.substring(0, 5000)
    };
  });

  console.log('📋 Data extracted:');
  console.log(`  Events found: ${meetData.events.length}`);
  console.log(`  Result rows: ${meetData.results.length}`);
  console.log(`  Text lines: ${meetData.allLines.length}`);

  console.log('\n🎯 Sample Events:');
  meetData.events.slice(0, 10).forEach(e => console.log(`  - ${e}`));

  console.log('\n📊 Sample Results (first 10 rows):');
  meetData.results.slice(0, 10).forEach(r => {
    console.log(`  ${r.filter(c => c).join(' | ')}`);
  });

  await browser.close();

  return meetData;
}

// Run it
const meetId = 2;
const meetUrl = 'https://www.athletic.net/TrackAndField/meet/625055/results';

scrapeFullMeet(meetId, meetUrl)
  .then(data => {
    console.log('\n✅ Scraping complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
