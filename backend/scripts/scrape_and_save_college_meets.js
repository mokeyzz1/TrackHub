// Scrape COLLEGE meets from USTFCCCA and save to Supabase
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

function parseMeetDate(dateStr) {
  // Parse dates like "Fri Dec 5" or "Fri Dec 5-Sat Dec 6"
  const year = new Date().getFullYear();
  const match = dateStr.match(/\w+\s+(\w+)\s+(\d+)/);
  if (match) {
    const [_, month, day] = match;
    return new Date(`${month} ${day}, ${year}`).toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

async function scrapeCollegiateMeets(datescope = 'this_week') {
  console.log(`\n🏛️  Scraping COLLEGE MEETS from USTFCCCA: ${datescope}\n`);

  const url = `https://www.ustfccca.org/meets-results?datescope=${datescope}`;

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    console.log('✅ Page loaded\n');

    // Wait for content
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Extract collegiate meets
    const meets = await page.evaluate(() => {
      const results = [];

      // Find all "Collegiate" headings
      const collegiateHeadings = Array.from(document.querySelectorAll('h4'))
        .filter(h => h.textContent.trim() === 'Collegiate');

      collegiateHeadings.forEach(heading => {
        // Find the next table after this heading
        let nextElement = heading.nextElementSibling;
        let table = null;

        while (nextElement && !table) {
          if (nextElement.tagName === 'TABLE') {
            table = nextElement;
            break;
          }
          if (nextElement.tagName === 'H3' || nextElement.tagName === 'H2') {
            // Reached next section
            break;
          }
          nextElement = nextElement.nextElementSibling;
        }

        if (!table) return;

        // Extract meets from this table
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            const meetCol = cells[0];
            const hostCol = cells[1];
            const infoCol = cells[2];

            // Get meet name and location from spans
            const meetNameSpan = meetCol.querySelector('span[style*="font-weight:bold"]');
            const locationSpan = meetCol.querySelector('span[style*="font-size:0.85em"]');

            const hostSpan = hostCol.querySelector('span:first-child');
            const dateSpan = hostCol.querySelector('span[style*="font-size:0.85em"]');

            // Extract timing link
            const links = Array.from(infoCol.querySelectorAll('a'));
            const timingLink = links.find(a =>
              a.href.includes('tfrrs.org') ||
              a.href.includes('athletic.net') ||
              a.href.includes('milesplit.live') ||
              a.textContent.includes('Timing')
            );

            if (meetNameSpan && hostSpan) {
              results.push({
                name: meetNameSpan.textContent.trim(),
                location: locationSpan ? locationSpan.textContent.trim() : '',
                host: hostSpan.textContent.trim(),
                date: dateSpan ? dateSpan.textContent.trim() : '',
                timingUrl: timingLink ? timingLink.href : null
              });
            }
          }
        });
      });

      return results;
    });

    console.log(`\n✅ Found ${meets.length} collegiate meets!\n`);

    if (meets.length === 0) {
      console.log('❌ No meets extracted. The page structure may have changed.\n');
      await browser.close();
      return [];
    }

    // Display found meets
    meets.forEach((meet, i) => {
      console.log(`${i + 1}. ${meet.name}`);
      console.log(`   📍 ${meet.location}`);
      console.log(`   🏫 ${meet.host}`);
      console.log(`   📅 ${meet.date}`);
      if (meet.timingUrl) console.log(`   ⏱️  ${meet.timingUrl}`);
      console.log();
    });

    // Insert into database
    console.log('💾 Saving to Supabase...\n');

    const meetsToInsert = meets.map(meet => ({
      name: meet.name,
      date: parseMeetDate(meet.date),
      location: meet.location,
      meet_url: meet.timingUrl,
      status: 'upcoming',
      level: 'college',
      season: 'indoor', // Adjust based on current season
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('meets')
      .insert(meetsToInsert)
      .select();

    if (error) {
      console.error('❌ Database error:', error);
      console.log('\n⚠️  Make sure you created the meets table first!');
      console.log('   Run the SQL from: backend/supabase/migrations/20241203000000_meets_and_events.sql\n');
    } else {
      console.log(`✅ Successfully saved ${data.length} meets to database!\n`);
      data.slice(0, 5).forEach((meet, i) => {
        console.log(`${i + 1}. ${meet.name} (ID: ${meet.meet_id})`);
      });
    }

    await browser.close();
    return meets;

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    await browser.close();
    throw error;
  }
}

// Run
const scope = process.argv[2] || 'this_week';
scrapeCollegiateMeets(scope)
  .then(() => {
    console.log('\n🎉 Done!\n');
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
