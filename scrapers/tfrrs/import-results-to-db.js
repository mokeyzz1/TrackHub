/**
 * Import Scraped Results to Database
 *
 * Reads the scraped JSON results and imports them to Supabase.
 * Run this AFTER reviewing the scraped data.
 *
 * Usage:
 *   node import-results-to-db.js              # Dry run (shows what would be imported)
 *   node import-results-to-db.js --commit     # Actually import to database
 *   node import-results-to-db.js --batch 500  # Import in batches of 500
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RESULTS_FILE = path.join(__dirname, './output/scraped-results.json');
const IMPORT_LOG = path.join(__dirname, './logs/import-log.json');

// Parse date strings to YYYY-MM-DD format
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Try various formats
  const months = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
  };

  // Format: "Jan 24, 2025" or "January 24, 2025"
  const match1 = dateStr.match(/(\w{3,})\s+(\d{1,2}),?\s*(\d{4})/i);
  if (match1) {
    const month = months[match1[1].toLowerCase().substring(0, 3)];
    const day = match1[2].padStart(2, '0');
    return `${match1[3]}-${month}-${day}`;
  }

  // Format: "01/24/2025" or "1/24/25"
  const match2 = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (match2) {
    let year = match2[3];
    if (year.length === 2) {
      year = parseInt(year) > 50 ? '19' + year : '20' + year;
    }
    return `${year}-${match2[1].padStart(2, '0')}-${match2[2].padStart(2, '0')}`;
  }

  return null;
}

// Parse mark to extract seconds (for running events)
function parseMarkSeconds(mark) {
  if (!mark) return null;

  // Format: "10.45" (seconds only)
  const secMatch = mark.match(/^(\d{1,2}\.\d{2,3})$/);
  if (secMatch) {
    return parseFloat(secMatch[1]);
  }

  // Format: "1:45.67" or "4:32.10" (min:sec)
  const minSecMatch = mark.match(/^(\d{1,2}):(\d{2}\.\d{2,3})$/);
  if (minSecMatch) {
    return parseInt(minSecMatch[1]) * 60 + parseFloat(minSecMatch[2]);
  }

  // Format: "1:02:34.56" (hour:min:sec)
  const hourMatch = mark.match(/^(\d{1,2}):(\d{2}):(\d{2}\.\d{2,3})$/);
  if (hourMatch) {
    return parseInt(hourMatch[1]) * 3600 + parseInt(hourMatch[2]) * 60 + parseFloat(hourMatch[3]);
  }

  return null;
}

// Parse mark to extract meters (for field events)
function parseMarkMeters(mark) {
  if (!mark) return null;

  // Format: "4.73m" or "15.67m"
  const meterMatch = mark.match(/(\d+\.\d+)\s*m/i);
  if (meterMatch) {
    return parseFloat(meterMatch[1]);
  }

  return null;
}

// Create a unique key for duplicate checking
function resultKey(r) {
  return `${r.athlete_id}|${r.event_name}|${r.date}|${r.mark_raw}|${r.meet_name}`;
}

async function importResults(options = {}) {
  const { commit = false, batchSize = 1000 } = options;

  console.log('========================================');
  console.log(commit ? 'IMPORTING TO DATABASE' : 'DRY RUN (use --commit to import)');
  console.log('========================================\n');

  // Load scraped results
  if (!fs.existsSync(RESULTS_FILE)) {
    console.error(`Results file not found: ${RESULTS_FILE}`);
    console.error('Run the scraper first.');
    process.exit(1);
  }

  const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
  console.log(`Loaded ${results.length.toLocaleString()} scraped results\n`);

  // Transform results for database
  const allDbResults = results.map(r => ({
    athlete_id: r.athlete_id,
    event_name: r.event_name || null,
    meet_name: r.meet_name || null,
    date: parseDate(r.date),
    mark_raw: r.mark_raw,
    mark_seconds: parseMarkSeconds(r.mark_raw),
    mark_meters: parseMarkMeters(r.mark_raw),
    place: r.place,
    // These will be null for scraped data
    team_id: null,
    wind: null,
    round: null,
    season_code: null,
    meet_location: null,
    total_competitors: null,
    is_pr: false,
    is_season_best: false,
  })).filter(r => r.mark_raw); // Only import if we have a mark

  console.log(`Valid results: ${allDbResults.length.toLocaleString()}`);

  // Get unique athlete IDs from scraped data
  const athleteIds = [...new Set(allDbResults.map(r => r.athlete_id))];
  console.log(`\nChecking duplicates for ${athleteIds.length.toLocaleString()} athletes...`);

  // Load existing results only for these athletes
  const existingKeys = new Set();
  const chunkSize = 50; // Query 50 athletes at a time

  for (let i = 0; i < athleteIds.length; i += chunkSize) {
    const chunk = athleteIds.slice(i, i + chunkSize);

    let offset = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('results')
        .select('athlete_id, event_name, date, mark_raw, meet_name')
        .in('athlete_id', chunk)
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error('Error loading existing results:', error.message);
        break;
      }

      if (!data || data.length === 0) break;

      data.forEach(r => existingKeys.add(resultKey(r)));
      offset += pageSize;

      if (data.length < pageSize) break;
    }

    if ((i + chunkSize) % 500 === 0 || i + chunkSize >= athleteIds.length) {
      console.log(`  Checked ${Math.min(i + chunkSize, athleteIds.length).toLocaleString()}/${athleteIds.length.toLocaleString()} athletes (${existingKeys.size.toLocaleString()} existing results)`);
    }
  }

  console.log(`  Total existing results for these athletes: ${existingKeys.size.toLocaleString()}`);

  // Filter out duplicates from DB
  const afterDbFilter = allDbResults.filter(r => !existingKeys.has(resultKey(r)));
  const dbDuplicates = allDbResults.length - afterDbFilter.length;

  // Also dedupe within the scraped data itself
  const seenKeys = new Set();
  const dbResults = afterDbFilter.filter(r => {
    const key = resultKey(r);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
  const internalDupes = afterDbFilter.length - dbResults.length;

  console.log(`\nDB duplicates found: ${dbDuplicates.toLocaleString()}`);
  console.log(`Internal duplicates: ${internalDupes.toLocaleString()}`);
  console.log(`New results to import: ${dbResults.length.toLocaleString()}`);

  // Get max result_id to manually assign IDs (workaround for sequence issue)
  const { data: maxIdData } = await supabase
    .from('results')
    .select('result_id')
    .order('result_id', { ascending: false })
    .limit(1);

  let nextId = (maxIdData?.[0]?.result_id || 0) + 1;
  console.log(`Starting result_id: ${nextId.toLocaleString()}`);

  // Add result_id to each row
  dbResults.forEach(r => {
    r.result_id = nextId++;
  })

  // Show sample
  console.log('\nSample results (first 5):');
  dbResults.slice(0, 5).forEach(r => {
    console.log(`  ${r.athlete_id} | ${r.event_name} | ${r.mark_raw} | ${r.meet_name} | ${r.date}`);
  });

  if (!commit) {
    console.log('\n>>> DRY RUN - No changes made <<<');
    console.log('Run with --commit to import to database');
    return;
  }

  // Import in batches
  console.log(`\nImporting in batches of ${batchSize}...`);

  let imported = 0;
  let errors = 0;

  for (let i = 0; i < dbResults.length; i += batchSize) {
    const batch = dbResults.slice(i, i + batchSize);

    // Insert one by one if batch fails to identify problem rows
    const { data, error } = await supabase
      .from('results')
      .insert(batch);

    if (error) {
      // If batch fails, try inserting one by one
      let batchImported = 0;
      let batchErrors = 0;
      for (const row of batch) {
        const { error: rowError } = await supabase
          .from('results')
          .insert(row);
        if (rowError) {
          batchErrors++;
        } else {
          batchImported++;
        }
      }
      imported += batchImported;
      errors += batchErrors;
      console.log(`Batch ${Math.floor(i / batchSize) + 1}: ${batchImported} imported, ${batchErrors} failed (${imported.toLocaleString()} total)`);
    } else {
      imported += batch.length;
      console.log(`Imported batch ${Math.floor(i / batchSize) + 1} (${imported.toLocaleString()} total)`);
    }
  }

  // Log results
  const importLog = {
    timestamp: new Date().toISOString(),
    total_in_file: results.length,
    valid_results: dbResults.length,
    imported: imported,
    errors: errors
  };

  fs.writeFileSync(IMPORT_LOG, JSON.stringify(importLog, null, 2));

  console.log('\n========================================');
  console.log('IMPORT COMPLETE');
  console.log('========================================');
  console.log(`Imported: ${imported.toLocaleString()}`);
  console.log(`Errors: ${errors.toLocaleString()}`);
}

// Parse args
const args = process.argv.slice(2);
const options = {
  commit: args.includes('--commit'),
  batchSize: 1000
};

const batchIndex = args.indexOf('--batch');
if (batchIndex !== -1 && args[batchIndex + 1]) {
  options.batchSize = parseInt(args[batchIndex + 1]);
}

importResults(options).catch(console.error);
