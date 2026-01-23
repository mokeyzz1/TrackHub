// Upload live meet results to Supabase
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials!');
  console.error('SUPABASE_URL:', supabaseUrl ? 'SET' : 'MISSING');
  console.error('SUPABASE_KEY:', supabaseKey ? 'SET' : 'MISSING');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function scrapeLiveMeet(meetUrl) {
  console.log(`🏃 Scraping live meet: ${meetUrl}\n`);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Extract structured results
  const meetData = await page.evaluate(() => {
    const results = [];

    // Find all result rows (teams/athletes)
    const rows = document.querySelectorAll('.results-table--row');

    rows.forEach(row => {
      try {
        const placeEl = row.querySelector('.results-table--place');
        const containerTop = row.querySelector('.results-table--container--top');

        if (placeEl && containerTop) {
          const place = placeEl.textContent.trim();

          // Get all text from container, then extract team name and times
          const fullText = containerTop.textContent.trim();

          // Split by whitespace and filter out the place number
          const parts = fullText.split(/\s+/).filter(p => p && p !== place);

          // Times are usually at the end (format: MM:SS.SS or SS.SS)
          const timeRegex = /^\d+:\d+\.\d+$|^\d+\.\d+$/;
          const times = parts.filter(p => timeRegex.test(p));

          // Team name is everything before the times
          const teamParts = [];
          for (let i = 0; i < parts.length; i++) {
            if (!timeRegex.test(parts[i])) {
              teamParts.push(parts[i]);
            } else {
              break;
            }
          }

          const teamName = teamParts.join(' ');
          const primaryTime = times[0] || null;

          if (teamName && primaryTime) {
            results.push({
              place: place,
              name: teamName,
              time: primaryTime,
              splits: times.slice(1), // Additional split times if available
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (e) {
        // Skip malformed rows
      }
    });

    // Get event info from the page
    const bodyText = document.body.innerText;
    const eventMatch = bodyText.match(/(Boys|Girls|Men|Women)\s+[^\n]+?m/);
    const eventName = eventMatch ? eventMatch[0] : null;

    // Meet name from page title or header
    const meetName = document.querySelector('h1')?.textContent.trim() ||
                     bodyText.split('\n')[0] ||
                     null;

    return {
      meetName,
      eventName,
      results,
      scrapedAt: new Date().toISOString(),
      totalResults: results.length
    };
  });

  await browser.close();

  return meetData;
}

async function uploadResultsToSupabase(meetData, meetUrl) {
  console.log('\n📤 Uploading results to Supabase...\n');

  const { meetName, eventName, results } = meetData;

  if (!eventName || results.length === 0) {
    console.error('❌ No valid results to upload');
    return { success: false, uploaded: 0 };
  }

  let uploaded = 0;
  let errors = 0;

  // Process each result
  for (const result of results) {
    try {
      const resultRecord = {
        meet_url: meetUrl,
        meet_name: meetName,
        event_name: eventName,
        participant_name: result.name,
        place: parseInt(result.place) || null,
        mark_raw: result.time,
        mark_seconds: parseTimeToSeconds(result.time),
        splits: result.splits || [],
        scraped_at: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0], // Today's date
        round: 'LIVE',
        is_processed: false,
      };

      const { data, error } = await supabase
        .from('live_results')
        .insert(resultRecord);

      if (error) {
        console.error(`❌ Error uploading ${result.name}:`, error.message);
        errors++;
      } else {
        console.log(`✅ ${result.place}. ${result.name} - ${result.time}`);
        uploaded++;
      }
    } catch (e) {
      console.error(`❌ Exception uploading ${result.name}:`, e.message);
      errors++;
    }
  }

  console.log(`\n📊 Upload Summary:`);
  console.log(`   Uploaded: ${uploaded}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Total: ${results.length}`);

  return { success: uploaded > 0, uploaded, errors };
}

function parseTimeToSeconds(timeStr) {
  // Convert MM:SS.ss or SS.ss to seconds
  if (!timeStr) return null;

  const parts = timeStr.split(':');
  if (parts.length === 2) {
    // MM:SS.ss format
    const minutes = parseInt(parts[0]);
    const seconds = parseFloat(parts[1]);
    return minutes * 60 + seconds;
  } else {
    // SS.ss format
    return parseFloat(timeStr);
  }
}

async function main() {
  const meetUrl = process.argv[2];

  if (!meetUrl) {
    console.error('❌ Usage: node upload_live_results.js <meet-url>');
    process.exit(1);
  }

  try {
    // Step 1: Scrape the meet
    const meetData = await scrapeLiveMeet(meetUrl);

    console.log(`\n📊 SCRAPED RESULTS:`);
    console.log(`   Meet: ${meetData.meetName}`);
    console.log(`   Event: ${meetData.eventName}`);
    console.log(`   Results: ${meetData.totalResults}\n`);

    if (meetData.totalResults === 0) {
      console.error('❌ No results found on page');
      process.exit(1);
    }

    // Step 2: Upload to Supabase
    const uploadResult = await uploadResultsToSupabase(meetData, meetUrl);

    if (uploadResult.success) {
      console.log('\n✅ Live results successfully uploaded to Supabase!');
    } else {
      console.error('\n❌ Failed to upload results to Supabase');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
