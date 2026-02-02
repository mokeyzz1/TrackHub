/**
 * Import PRs to athlete_prs table
 *
 * Usage:
 *   node import-prs-to-table.js          # Dry run
 *   node import-prs-to-table.js --commit # Actually import
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRS_FILE = path.join(__dirname, './output/scraped-prs.json');

// Parse mark to seconds (for running events)
function parseMarkSeconds(mark) {
  if (!mark) return null;

  // Format: "10.45" (seconds only)
  const secMatch = mark.match(/^(\d{1,2}\.\d{2,3})$/);
  if (secMatch) return parseFloat(secMatch[1]);

  // Format: "1:45.67" or "4:32.10" (min:sec)
  const minSecMatch = mark.match(/^(\d{1,2}):(\d{2}\.\d{2,3})$/);
  if (minSecMatch) return parseInt(minSecMatch[1]) * 60 + parseFloat(minSecMatch[2]);

  // Format: "1:02:34.56" (hour:min:sec)
  const hourMatch = mark.match(/^(\d{1,2}):(\d{2}):(\d{2}\.\d{2,3})$/);
  if (hourMatch) {
    return parseInt(hourMatch[1]) * 3600 + parseInt(hourMatch[2]) * 60 + parseFloat(hourMatch[3]);
  }

  return null;
}

// Parse mark to meters (for field events)
function parseMarkMeters(mark) {
  if (!mark) return null;

  // Format: "4.73m" or "15.67m"
  const meterMatch = mark.match(/(\d+\.\d+)\s*m/i);
  if (meterMatch) return parseFloat(meterMatch[1]);

  return null;
}

// Parse date
function parseDate(dateStr) {
  if (!dateStr) return null;

  const months = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
  };

  // Format: "Jan 24, 2025"
  const match1 = dateStr.match(/(\w{3,})\s+(\d{1,2}),?\s*(\d{4})/i);
  if (match1) {
    const month = months[match1[1].toLowerCase().substring(0, 3)];
    const day = match1[2].padStart(2, '0');
    return `${match1[3]}-${month}-${day}`;
  }

  return null;
}

async function importPRs(commit = false) {
  console.log('========================================');
  console.log(commit ? 'IMPORTING PRs TO athlete_prs TABLE' : 'DRY RUN');
  console.log('========================================\n');

  const prs = JSON.parse(fs.readFileSync(PRS_FILE, 'utf-8'));
  console.log(`Loaded ${prs.length.toLocaleString()} PRs\n`);

  // Transform PRs for database
  const dbPrs = prs.map(pr => ({
    athlete_id: pr.athlete_id,
    event_name: pr.event_name,
    mark_raw: pr.mark_raw,
    mark_seconds: parseMarkSeconds(pr.mark_raw),
    mark_meters: parseMarkMeters(pr.mark_raw),
    set_at: parseDate(pr.set_at),
    meet_name: pr.meet_name || null,
    season: pr.season || 'all'
  }));

  // Group by season
  const bySeason = {};
  dbPrs.forEach(pr => {
    bySeason[pr.season] = (bySeason[pr.season] || 0) + 1;
  });
  console.log('PRs by season:', bySeason);

  // Check for existing PRs to avoid duplicates
  console.log('\nChecking for existing PRs...');

  // Get all unique athlete IDs
  const athleteIds = [...new Set(dbPrs.map(pr => pr.athlete_id))];

  // Load existing PRs for these athletes (with pagination)
  const existingKeys = new Set();
  const chunkSize = 100;

  for (let i = 0; i < athleteIds.length; i += chunkSize) {
    const chunk = athleteIds.slice(i, i + chunkSize);
    let offset = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('athlete_prs')
        .select('athlete_id, event_name, season')
        .in('athlete_id', chunk)
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error('Error loading existing PRs:', error.message);
        break;
      }

      if (!data || data.length === 0) break;

      data.forEach(pr => {
        existingKeys.add(`${pr.athlete_id}|${pr.event_name}|${pr.season}`);
      });

      if (data.length < pageSize) break;
      offset += pageSize;
    }

    if ((i + chunkSize) % 1000 === 0 || i + chunkSize >= athleteIds.length) {
      console.log(`  Checked ${Math.min(i + chunkSize, athleteIds.length).toLocaleString()}/${athleteIds.length.toLocaleString()} athletes`);
    }
  }

  console.log(`Found ${existingKeys.size.toLocaleString()} existing PRs`);

  // Filter out duplicates
  const newPrs = dbPrs.filter(pr => {
    const key = `${pr.athlete_id}|${pr.event_name}|${pr.season}`;
    return !existingKeys.has(key);
  });

  console.log(`\nNew PRs to import: ${newPrs.length.toLocaleString()}`);
  console.log(`Duplicates skipped: ${(dbPrs.length - newPrs.length).toLocaleString()}`);

  // Show sample
  console.log('\nSample PRs (first 5):');
  newPrs.slice(0, 5).forEach(pr => {
    console.log(`  ${pr.athlete_id} | ${pr.event_name} | ${pr.mark_raw} | ${pr.season}`);
  });

  if (!commit) {
    console.log('\n>>> DRY RUN - No changes made <<<');
    console.log('Run with --commit to import');
    return;
  }

  // Import in batches
  console.log('\nImporting in batches of 500...');
  let imported = 0;
  let errors = 0;
  const batchSize = 500;

  for (let i = 0; i < newPrs.length; i += batchSize) {
    const batch = newPrs.slice(i, i + batchSize);

    const { error } = await supabase
      .from('athlete_prs')
      .insert(batch);

    if (error) {
      // Try one by one to identify problem rows
      let batchImported = 0;
      for (const row of batch) {
        const { error: rowError } = await supabase
          .from('athlete_prs')
          .insert(row);
        if (rowError) {
          errors++;
        } else {
          batchImported++;
        }
      }
      imported += batchImported;
      console.log(`Batch ${Math.floor(i / batchSize) + 1}: ${batchImported} imported, ${batch.length - batchImported} failed`);
    } else {
      imported += batch.length;
      if ((i + batchSize) % 5000 === 0 || i + batchSize >= newPrs.length) {
        console.log(`  ${imported.toLocaleString()}/${newPrs.length.toLocaleString()} imported`);
      }
    }
  }

  console.log('\n========================================');
  console.log('COMPLETE');
  console.log('========================================');
  console.log(`Imported: ${imported.toLocaleString()}`);
  console.log(`Errors: ${errors.toLocaleString()}`);
}

const commit = process.argv.includes('--commit');
importPRs(commit).catch(console.error);
