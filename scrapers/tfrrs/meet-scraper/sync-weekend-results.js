#!/usr/bin/env node
/**
 * Sync Weekend Results - Links USTFCCCA meets with TFRRS results
 *
 * This script:
 * 1. Finds meets from the past week that don't have results yet
 * 2. Searches TFRRS for matching meets by name/date
 * 3. Scrapes results and attaches them to existing database meet entries
 *
 * Usage:
 *   node sync-weekend-results.js                    # Dry run - show matches
 *   node sync-weekend-results.js --scrape           # Find matches + scrape results
 *   node sync-weekend-results.js --scrape --commit  # Scrape + import to database
 *   node sync-weekend-results.js --days 3           # Look back 3 days instead of 7
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DELAY_MS = 2000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const OUTPUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Parse command line args
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    scrape: args.includes('--scrape'),
    commit: args.includes('--commit'),
    days: parseInt(args.find((a, i) => args[i-1] === '--days') || '7')
  };
}

// Normalize meet name for fuzzy matching
function normalizeMeetName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[''`]/g, '')           // Remove apostrophes
    .replace(/[^a-z0-9\s]/g, ' ')    // Replace punctuation with space
    .replace(/\s+/g, ' ')            // Collapse multiple spaces
    .replace(/\b(invitational|invite|indoor|outdoor|classic|open)\b/gi, '')
    .trim();
}

// Calculate similarity between two strings (0-1)
function similarity(s1, s2) {
  const n1 = normalizeMeetName(s1);
  const n2 = normalizeMeetName(s2);

  if (n1 === n2) return 1;

  const words1 = n1.split(' ').filter(w => w.length > 2);
  const words2 = n2.split(' ').filter(w => w.length > 2);

  if (words1.length === 0 || words2.length === 0) return 0;

  const common = words1.filter(w => words2.includes(w));
  return common.length / Math.max(words1.length, words2.length);
}

// Parse TFRRS date format
function parseTfrrsDate(dateStr) {
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{2})\/(\d{2})(?:-\d{2})?(?:\/\d{2})?\/(\d{2})/);
  if (match) {
    const month = match[1];
    const day = match[2];
    const year = parseInt(match[3]) >= 50 ? `19${match[3]}` : `20${match[3]}`;
    return `${year}-${month}-${day}`;
  }
  return null;
}

// Fetch meets from database that need results
async function getMeetsNeedingResults(daysBack) {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - daysBack);

  const startStr = startDate.toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  console.log(`\nLooking for meets from ${startStr} to ${todayStr}...`);

  // Get meets that happened recently
  const { data: meets, error } = await supabase
    .from('meets')
    .select('meet_id, name, date, location, meet_url, status')
    .gte('date', startStr)
    .lt('date', todayStr)
    .order('date', { ascending: false });

  if (error) {
    console.error('Error fetching meets:', error.message);
    return [];
  }

  console.log(`Found ${meets.length} meets in date range`);

  // Check which ones have results
  const meetsWithResultsCheck = await Promise.all(meets.map(async (meet) => {
    const { count } = await supabase
      .from('results')
      .select('*', { count: 'exact', head: true })
      .eq('meet_name', meet.name);

    return { ...meet, hasResults: count > 0, resultCount: count };
  }));

  const needsResults = meetsWithResultsCheck.filter(m => !m.hasResults);
  console.log(`${needsResults.length} meets need results\n`);

  return needsResults;
}

// Search TFRRS for meets on a specific date
async function searchTfrrsForDate(targetDate) {
  console.log(`  Searching TFRRS for meets on ${targetDate}...`);

  const meets = [];
  let page = 1;
  let found = false;

  // Parse target date
  const targetDateObj = new Date(targetDate);

  while (page <= 20 && !found) {
    const url = `https://www.tfrrs.org/results_search.html?page=${page}`;

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      let meetsOnPage = 0;
      let foundOlder = false;

      $('table tbody tr').each((_, row) => {
        const $row = $(row);
        const cells = $row.find('td');

        if (cells.length < 4) return;

        const dateStr = $(cells[0]).text().trim();
        const meetDate = parseTfrrsDate(dateStr);

        if (!meetDate) return;

        const meetDateObj = new Date(meetDate);

        // Check if this meet is on our target date
        if (meetDate === targetDate) {
          const $meetLink = $(cells[1]).find('a');
          if (!$meetLink.length) return;

          const meetName = $meetLink.text().trim();
          const href = $meetLink.attr('href');
          const meetUrl = href.startsWith('http') ? href : `https://www.tfrrs.org${href}`;

          meets.push({
            name: meetName,
            url: meetUrl,
            date: meetDate
          });
          meetsOnPage++;
        }

        // If we've gone past the target date, we can stop
        if (meetDateObj < targetDateObj) {
          foundOlder = true;
        }
      });

      if (foundOlder && meetsOnPage === 0) {
        // We've passed our date, stop searching
        break;
      }

      page++;
      await sleep(1000);

    } catch (error) {
      console.error(`  Error searching TFRRS page ${page}:`, error.message);
      break;
    }
  }

  return meets;
}

// Find best TFRRS match for a meet
async function findTfrrsMatch(dbMeet) {
  console.log(`\nSearching for: "${dbMeet.name}" (${dbMeet.date})`);

  // Search TFRRS for meets on this date
  const tffrrsMeets = await searchTfrrsForDate(dbMeet.date);

  if (tffrrsMeets.length === 0) {
    console.log('  No TFRRS meets found on this date');
    return null;
  }

  console.log(`  Found ${tffrrsMeets.length} TFRRS meets on ${dbMeet.date}`);

  // Find best match by name similarity
  let bestMatch = null;
  let bestScore = 0;

  for (const tfrrsMeet of tffrrsMeets) {
    const score = similarity(dbMeet.name, tfrrsMeet.name);
    console.log(`    - "${tfrrsMeet.name}" (similarity: ${(score * 100).toFixed(0)}%)`);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = tfrrsMeet;
    }
  }

  // Require at least 40% similarity
  if (bestScore >= 0.4) {
    console.log(`  Best match: "${bestMatch.name}" (${(bestScore * 100).toFixed(0)}%)`);
    return { ...bestMatch, similarity: bestScore };
  }

  console.log('  No good match found (threshold: 40%)');
  return null;
}

// Scrape results from a TFRRS meet page (reusing existing scraper logic)
async function scrapeMeetResults(meetUrl, dbMeetId, dbMeetName) {
  // Import the scraper functions
  const scraper = require('./scrape-meet-results.js');

  // For now, just return placeholder - we'll integrate with the existing scraper
  console.log(`  Would scrape: ${meetUrl}`);
  console.log(`  And link to database meet_id: ${dbMeetId}`);

  return { resultCount: 0 };
}

// Parse TFRRS meet ID from URL
function parseTfrrsMeetId(url) {
  const match = url.match(/\/results\/(\d+)/);
  return match ? match[1] : null;
}

// Update database meet with TFRRS ID link
async function linkTfrrsToMeet(dbMeetId, tfrrsMeetId) {
  try {
    const { error } = await supabase
      .from('meets')
      .update({
        tfrrs_meet_id: tfrrsMeetId,
        updated_at: new Date().toISOString()
      })
      .eq('meet_id', dbMeetId);

    if (error) {
      // Column might not exist yet - that's OK
      if (error.message.includes('tfrrs_meet_id')) {
        console.log('  Note: tfrrs_meet_id column not found. Run migration first.');
        return false;
      }
      console.log(`  Error updating meet: ${error.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.log(`  Error: ${e.message}`);
    return false;
  }
}

// Main function
async function main() {
  const options = parseArgs();

  console.log('='.repeat(60));
  console.log('SYNC WEEKEND RESULTS');
  console.log('='.repeat(60));
  console.log(`Mode: ${options.scrape ? (options.commit ? 'SCRAPE + COMMIT' : 'SCRAPE (dry run)') : 'FIND MATCHES ONLY'}`);
  console.log(`Looking back: ${options.days} days`);

  // Step 1: Find meets that need results
  const meetsNeedingResults = await getMeetsNeedingResults(options.days);

  if (meetsNeedingResults.length === 0) {
    console.log('\nNo meets need results. All caught up!');
    return;
  }

  // Step 2: Find TFRRS matches for each meet
  const matches = [];

  for (const meet of meetsNeedingResults) {
    const match = await findTfrrsMatch(meet);
    if (match) {
      // Extract TFRRS meet ID from URL
      const tfrrsMeetId = parseTfrrsMeetId(match.url);
      matches.push({
        dbMeet: meet,
        tfrrsMeet: { ...match, tfrrsMeetId }
      });
    }
    await sleep(1000);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('MATCH SUMMARY');
  console.log('='.repeat(60));
  console.log(`Meets needing results: ${meetsNeedingResults.length}`);
  console.log(`Matches found: ${matches.length}`);

  if (matches.length > 0) {
    console.log('\nMatches:');
    matches.forEach(({ dbMeet, tfrrsMeet }) => {
      console.log(`  - DB: "${dbMeet.name}" (${dbMeet.date})`);
      console.log(`    TFRRS: "${tfrrsMeet.name}" (ID: ${tfrrsMeet.tfrrsMeetId})`);
      console.log(`    URL: ${tfrrsMeet.url}`);
      console.log(`    Similarity: ${(tfrrsMeet.similarity * 100).toFixed(0)}%`);
      console.log();
    });
  }

  // Save matches to file for manual review or next step
  const matchesFile = path.join(OUTPUT_DIR, 'weekend-matches.json');
  fs.writeFileSync(matchesFile, JSON.stringify(matches, null, 2));
  console.log(`Matches saved to: ${matchesFile}`);

  // Link TFRRS IDs to database meets
  if (options.commit && matches.length > 0) {
    console.log('\nLinking TFRRS meet IDs to database...');
    for (const { dbMeet, tfrrsMeet } of matches) {
      if (tfrrsMeet.tfrrsMeetId) {
        const success = await linkTfrrsToMeet(dbMeet.meet_id, tfrrsMeet.tfrrsMeetId);
        if (success) {
          console.log(`  Linked meet ${dbMeet.meet_id} -> TFRRS ${tfrrsMeet.tfrrsMeetId}`);
        }
      }
    }
  }

  if (!options.scrape) {
    console.log('\nRun with --scrape to scrape results from matched meets');
    return;
  }

  // Step 3: Scrape results from matched TFRRS meets
  console.log('\n' + '='.repeat(60));
  console.log('SCRAPING RESULTS');
  console.log('='.repeat(60));

  // Generate meets-to-scrape.json with the matches
  const meetsToScrape = matches.map(({ dbMeet, tfrrsMeet }) => ({
    url: tfrrsMeet.url,
    name: tfrrsMeet.name,
    date: dbMeet.date,
    db_meet_id: dbMeet.meet_id,
    db_meet_name: dbMeet.name,
    tfrrs_meet_id: tfrrsMeet.tfrrsMeetId
  }));

  const scrapeFile = path.join(__dirname, 'meets-to-scrape.json');
  fs.writeFileSync(scrapeFile, JSON.stringify(meetsToScrape, null, 2));
  console.log(`Created ${scrapeFile} with ${meetsToScrape.length} meets`);
  console.log('\nRun the following commands to complete the sync:');
  console.log('  1. node scrape-meet-results.js');
  console.log('  2. node import-meet-results.js' + (options.commit ? ' --commit' : ''));

  if (options.commit) {
    console.log('\n(Or wait for the import to happen automatically with --commit)');
  }
}

main().catch(console.error);
