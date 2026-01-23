// Multi-Event Live Meet Scraper - Handles all simultaneous events at a meet
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function parseTimeToSeconds(timeStr) {
  if (!timeStr || timeStr === 'In Progress' || timeStr === 'DNS' || timeStr === 'DNF') {
    return null;
  }

  const parts = timeStr.split(':');
  if (parts.length === 2) {
    const minutes = parseInt(parts[0]);
    const seconds = parseFloat(parts[1]);
    return minutes * 60 + seconds;
  } else {
    return parseFloat(timeStr);
  }
}

async function scrapeEvent(page, eventUrl, meetName) {
  console.log(`\n🎯 Scraping event: ${eventUrl}`);

  try {
    await page.goto(eventUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for rendering

    const eventData = await page.evaluate(() => {
      const results = [];

      // Find all result rows
      const rows = document.querySelectorAll('.results-table--row');

      rows.forEach(row => {
        try {
          const placeEl = row.querySelector('.results-table--place');
          const containerTop = row.querySelector('.results-table--container--top');

          if (placeEl && containerTop) {
            const place = placeEl.textContent.trim();
            const fullText = containerTop.textContent.trim();
            const parts = fullText.split(/\s+/).filter(p => p && p !== place);

            // Times are usually at the end (format: MM:SS.SS or SS.SS)
            const timeRegex = /^\d+:\d+\.\d+$|^\d+\.\d+$/;
            const times = parts.filter(p => timeRegex.test(p));

            // Participant name is everything before the times
            const nameParts = [];
            for (let i = 0; i < parts.length; i++) {
              if (!timeRegex.test(parts[i])) {
                nameParts.push(parts[i]);
              } else {
                break;
              }
            }

            const participantName = nameParts.join(' ');
            const primaryTime = times[0] || 'In Progress';

            results.push({
              place: place,
              name: participantName,
              time: primaryTime,
              splits: times.slice(1),
              timestamp: new Date().toISOString()
            });
          }
        } catch (e) {
          // Skip malformed rows
        }
      });

      // Get event name from page
      const bodyText = document.body.innerText;
      const eventMatch = bodyText.match(/(Boys|Girls|Men|Women|Mixed)\s+[^\n]+?(?:m|Meter|Relay|Jump|Throw|Vault)/i);
      const eventName = eventMatch ? eventMatch[0] : 'Unknown Event';

      return {
        eventName,
        results,
        totalResults: results.length
      };
    });

    console.log(`   ✅ ${eventData.eventName}: ${eventData.totalResults} results`);

    return {
      ...eventData,
      eventUrl,
      meetName,
      scrapedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error(`   ❌ Error scraping event: ${error.message}`);
    return null;
  }
}

async function uploadEventResults(eventData) {
  if (!eventData || !eventData.results || eventData.results.length === 0) {
    return { uploaded: 0, errors: 0 };
  }

  const { meetName, eventName, eventUrl, results } = eventData;

  let uploaded = 0;
  let errors = 0;

  for (const result of results) {
    try {
      const resultRecord = {
        meet_url: eventUrl,
        meet_name: meetName,
        event_name: eventName,
        participant_name: result.name,
        place: parseInt(result.place) || null,
        mark_raw: result.time,
        mark_seconds: parseTimeToSeconds(result.time),
        splits: result.splits || [],
        scraped_at: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        round: 'LIVE',
        is_processed: false,
      };

      // Check if this exact result already exists (avoid duplicates)
      const { data: existing } = await supabase
        .from('live_results')
        .select('live_result_id')
        .eq('meet_url', eventUrl)
        .eq('event_name', eventName)
        .eq('participant_name', result.name)
        .eq('place', parseInt(result.place) || null)
        .eq('mark_raw', result.time)
        .single();

      if (existing) {
        // Update the scraped_at timestamp
        await supabase
          .from('live_results')
          .update({ scraped_at: new Date().toISOString() })
          .eq('live_result_id', existing.live_result_id);
        uploaded++;
      } else {
        // Insert new result
        const { error } = await supabase
          .from('live_results')
          .insert(resultRecord);

        if (error) {
          console.error(`      ❌ ${result.name}: ${error.message}`);
          errors++;
        } else {
          uploaded++;
        }
      }
    } catch (e) {
      console.error(`      ❌ ${result.name}: ${e.message}`);
      errors++;
    }
  }

  return { uploaded, errors };
}

async function discoverEvents(page, meetUrl) {
  console.log(`🔍 Discovering all events at meet...`);

  await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(resolve => setTimeout(resolve, 3000));

  const eventLinks = await page.evaluate(() => {
    const links = [];

    // Find all event links - they typically contain /live/track/ or /live/field/
    const allLinks = document.querySelectorAll('a[href*="/live/"]');

    allLinks.forEach(link => {
      const href = link.href;
      const text = link.textContent.trim();

      // Filter for actual event pages (not navigation links)
      if ((href.includes('/track/') || href.includes('/field/')) &&
          text.match(/(Boys|Girls|Men|Women|Mixed)/i)) {
        links.push({
          url: href,
          name: text
        });
      }
    });

    return links;
  });

  // Remove duplicates
  const uniqueEvents = Array.from(
    new Map(eventLinks.map(e => [e.url, e])).values()
  );

  console.log(`   Found ${uniqueEvents.length} events\n`);

  return uniqueEvents;
}

async function scrapeMultiEventMeet(meetUrl) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🏃 MULTI-EVENT LIVE MEET SCRAPER`);
  console.log(`${'='.repeat(60)}\n`);
  console.log(`Meet URL: ${meetUrl}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    // Get meet name from main page
    await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    const meetName = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      if (h1) return h1.textContent.trim();

      const bodyText = document.body.innerText;
      return bodyText.split('\n')[0] || 'Unknown Meet';
    });

    console.log(`📋 Meet: ${meetName}\n`);

    // Discover all events
    const events = await discoverEvents(page, meetUrl);

    if (events.length === 0) {
      console.log(`❌ No events found! This might be a specific event page.`);
      console.log(`💡 Trying to scrape current page as single event...\n`);

      // Scrape current page as single event
      const eventData = await scrapeEvent(page, meetUrl, meetName);
      if (eventData) {
        const { uploaded, errors } = await uploadEventResults(eventData);
        console.log(`\n✅ Uploaded: ${uploaded} | ❌ Errors: ${errors}`);
      }

      await browser.close();
      return;
    }

    // Scrape all events
    let totalResults = 0;
    let totalUploaded = 0;
    let totalErrors = 0;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      console.log(`\n[${i + 1}/${events.length}] ${event.name}`);

      const eventData = await scrapeEvent(page, event.url, meetName);

      if (eventData) {
        totalResults += eventData.totalResults;

        // Upload results
        console.log(`   📤 Uploading to Supabase...`);
        const { uploaded, errors } = await uploadEventResults(eventData);
        totalUploaded += uploaded;
        totalErrors += errors;
        console.log(`   ✅ Uploaded: ${uploaded} | ❌ Errors: ${errors}`);
      }

      // Small delay between events to be polite
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 SUMMARY`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Meet: ${meetName}`);
    console.log(`Events Scraped: ${events.length}`);
    console.log(`Total Results: ${totalResults}`);
    console.log(`Uploaded: ${totalUploaded}`);
    console.log(`Errors: ${totalErrors}`);
    console.log(`${'='.repeat(60)}\n`);

  } catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

// CLI Usage
const meetUrl = process.argv[2];

if (!meetUrl) {
  console.log(`
Usage: node multi_event_live_scraper.js <meet_url>

Example:
  node multi_event_live_scraper.js https://live.jdlfasttrack.com/meets/54336

This will:
  1. Discover all events at the meet
  2. Scrape results from each event
  3. Upload all results to Supabase
  4. Handle multiple simultaneous events
  `);
  process.exit(1);
}

scrapeMultiEventMeet(meetUrl).catch(console.error);
