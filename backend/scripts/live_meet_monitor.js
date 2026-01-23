// Automated Live Meet Monitor - Polls meet every 30 seconds and uploads results
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

// Configuration
let POLL_INTERVAL = 30000; // 30 seconds
const MAX_ERRORS = 5; // Stop after 5 consecutive errors

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

async function scrapeEvent(page, eventUrl, meetName, pollCount) {
  try {
    await page.goto(eventUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    const eventData = await page.evaluate(() => {
      const results = [];
      const rows = document.querySelectorAll('.results-table--row');

      rows.forEach(row => {
        try {
          const placeEl = row.querySelector('.results-table--place');
          const containerTop = row.querySelector('.results-table--container--top');

          if (placeEl && containerTop) {
            const place = placeEl.textContent.trim();
            const fullText = containerTop.textContent.trim();
            const parts = fullText.split(/\s+/).filter(p => p && p !== place);

            const timeRegex = /^\d+:\d+\.\d+$|^\d+\.\d+$/;
            const times = parts.filter(p => timeRegex.test(p));

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

      const bodyText = document.body.innerText;
      const eventMatch = bodyText.match(/(Boys|Girls|Men|Women|Mixed)\s+[^\n]+?(?:m|Meter|Relay|Jump|Throw|Vault)/i);
      const eventName = eventMatch ? eventMatch[0] : 'Unknown Event';

      return {
        eventName,
        results,
        totalResults: results.length
      };
    });

    return {
      ...eventData,
      eventUrl,
      meetName,
      scrapedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error(`      ❌ Error scraping: ${error.message}`);
    return null;
  }
}

async function uploadEventResults(eventData, pollCount) {
  if (!eventData || !eventData.results || eventData.results.length === 0) {
    return { uploaded: 0, updated: 0, errors: 0 };
  }

  const { meetName, eventName, eventUrl, results } = eventData;

  let uploaded = 0;
  let updated = 0;
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

      // Check if this result exists
      const { data: existing } = await supabase
        .from('live_results')
        .select('live_result_id, mark_raw, place')
        .eq('meet_url', eventUrl)
        .eq('event_name', eventName)
        .eq('participant_name', result.name)
        .maybeSingle();

      if (existing) {
        // Check if time or place changed
        if (existing.mark_raw !== result.time || existing.place !== parseInt(result.place)) {
          await supabase
            .from('live_results')
            .update({
              mark_raw: result.time,
              mark_seconds: parseTimeToSeconds(result.time),
              place: parseInt(result.place) || null,
              splits: result.splits || [],
              scraped_at: new Date().toISOString()
            })
            .eq('live_result_id', existing.live_result_id);
          updated++;
        } else {
          // Just update timestamp
          await supabase
            .from('live_results')
            .update({ scraped_at: new Date().toISOString() })
            .eq('live_result_id', existing.live_result_id);
        }
      } else {
        // New result
        const { error } = await supabase
          .from('live_results')
          .insert(resultRecord);

        if (error) {
          errors++;
        } else {
          uploaded++;
        }
      }
    } catch (e) {
      errors++;
    }
  }

  return { uploaded, updated, errors };
}

async function discoverEvents(page, meetUrl) {
  await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(resolve => setTimeout(resolve, 2000));

  const eventLinks = await page.evaluate(() => {
    const links = [];
    const allLinks = document.querySelectorAll('a[href*="/live/"]');

    allLinks.forEach(link => {
      const href = link.href;
      const text = link.textContent.trim();

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

  const uniqueEvents = Array.from(
    new Map(eventLinks.map(e => [e.url, e])).values()
  );

  return uniqueEvents;
}

async function monitorMeet(meetUrl) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔴 LIVE MEET MONITOR - STARTED`);
  console.log(`${'='.repeat(70)}\n`);
  console.log(`Meet URL: ${meetUrl}`);
  console.log(`Poll Interval: ${POLL_INTERVAL / 1000} seconds`);
  console.log(`\nPress Ctrl+C to stop monitoring\n`);
  console.log(`${'='.repeat(70)}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Get meet name
  await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  const meetName = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    if (h1) return h1.textContent.trim();
    const bodyText = document.body.innerText;
    return bodyText.split('\n')[0] || 'Unknown Meet';
  });

  console.log(`📋 Meet: ${meetName}\n`);

  // Discover events once
  console.log(`🔍 Discovering events...\n`);
  let events = await discoverEvents(page, meetUrl);

  if (events.length === 0) {
    console.log(`⚠️  No events found via navigation. Using main URL as single event.\n`);
    events = [{ url: meetUrl, name: 'Main Event' }];
  } else {
    console.log(`   Found ${events.length} events:\n`);
    events.forEach((event, i) => {
      console.log(`   ${i + 1}. ${event.name}`);
    });
    console.log();
  }

  let pollCount = 0;
  let consecutiveErrors = 0;

  // Polling loop
  while (consecutiveErrors < MAX_ERRORS) {
    pollCount++;
    const pollTime = new Date().toLocaleTimeString();

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`📡 POLL #${pollCount} - ${pollTime}`);
    console.log(`${'─'.repeat(70)}\n`);

    let hadError = false;
    let totalNew = 0;
    let totalUpdated = 0;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      console.log(`[${i + 1}/${events.length}] ${event.name}`);

      const eventData = await scrapeEvent(page, event.url, meetName, pollCount);

      if (eventData) {
        console.log(`   ✅ Scraped ${eventData.totalResults} results`);

        const { uploaded, updated, errors } = await uploadEventResults(eventData, pollCount);

        if (uploaded > 0 || updated > 0) {
          console.log(`   📤 New: ${uploaded} | Updated: ${updated} | Errors: ${errors}`);
          totalNew += uploaded;
          totalUpdated += updated;
        } else {
          console.log(`   ⏺️  No changes`);
        }

        consecutiveErrors = 0; // Reset error counter on success
      } else {
        hadError = true;
        console.log(`   ⚠️  Failed to scrape`);
      }

      // Small delay between events
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (hadError) {
      consecutiveErrors++;
    }

    console.log(`\n💾 Summary: ${totalNew} new, ${totalUpdated} updated`);

    if (consecutiveErrors > 0) {
      console.log(`⚠️  Consecutive errors: ${consecutiveErrors}/${MAX_ERRORS}`);
    }

    // Wait for next poll
    console.log(`\n⏳ Waiting ${POLL_INTERVAL / 1000} seconds until next poll...\n`);
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }

  console.log(`\n❌ Too many consecutive errors. Stopping monitor.\n`);
  await browser.close();
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n🛑 Stopping monitor...\n');
  process.exit(0);
});

// CLI Usage
const meetUrl = process.argv[2];
const customInterval = parseInt(process.argv[3]);

if (!meetUrl) {
  console.log(`
Usage: node live_meet_monitor.js <meet_url> [interval_seconds]

Example:
  node live_meet_monitor.js https://live.jdlfasttrack.com/meets/54336 30

This will:
  1. Discover all events at the meet
  2. Poll every 30 seconds (or custom interval)
  3. Upload new/updated results to Supabase
  4. Show live updates in console
  5. Run until you press Ctrl+C or 5 errors occur

Press Ctrl+C to stop monitoring.
  `);
  process.exit(1);
}

if (customInterval && customInterval > 0) {
  POLL_INTERVAL = customInterval * 1000;
}

monitorMeet(meetUrl).catch(console.error);
