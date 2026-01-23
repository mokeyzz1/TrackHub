// Scraper for event entries (starting lists, heat sheets, seed times)
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Scrape Athletic.net event entries
async function scrapeAthleticNetEntries(page, eventUrl, eventId) {
  console.log(`  📊 Scraping entries from Athletic.net...`);

  await page.goto(eventUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 3000));

  const entries = await page.evaluate(() => {
    const results = [];

    // Look for entry tables
    const tables = document.querySelectorAll('table');

    tables.forEach(table => {
      const rows = table.querySelectorAll('tr');

      rows.forEach(row => {
        const cells = row.querySelectorAll('td');

        // Common patterns for entry/starting list tables
        // Usually: Place/Lane | Name | Team | Seed Time/Mark
        if (cells.length >= 3) {
          const firstCell = cells[0]?.textContent.trim();
          const nameCell = cells[1]?.textContent.trim();
          const teamOrSeed = cells[2]?.textContent.trim();
          const seedCell = cells[3]?.textContent.trim();

          // Check if this looks like an entry row
          if (nameCell && nameCell.length > 2 && !nameCell.includes('Name')) {
            const entry = {
              lane: !isNaN(parseInt(firstCell)) ? parseInt(firstCell) : null,
              athlete: nameCell,
              team: teamOrSeed || null,
              seed: seedCell || teamOrSeed || null,
              heat: null
            };

            results.push(entry);
          }
        }
      });
    });

    return results;
  });

  return entries;
}

// Scrape MileSplit event entries
async function scrapeMileSplitEntries(page, eventUrl, eventId) {
  console.log(`  📊 Scraping entries from MileSplit...`);

  await page.goto(eventUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 3000));

  const entries = await page.evaluate(() => {
    const results = [];

    // MileSplit has different structure - look for entry lists
    const entryContainers = document.querySelectorAll('[class*="entry"], [class*="participant"], [class*="athlete"]');

    entryContainers.forEach(container => {
      const nameEl = container.querySelector('[class*="name"], .athlete-name, h4, h5');
      const teamEl = container.querySelector('[class*="team"], [class*="school"]');
      const seedEl = container.querySelector('[class*="seed"], [class*="time"], [class*="mark"]');

      if (nameEl) {
        results.push({
          athlete: nameEl.textContent.trim(),
          team: teamEl ? teamEl.textContent.trim() : null,
          seed: seedEl ? seedEl.textContent.trim() : null,
          lane: null,
          heat: null
        });
      }
    });

    // Also check tables
    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
      const rows = table.querySelectorAll('tbody tr');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const athlete = cells[0]?.textContent.trim() || cells[1]?.textContent.trim();
          const team = cells[1]?.textContent.trim() || cells[2]?.textContent.trim();
          const seed = cells[2]?.textContent.trim() || cells[3]?.textContent.trim();

          if (athlete && athlete.length > 2) {
            results.push({
              athlete,
              team,
              seed,
              lane: null,
              heat: null
            });
          }
        }
      });
    });

    return results;
  });

  return entries;
}

