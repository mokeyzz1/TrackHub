// Master scraper that populates events, results, teams, and athletes for meets
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Detect platform from URL
function detectPlatform(url) {
  if (url.includes('athletic.net')) return 'athletic_net';
  if (url.includes('milesplit.live')) return 'milesplit';
  if (url.includes('jdlfasttrack.com')) return 'jdl';
  if (url.includes('tfrrs.org')) return 'tfrrs';
  return 'unknown';
}

// Parse gender from event name
function parseGender(eventName) {
  const normalized = eventName.toLowerCase();
  // Check for male indicators
  if (normalized.startsWith('men ') || normalized.startsWith('boys ') ||
      normalized.includes("men's") || normalized.includes(' men ') ||
      normalized.match(/^men\s/)) {
    return 'M';
  }
  // Check for female indicators
  if (normalized.startsWith('women ') || normalized.startsWith('girls ') ||
      normalized.includes("women's") || normalized.includes(' women ') ||
      normalized.match(/^women\s/)) {
    return 'F';
  }
  return 'Mixed';
}

// Parse event type
function parseEventType(eventName) {
  const normalized = eventName.toLowerCase();
  const fieldEvents = ['shot put', 'discus', 'javelin', 'hammer', 'high jump', 'long jump', 'triple jump', 'pole vault'];
  if (fieldEvents.some(event => normalized.includes(event))) return 'field';
  return 'track';
}

// Scrape Athletic.net meet
async function scrapeAthleticNet(page, meetUrl, meetId) {
  console.log('  Scraping Athletic.net...');

  await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 3000));

  const data = await page.evaluate(() => {
    const events = [];
    const results = [];
    const teams = new Set();
    const athletes = new Set();

    // Try to find event listings
    const eventLinks = document.querySelectorAll('a[href*="/event/"]');
    eventLinks.forEach(link => {
      const eventName = link.textContent.trim();
      if (eventName && eventName.length > 3) {
        events.push({ name: eventName });
      }
    });

    // Try to find results tables
    const resultRows = document.querySelectorAll('tr');
    resultRows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 3) {
        const place = cells[0]?.textContent.trim();
        const name = cells[1]?.textContent.trim();
        const mark = cells[2]?.textContent.trim();

        if (name && mark && !isNaN(parseInt(place))) {
          results.push({ place: parseInt(place), athlete: name, mark });

          // Extract team from athlete name (usually after last space)
          const parts = name.split(' ');
          if (parts.length > 2) {
            const team = parts.slice(-1)[0];
            teams.add(team);
          }
          athletes.add(name);
        }
      }
    });

    return {
      events: Array.from(events),
      results: Array.from(results),
      teams: Array.from(teams),
      athletes: Array.from(athletes)
    };
  });

  return data;
}

// Scrape MileSplit meet
async function scrapeMileSplit(page, meetUrl, meetId) {
  console.log('  Scraping MileSplit...');

  await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 3000));

  const data = await page.evaluate(() => {
    const events = [];
    const results = [];
    const teams = new Set();
    const athletes = new Set();

    // MileSplit structure - look for event divs
    const eventElements = document.querySelectorAll('[class*="event"]');
    eventElements.forEach(el => {
      const eventName = el.querySelector('h2, h3, .event-name')?.textContent.trim();
      if (eventName && eventName.length > 3) {
        events.push({ name: eventName });
      }
    });

    // Look for result tables
    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
      const rows = table.querySelectorAll('tbody tr');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
          const place = cells[0]?.textContent.trim();
          const name = cells[1]?.textContent.trim();
          const mark = cells[2]?.textContent.trim();

          if (name && mark) {
            results.push({ place: parseInt(place) || null, athlete: name, mark });
            athletes.add(name);
          }
        }
      });
    });

    return {
      events: Array.from(events),
      results: Array.from(results),
      teams: Array.from(teams),
      athletes: Array.from(athletes)
    };
  });

  return data;
}

// Main scraper function
async function scrapeMeet(meet) {
  const { meet_id, name, meet_url } = meet;

  if (!meet_url) {
    console.log(`  �  Skipping ${name} - no URL`);
    return { success: false, reason: 'no_url' };
  }

  console.log(`\n=� Scraping: ${name}`);
  console.log(`   URL: ${meet_url}`);

  const platform = detectPlatform(meet_url);
  console.log(`   Platform: ${platform}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    let data;
    if (platform === 'athletic_net') {
      data = await scrapeAthleticNet(page, meet_url, meet_id);
    } else if (platform === 'milesplit') {
      data = await scrapeMileSplit(page, meet_url, meet_id);
    } else {
      console.log(`  �  Platform ${platform} not yet supported`);
      await browser.close();
      return { success: false, reason: 'unsupported_platform' };
    }

    console.log(`\n  =� Scraped:`);
    console.log(`     Events: ${data.events.length}`);
    console.log(`     Results: ${data.results.length}`);
    console.log(`     Teams: ${data.teams.length}`);
    console.log(`     Athletes: ${data.athletes.length}`);

    // Insert events into database
    if (data.events.length > 0) {
      for (const event of data.events) {
        const gender = parseGender(event.name);
        const eventType = parseEventType(event.name);

        const { error } = await supabase
          .from('events')
          .insert([{
            meet_id: meet_id,
            event_name: event.name,
            event_type: eventType,
            gender: gender,
            status: 'scheduled',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]);

        if (error && !error.message.includes('duplicate')) {
          console.error(`     L Error inserting event: ${error.message}`);
        }
      }
      console.log(`   Saved ${data.events.length} events to database`);
    }

    // Insert results into live_results table
    if (data.results.length > 0) {
      for (const result of data.results) {
        const { error } = await supabase
          .from('live_results')
          .insert([{
            meet_url: meet_url,
            meet_name: name,
            event_name: result.event || 'Unknown Event',
            participant_name: result.athlete,
            place: result.place,
            mark_raw: result.mark,
            scraped_at: new Date().toISOString(),
            date: meet.date,
            round: 'FINAL'
          }]);

        if (error && !error.message.includes('duplicate')) {
          console.error(`     L Error inserting result: ${error.message}`);
        }
      }
      console.log(`   Saved ${data.results.length} results to database`);
    }

    await browser.close();
    return { success: true, data };

  } catch (error) {
    console.error(`  L Error scraping: ${error.message}`);
    await browser.close();
    return { success: false, reason: error.message };
  }
}

// Main execution
async function main() {
  const limit = process.argv[2] ? parseInt(process.argv[2]) : 5;

  console.log(`\n=� Starting meet details scraper (limit: ${limit})\n`);
  console.log('='.repeat(60));

  // Get meets from database
  const { data: meets, error } = await supabase
    .from('meets')
    .select('*')
    .not('meet_url', 'is', null)
    .limit(limit);

  if (error) {
    console.error('L Error fetching meets:', error);
    process.exit(1);
  }

  console.log(`\n=� Found ${meets.length} meets to scrape\n`);

  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (const meet of meets) {
    const result = await scrapeMeet(meet);

    if (result.success) {
      successCount++;
    } else if (result.reason === 'no_url') {
      skippedCount++;
    } else {
      errorCount++;
    }

    // Wait between meets to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n' + '='.repeat(60));
  console.log('=� Summary:');
  console.log(`    Success: ${successCount}`);
  console.log(`   L Errors: ${errorCount}`);
  console.log(`   �  Skipped: ${skippedCount}`);
  console.log('='.repeat(60) + '\n');
}

main()
  .then(() => {
    console.log('<� Done!\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('=� Fatal error:', error);
    process.exit(1);
  });
