// Smart scraper that UPSERTS meets (insert new, update existing)
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

function parseMeetDate(dateStr) {
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
    await new Promise(resolve => setTimeout(resolve, 5000));

    const meets = await page.evaluate(() => {
      const results = [];
      const collegiateHeadings = Array.from(document.querySelectorAll('h4'))
        .filter(h => h.textContent.trim() === 'Collegiate');

      collegiateHeadings.forEach(heading => {
        let nextElement = heading.nextElementSibling;
        let table = null;

        while (nextElement && !table) {
          if (nextElement.tagName === 'TABLE') {
            table = nextElement;
            break;
          }
          if (nextElement.tagName === 'H3' || nextElement.tagName === 'H2') break;
          nextElement = nextElement.nextElementSibling;
        }

        if (!table) return;

        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            const meetCol = cells[0];
            const hostCol = cells[1];
            const infoCol = cells[2];

            const meetNameSpan = meetCol.querySelector('span[style*="font-weight:bold"]');
            const locationSpan = meetCol.querySelector('span[style*="font-size:0.85em"]');
            const hostSpan = hostCol.querySelector('span:first-child');
            const dateSpan = hostCol.querySelector('span[style*="font-size:0.85em"]');

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
      console.log('❌ No meets extracted.\n');
      await browser.close();
      return { newMeets: 0, updatedMeets: 0 };
    }

    // SMART UPSERT LOGIC
    console.log('💾 Upserting to Supabase (insert new, update existing)...\n');

    let newCount = 0;
    let updatedCount = 0;

    for (const meet of meets) {
      const meetDate = parseMeetDate(meet.date);

      // Check if meet already exists (by name + date)
      const { data: existing } = await supabase
        .from('meets')
        .select('*')
        .eq('name', meet.name)
        .eq('date', meetDate)
        .single();

      if (existing) {
        // Meet exists - UPDATE if live link changed
        if (meet.timingUrl && meet.timingUrl !== existing.meet_url) {
          const { error } = await supabase
            .from('meets')
            .update({
              meet_url: meet.timingUrl,
              updated_at: new Date().toISOString()
            })
            .eq('meet_id', existing.meet_id);

          if (!error) {
            console.log(`🔄 Updated: ${meet.name} (added live link)`);
            updatedCount++;
          }
        } else {
          console.log(`⏭️  Skipped: ${meet.name} (already exists, no changes)`);
        }
      } else {
        // Meet doesn't exist - INSERT
        const { error } = await supabase
          .from('meets')
          .insert([{
            name: meet.name,
            date: meetDate,
            location: meet.location,
            meet_url: meet.timingUrl,
            status: 'upcoming',
            level: 'college',
            season: 'indoor',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]);

        if (!error) {
          console.log(`✅ Added: ${meet.name}`);
          newCount++;
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`📊 Summary:`);
    console.log(`   🆕 New meets: ${newCount}`);
    console.log(`   🔄 Updated meets: ${updatedCount}`);
    console.log(`   ⏭️  Skipped: ${meets.length - newCount - updatedCount}`);
    console.log('='.repeat(60) + '\n');

    await browser.close();
    return { newMeets: newCount, updatedMeets: updatedCount };

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    await browser.close();
    throw error;
  }
}

// Run
const scope = process.argv[2] || 'this_week';
scrapeCollegiateMeets(scope)
  .then(result => {
    console.log(`🎉 Done! ${result.newMeets} new, ${result.updatedMeets} updated\n`);
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
