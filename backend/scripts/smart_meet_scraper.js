// Smart Meet Scraper - Routes to appropriate scraper based on meet status
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const { detectMeetStatus } = require('./detect_meet_status');
require('dotenv').config({ path: path.join(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Smart scraper that detects meet status and routes to appropriate scraper
 */
async function smartScrapeMeet(meetId) {
  console.log(`\n🎯 SMART MEET SCRAPER\n`);
  console.log('='.repeat(60));

  // Get meet from database
  const { data: meet, error: meetError } = await supabase
    .from('meets')
    .select('*')
    .eq('meet_id', meetId)
    .single();

  if (meetError || !meet) {
    console.error('❌ Meet not found:', meetError);
    return { success: false, reason: 'meet_not_found' };
  }

  if (!meet.meet_url) {
    console.error('❌ No URL for this meet');
    return { success: false, reason: 'no_url' };
  }

  console.log(`📍 Meet: ${meet.name}`);
  console.log(`📅 Date: ${meet.date}`);
  console.log(`🔗 URL: ${meet.meet_url}`);
  console.log('');

  // Detect meet status
  console.log('🔍 Detecting meet status...');
  let status;

  try {
    status = await detectMeetStatus(meet.meet_url);
  } catch (error) {
    console.log(`   ⚠️  Status detection failed: ${error.message}`);
    status = { platform: 'unknown', status: 'unknown', completedEvents: 0, totalEvents: 0 };
  }

  // If status is unknown, use date-based heuristic
  if (status.status === 'unknown') {
    const meetDate = new Date(meet.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    meetDate.setHours(0, 0, 0, 0);

    if (meetDate > today) {
      status.status = 'upcoming';
      console.log(`   📅 Using date-based detection: meet is in future → UPCOMING`);
    } else if (meetDate.getTime() === today.getTime()) {
      status.status = 'live';
      console.log(`   📅 Using date-based detection: meet is today → LIVE`);
    } else {
      status.status = 'completed';
      console.log(`   📅 Using date-based detection: meet is in past → COMPLETED`);
    }
  }

  console.log(`\n📊 Status: ${status.status.toUpperCase()}`);
  console.log(`   Platform: ${status.platform}`);
  console.log(`   Events: ${status.completedEvents}/${status.totalEvents} completed`);
  if (status.confidence) {
    console.log(`   Confidence: ${status.confidence}`);
  }

  // Update meet status in database
  await supabase
    .from('meets')
    .update({
      status: status.status,
      updated_at: new Date().toISOString()
    })
    .eq('meet_id', meetId);

  console.log('\n' + '='.repeat(60));

  // Check if we have events scraped for this meet
  const { data: events } = await supabase
    .from('events')
    .select('event_id')
    .eq('meet_id', meetId);

  const hasEvents = events && events.length > 0;

  if (!hasEvents) {
    console.log('\n⚠️  No events found - must scrape events first');
    console.log('   → Attempting to scrape event list from meet page\n');

    // Try to scrape events using scrape_meet_details
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.goto(meet.meet_url, { waitUntil: 'networkidle2', timeout: 60000 });

      // Try to find event links or divs
      const eventElements = await page.evaluate(() => {
        const events = [];

        // Look for links with /event/ in href
        const links = Array.from(document.querySelectorAll('a[href*="/event"]'));
        links.forEach(link => {
          const text = link.textContent.trim();
          if (text && text.length > 3) {
            events.push({ name: text, url: link.href });
          }
        });

        // If no links found, look for event names in the page
        if (events.length === 0) {
          // Look for common event name patterns
          const allText = document.body.textContent;
          const eventPatterns = [
            /\b\d+m?\b/g,  // 100m, 200, etc.
            /\b\d+ Meter/gi,  // 100 Meter
            /\bHigh Jump\b/gi,
            /\bLong Jump\b/gi,
            /\bShot Put\b/gi,
            /\bDiscus\b/gi
          ];

          // This is a fallback - we'll just note that events exist
          console.log('Found event text patterns but no structured event links');
        }

        return events;
      });

      console.log(`   Found ${eventElements.length} potential events on page`);

      await browser.close();

      if (eventElements.length === 0) {
        console.log('   ❌ Could not discover events - platform may not be supported yet');
        return { success: false, reason: 'unsupported_platform', platform: status.platform };
      }

      // Save discovered events
      for (const event of eventElements.slice(0, 20)) {  // Limit to first 20
        await supabase
          .from('events')
          .insert([{
            meet_id: meetId,
            event_name: event.name,
            event_type: event.name.toLowerCase().includes('jump') ||
                       event.name.toLowerCase().includes('throw') ||
                       event.name.toLowerCase().includes('shot') ||
                       event.name.toLowerCase().includes('discus') ||
                       event.name.toLowerCase().includes('javelin')
                       ? 'field' : 'track',
            gender: event.name.toLowerCase().includes('women') ||
                   event.name.toLowerCase().includes('girls') ? 'F' :
                   event.name.toLowerCase().includes('men') ||
                   event.name.toLowerCase().includes('boys') ? 'M' : 'Mixed',
            created_at: new Date().toISOString()
          }])
          .then(({ error }) => {
            if (error && !error.message.includes('duplicate')) {
              console.error(`     Error saving event: ${error.message}`);
            }
          });
      }

      console.log(`   ✅ Saved ${Math.min(eventElements.length, 20)} events\n`);

    } catch (error) {
      await browser.close();
      console.error(`   ❌ Error discovering events: ${error.message}`);
      return { success: false, reason: 'event_discovery_failed', error: error.message };
    }
  }

  // Route to appropriate scraper
  let result;

  if (status.status === 'upcoming') {
    console.log('\n📋 SCRAPING MODE: Starting Lists / Entries');
    console.log('   → Will scrape event entries\n');

    // Scrape event entries
    const { scrapeEntriesForMeet } = require('./scrape_event_entries');
    result = await scrapeEntriesForMeet(meetId);

  } else if (status.status === 'live') {
    console.log('\n🔴 SCRAPING MODE: Live Results');
    console.log('   → Will populate live_results table\n');

    // TODO: Implement live results scraper
    result = { success: false, reason: 'live_scraper_not_implemented' };

  } else if (status.status === 'completed') {
    console.log('\n✅ SCRAPING MODE: Final Results');
    console.log('   → Will populate live_results table with final=true\n');

    // Import and run final results scraper
    const { scrapeFinalResults } = require('./scrape_final_results');
    result = await scrapeFinalResults(meetId, meet, status);

  } else {
    console.log('\n⚠️  UNKNOWN STATUS - Skipping');
    return { success: false, reason: 'unknown_status', status };
  }

  console.log('\n' + '='.repeat(60));
  return result;
}

// Main execution
async function main() {
  const meetId = process.argv[2];

  if (!meetId) {
    console.error('Usage: node smart_meet_scraper.js <meet_id>');
    process.exit(1);
  }

  const result = await smartScrapeMeet(parseInt(meetId));

  console.log('\n📊 SCRAPING SUMMARY');
  console.log('='.repeat(60));

  if (result.success) {
    console.log('✅ Success!');
    if (result.events !== undefined) {
      console.log(`   Events processed: ${result.events}`);
    }
    if (result.entries !== undefined) {
      console.log(`   Entries scraped: ${result.entries}`);
    }
    if (result.results !== undefined) {
      console.log(`   Results scraped: ${result.results}`);
    }
  } else {
    console.log(`❌ Failed: ${result.reason}`);
  }

  console.log('='.repeat(60) + '\n');
}

// Export for use in other scripts
module.exports = {
  smartScrapeMeet
};

// Run if executed directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('🚨 Fatal error:', error);
      process.exit(1);
    });
}
