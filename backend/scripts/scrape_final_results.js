// Scraper for final results from completed meets
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Scrape final results for a completed meet
 */
async function scrapeFinalResults(meetId, meet, statusInfo) {
  console.log('📊 Scraping final results...\n');

  // Route to platform-specific scraper
  if (statusInfo.platform === 'blacksquirrel') {
    console.log('🐿️  Using Black Squirrel Timing scraper\n');
    const { scrapeBlackSquirrelResults } = require('./scrape_blacksquirrel_results');
    return await scrapeBlackSquirrelResults(meetId, meet);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  let totalResults = 0;
  let successfulEvents = 0;

  try {
    const page = await browser.newPage();

    // Navigate to meet page
    await page.goto(meet.meet_url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get events from database
    const { data: events } = await supabase
      .from('events')
      .select('event_id, event_name')
      .eq('meet_id', meetId);

    if (!events || events.length === 0) {
      console.log('⚠️  No events found in database');
      await browser.close();
      return { success: false, reason: 'no_events' };
    }

    console.log(`📋 Found ${events.length} events to scrape\n`);

    // Discover event elements on page
    const eventElements = await page.evaluate(() => {
      const events = [];
      const eventDivs = document.querySelectorAll('.event-component');

      eventDivs.forEach((div, index) => {
        const nameEl = div.querySelector('.event-name');
        if (nameEl) {
          events.push({
            name: nameEl.textContent.trim(),
            index: index
          });
        }
      });

      return events;
    });

    console.log(`🔍 Found ${eventElements.length} events on page\n`);

    // Process each event
    for (const event of events) {
      console.log(`  📋 ${event.event_name}`);

      // Find matching element on page
      const matchingElement = eventElements.find(el =>
        el.name.toLowerCase().includes(event.event_name.toLowerCase()) ||
        event.event_name.toLowerCase().includes(el.name.toLowerCase())
      );

      if (!matchingElement) {
        console.log(`     ⚠️  Not found on page`);
        continue;
      }

      // Click to expand event
      await page.evaluate((index) => {
        const eventDivs = document.querySelectorAll('.event-component');
        if (eventDivs[index]) {
          eventDivs[index].click();
        }
      }, matchingElement.index);

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Scrape results
      const results = await page.evaluate(() => {
        const results = [];
        const tables = document.querySelectorAll('table');

        tables.forEach(table => {
          const rows = table.querySelectorAll('tr');

          rows.forEach((row, rowIndex) => {
            const cells = row.querySelectorAll('td');

            // MileSplit structure: [Place, Athlete, Year, Team, Mark, ...]
            if (cells.length >= 4 && rowIndex > 0) {
              const place = cells[0]?.textContent.trim();
              const athleteFull = cells[1]?.textContent.trim();
              const year = cells[2]?.textContent.trim();
              const team = cells[3]?.textContent.trim();
              const mark = cells[4]?.textContent.trim();

              if (!athleteFull || athleteFull.toLowerCase().includes('athlete')) {
                return;
              }

              // Extract athlete name
              let athleteName = athleteFull;
              if (athleteFull.includes('•')) {
                athleteName = athleteFull.split('•')[0].trim();
              }
              if (team) {
                const teamPattern = new RegExp('\\s+' + team + '\\s*$');
                athleteName = athleteName.replace(teamPattern, '').trim();
              }

              results.push({
                place: !isNaN(parseInt(place)) ? parseInt(place) : null,
                athlete: athleteName,
                team: team || null,
                mark: mark || null
              });
            }
          });
        });

        return results;
      });

      console.log(`     ✅ ${results.length} results`);

      // Save to live_results table
      for (const result of results) {
        const { error } = await supabase
          .from('live_results')
          .insert([{
            meet_url: meet.meet_url,
            meet_name: meet.name,
            event_name: event.event_name,
            participant_name: result.athlete,
            place: result.place,
            mark_raw: result.mark,
            team_name: result.team,
            scraped_at: new Date().toISOString(),
            date: meet.date,
            round: 'FINAL',
            is_final: true
          }]);

        if (error && !error.message.includes('duplicate')) {
          console.error(`       ❌ Error: ${error.message}`);
        }
      }

      totalResults += results.length;
      successfulEvents++;

      // Small delay between events
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    await browser.close();

    console.log(`\n✅ Processed ${successfulEvents} events`);
    console.log(`📊 Total results: ${totalResults}\n`);

    return {
      success: true,
      events: successfulEvents,
      results: totalResults
    };

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    await browser.close();
    return { success: false, reason: error.message };
  }
}

module.exports = {
  scrapeFinalResults
};
