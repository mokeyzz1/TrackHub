// Scrape USTFCCCA meet calendar for upcoming meets
const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeUSLTFCCCAMeets(datescope = 'today') {
  console.log(`\n🏃 Scraping USTFCCCA meets: ${datescope}\n`);

  const url = `https://www.ustfccca.org/meets-results?datescope=${datescope}`;

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for meets to load
    await new Promise(resolve => setTimeout(resolve, 5000));

    const meets = await page.evaluate(() => {
      const meetElements = document.querySelectorAll('.meet-item, .meet-card, [class*="meet"]');
      const results = [];

      meetElements.forEach(el => {
        try {
          const nameEl = el.querySelector('.meet-name, h3, h4, [class*="name"]');
          const locationEl = el.querySelector('.location, .venue, [class*="location"]');
          const dateEl = el.querySelector('.date, .time, [class*="date"]');
          const linkEl = el.querySelector('a');

          if (nameEl) {
            results.push({
              name: nameEl.textContent.trim(),
              location: locationEl ? locationEl.textContent.trim() : 'TBD',
              date: dateEl ? dateEl.textContent.trim() : '',
              link: linkEl ? linkEl.href : '',
              html: el.outerHTML.substring(0, 500)
            });
          }
        } catch (e) {
          // Skip
        }
      });

      // Also try to get raw HTML structure
      const bodyHTML = document.body.innerHTML;

      return {
        meets: results,
        bodyPreview: bodyHTML.substring(0, 3000),
        foundElements: meetElements.length
      };
    });

    console.log(`\n📊 Found ${meets.foundElements} potential meet elements`);
    console.log(`   Extracted ${meets.meets.length} meets\n`);

    if (meets.meets.length > 0) {
      meets.meets.slice(0, 10).forEach((meet, i) => {
        console.log(`${i + 1}. ${meet.name}`);
        console.log(`   📍 ${meet.location}`);
        console.log(`   📅 ${meet.date}`);
        if (meet.link) console.log(`   🔗 ${meet.link}`);
        console.log();
      });
    } else {
      console.log('❌ No meets extracted. Saving page structure for analysis...\n');
      console.log('Preview of page HTML:');
      console.log(meets.bodyPreview);
    }

    // Save to file
    const filename = `ustfccca_meets_${datescope}_${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(meets, null, 2));
    console.log(`\n💾 Saved to: ${filename}\n`);

    return meets;

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    throw error;
  } finally {
    await browser.close();
  }
}

async function scrapeAllScopes() {
  console.log('🎯 Scraping all USTFCCCA meet scopes\n');
  console.log('='.repeat(60));

  const scopes = ['today', 'this_week', 'next_week'];
  const allMeets = {};

  for (const scope of scopes) {
    console.log(`\n\n📅 SCOPE: ${scope.toUpperCase()}`);
    console.log('='.repeat(60));

    try {
      const result = await scrapeUSLTFCCCAMeets(scope);
      allMeets[scope] = result;

      // Wait between requests
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.error(`Failed to scrape ${scope}`);
      allMeets[scope] = { error: error.message };
    }
  }

  // Save combined results
  const combinedFilename = `ustfccca_all_meets_${Date.now()}.json`;
  fs.writeFileSync(combinedFilename, JSON.stringify(allMeets, null, 2));

  console.log('\n\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));

  Object.entries(allMeets).forEach(([scope, data]) => {
    if (data.meets) {
      console.log(`${scope}: ${data.meets.length} meets`);
    } else {
      console.log(`${scope}: Error`);
    }
  });

  console.log(`\n💾 All results saved to: ${combinedFilename}\n`);

  return allMeets;
}

// Run based on command line argument
const arg = process.argv[2];

if (arg === 'all') {
  scrapeAllScopes().catch(console.error);
} else {
  const scope = arg || 'today';
  scrapeUSLTFCCCAMeets(scope).catch(console.error);
}