// Main function to scrape all entries for a meet's events
async function scrapeEntriesForMeet(meetId) {
  console.log(`\n📋 Scraping entries for meet_id: ${meetId}`);

  // Get all events for this meet
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('event_id, event_name, meet_id')
    .eq('meet_id', meetId);

  if (eventsError || !events || events.length === 0) {
    console.log(`  ❌ No events found for meet ${meetId}`);
    return { success: false, reason: 'no_events' };
  }

  // Get meet URL
  const { data: meet, error: meetError } = await supabase
    .from('meets')
    .select('meet_url, name')
    .eq('meet_id', meetId)
    .single();

  if (meetError || !meet?.meet_url) {
    console.log(`  ❌ No meet URL found`);
    return { success: false, reason: 'no_url' };
  }

  console.log(`  📍 Meet: ${meet.name}`);
  console.log(`  📋 Events to process: ${events.length}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  let totalEntries = 0;
  let successfulEvents = 0;

  try {
    const page = await browser.newPage();

    // Detect platform
    const platform = meet.meet_url.includes('athletic.net') ? 'athletic_net' :
                    meet.meet_url.includes('milesplit') ? 'milesplit' : 'unknown';

    console.log(`\n  🌐 Platform: ${platform}`);
    console.log(`  🔗 Navigating to meet page...`);

    // Navigate to meet page first
    await page.goto(meet.meet_url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Discover event components on the meet page
    console.log(`  🔍 Discovering events...`);

    let eventElements = [];

    if (platform === 'milesplit') {
      // MileSplit uses interactive divs, not links
      eventElements = await page.evaluate(() => {
        const events = [];
        const eventDivs = document.querySelectorAll('.event-component');

        eventDivs.forEach((div, index) => {
          const nameEl = div.querySelector('.event-name');
          if (nameEl) {
            events.push({
              name: nameEl.textContent.trim(),
              index: index,
              type: 'milesplit_div'
            });
          }
        });

        return events;
      });
    } else {
      // Athletic.net uses traditional links
      eventElements = await page.evaluate(() => {
        const links = [];
        const allLinks = document.querySelectorAll('a');

        allLinks.forEach(link => {
          const href = link.href;
          const text = link.textContent.trim();

          if (href && (
            href.includes('/event/') ||
            href.includes('/entries/') ||
            href.includes('/heat') ||
            href.includes('/start')
          )) {
            if (text && text.length > 3 && !text.toLowerCase().includes('results')) {
              links.push({
                url: href,
                name: text,
                type: 'link'
              });
            }
          }
        });

        return links;
      });
    }

    console.log(`  📋 Found ${eventElements.length} events on page`);

    // Match discovered events to our database events
    for (const event of events.slice(0, 5)) { // Limit to 5 events for testing
      console.log(`\n  📋 Processing: ${event.event_name}`);

      // Find matching event element
      const matchingElement = eventElements.find(el =>
        el.name.toLowerCase().includes(event.event_name.toLowerCase()) ||
        event.event_name.toLowerCase().includes(el.name.toLowerCase())
      );

      if (!matchingElement) {
        console.log(`    ⚠️  No matching event found on page`);
        continue;
      }

      console.log(`    ✅ Found: ${matchingElement.name}`);

      let entries = [];

      try {
        // Scrape entries based on platform
        if (platform === 'athletic_net' && matchingElement.type === 'link') {
          entries = await scrapeAthleticNetEntries(page, matchingElement.url, event.event_id);
        } else if (platform === 'milesplit' && matchingElement.type === 'milesplit_div') {
          // For MileSplit, click the event div and scrape from expanded view
          console.log(`    🖱️  Clicking event to expand details...`);

          // Click the event div
          await page.evaluate((index) => {
            const eventDivs = document.querySelectorAll('.event-component');
            if (eventDivs[index]) {
              eventDivs[index].click();
            }
          }, matchingElement.index);

          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for expansion

          // Now scrape the expanded event details
          entries = await page.evaluate(() => {
            const results = [];

            // Look for entry/participant tables or lists within the expanded event
            const tables = document.querySelectorAll('table');

            tables.forEach(table => {
              const rows = table.querySelectorAll('tr');

              rows.forEach((row, rowIndex) => {
                const cells = row.querySelectorAll('td');

                // MileSplit table structure:
                // [0] Place, [1] Athlete (with team/year), [2] Year, [3] Team, [4] Mark
                if (cells.length >= 4) {
                  const place = cells[0]?.textContent.trim();
                  const athleteFull = cells[1]?.textContent.trim();
                  const year = cells[2]?.textContent.trim();
                  const team = cells[3]?.textContent.trim();
                  const mark = cells[4]?.textContent.trim();

                  // Skip header row
                  if (rowIndex === 0 || !athleteFull || athleteFull.toLowerCase().includes('athlete')) {
                    return;
                  }

                  // Extract just the athlete name from "Name  Team • Year" format
                  let athleteName = athleteFull;
                  if (athleteFull.includes('•')) {
                    athleteName = athleteFull.split('•')[0].trim();
                  }
                  // Remove team name from end (e.g., "Devin Jones  Felician" -> "Devin Jones")
                  if (team) {
                    const teamPattern = new RegExp('\\s+' + team + '\\s*$');
                    athleteName = athleteName.replace(teamPattern, '').trim();
                  }

                  results.push({
                    lane: !isNaN(parseInt(place)) ? parseInt(place) : null,
                    athlete: athleteName,
                    team: team || null,
                    seed: mark || null,
                    heat: null
                  });
                }
              });
            });

            return results;
          });
        }

        console.log(`    ✅ Scraped ${entries.length} entries`);

        // Save entries to database
        if (entries.length > 0) {
          for (const entry of entries) {
            const { error } = await supabase
              .from('event_entries')
              .insert([{
                event_id: event.event_id,
                athlete_name: entry.athlete,
                team_name: entry.team,
                heat_number: entry.heat,
                lane_number: entry.lane,
                seed_time: entry.seed && entry.seed.includes(':') ? entry.seed : null,
                seed_mark: entry.seed && !entry.seed.includes(':') ? entry.seed : null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }]);

            if (error && !error.message.includes('duplicate')) {
              console.error(`       ❌ Error inserting entry: ${error.message}`);
            }
          }

          totalEntries += entries.length;
          successfulEvents++;
          console.log(`    💾 Saved ${entries.length} entries to database`);
        }

        // Wait between events to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (eventError) {
        console.error(`    ❌ Error scraping event: ${eventError.message}`);
      }
    }

    await browser.close();

    console.log(`\n  ✅ Processed ${successfulEvents} events`);
    console.log(`  📊 Total entries scraped: ${totalEntries}`);

    return { success: true, events: successfulEvents, entries: totalEntries };

  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    await browser.close();
    return { success: false, reason: error.message };
  }
}

// Main execution
async function main() {
  const meetId = process.argv[2] || 1;

  console.log(`\n🎯 EVENT ENTRIES SCRAPER\n`);
  console.log('='.repeat(60));

  const result = await scrapeEntriesForMeet(meetId);

  console.log('\n' + '='.repeat(60));
  if (result.success) {
    console.log(`✅ Success!`);
    console.log(`   Events: ${result.events}`);
    console.log(`   Entries: ${result.entries}`);
  } else {
    console.log(`❌ Failed: ${result.reason}`);
  }
  console.log('='.repeat(60) + '\n');
}

// Export for use in other scripts
module.exports = {
  scrapeEntriesForMeet
};

// Run main if executed directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('🚨 Fatal error:', error);
      process.exit(1);
    });
}
