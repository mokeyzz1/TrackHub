// Black Squirrel Timing specific results scraper
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Scrape results from Black Squirrel Timing
 * The page structure uses Angular with results displayed in plain text format
 */
async function scrapeBlackSquirrelResults(meetId, meet) {
  console.log('🐿️  Black Squirrel Timing Scraper\n');
  console.log(`Meet: ${meet.name}`);
  console.log(`URL: ${meet.meet_url}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  let totalResults = 0;
  let successfulEvents = 0;

  try {
    const page = await browser.newPage();

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

    console.log(`📋 Processing ${events.length} events\n`);

    // Navigate to meet page
    await page.goto(meet.meet_url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Find event links
    const eventLinks = await page.evaluate(() => {
      const links = [];
      document.querySelectorAll('a').forEach(a => {
        const text = a.textContent.trim();
        const href = a.href;

        // Look for links with "Results" in them
        if (text.includes('Results') && href.includes('/event/')) {
          links.push({
            text: text,
            href: href
          });
        }
      });
      return links;
    });

    console.log(`🔗 Found ${eventLinks.length} event result links\n`);

    // Process each event
    for (const event of events) {
      console.log(`  📋 ${event.event_name}`);

      // Find matching link
      const matchingLink = eventLinks.find(link => {
        const linkName = link.text.replace(/Results/gi, '').trim();
        const eventName = event.event_name.trim();

        return linkName.toLowerCase().includes(eventName.toLowerCase()) ||
               eventName.toLowerCase().includes(linkName.toLowerCase());
      });

      if (!matchingLink) {
        console.log(`     ⚠️  No matching link found`);
        continue;
      }

      // Navigate to event page
      await page.goto(matchingLink.href, { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Parse results from page text
      const results = await page.evaluate(() => {
        const pageText = document.body.textContent;
        const results = [];

        // Find the results section - it's between the event name and footer
        // Results format:
        // 1  Adrianna Rodencal  Concordia (Neb.) 8.43NAIA AUTO Meet Fieldhouse New NAIA #1 PR • +1032 • H3 • Yr: SR

        // Split by lines
        const lines = pageText.split('\n');
        let inResultsSection = false;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();

          // Start collecting when we see "Results" and numbers
          if (line.includes('Results') || line.match(/^View:/)) {
            inResultsSection = true;
            continue;
          }

          // Stop when we hit footer content
          if (line.includes('Timed by Black Squirrel') ||
              line.includes('FilterSchedule') ||
              line.includes('FeaturesProfessional')) {
            break;
          }

          if (inResultsSection && line) {
            // Match pattern: place (number) followed by name and school
            // Example: "1  Adrianna Rodencal  Concordia (Neb.) 8.43NAIA AUTO"
            const placeMatch = line.match(/^(\d+)\s+(.+)/);

            if (placeMatch) {
              const place = parseInt(placeMatch[1]);
              const rest = placeMatch[2];

              // Extract athlete name, team, and mark
              // Pattern: Name  Team Mark...
              const parts = rest.split(/\s{2,}/); // Split on 2+ spaces

              if (parts.length >= 2) {
                const athleteName = parts[0].trim();
                const teamAndMark = parts.slice(1).join('  ');

                // Extract team (in parentheses) and mark
                const teamMatch = teamAndMark.match(/([^\s]+(?:\s+\([^)]+\))?)\s+([\d:.]+)/);

                let team = null;
                let mark = null;

                if (teamMatch) {
                  team = teamMatch[1].trim();
                  mark = teamMatch[2].trim();
                } else {
                  // Fallback: just try to find any team name and number
                  const words = teamAndMark.split(/\s+/);
                  team = words[0];
                  mark = words.find(w => w.match(/^[\d:.]+$/));
                }

                results.push({
                  place: place,
                  athlete: athleteName,
                  team: team,
                  mark: mark
                });
              }
            }
          }
        }

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
      if (results.length > 0) {
        successfulEvents++;
      }

      // Small delay between events
      await new Promise(resolve => setTimeout(resolve, 1000));
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
  scrapeBlackSquirrelResults
};
