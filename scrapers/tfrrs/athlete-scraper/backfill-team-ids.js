#!/usr/bin/env node
/**
 * Backfill NULL team_id on results by re-scraping athlete profiles
 *
 * For each athlete with NULL team_id results:
 * 1. Fetch their TFRRS profile
 * 2. Parse results with school_name
 * 3. Match to existing DB results and update team_id
 *
 * Usage:
 *   node backfill-team-ids.js              # Dry run
 *   node backfill-team-ids.js --commit     # Actually update database
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const cheerio = require('cheerio');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch URL with timeout
function fetchUrl(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error(`Timeout after ${timeout}ms`));
    });
  });
}

// Parse results from HTML with school_name
function parseAthleteResults(html, athleteId) {
  const $ = cheerio.load(html);
  const results = [];

  // Track current school context
  let currentSchool = null;

  // Find the current school from the header
  // The school is in h3.panel-title but NOT the one with .large-title (that's athlete name)
  $('h3.panel-title').each((_, el) => {
    const $el = $(el);
    if ($el.hasClass('large-title')) return;
    currentSchool = $el.text().trim();
  });

  // Process meet results tab content
  const $meetResultsTab = $('#meet-results');

  // Get all elements in order: transfer divs and tables
  const elements = $meetResultsTab.find('div.transfer, table').toArray();

  let schoolForNextResults = currentSchool;

  elements.forEach(el => {
    const $el = $(el);

    // Check if this is a transfer section marker
    if ($el.hasClass('transfer')) {
      const $schoolLink = $el.find('a[href*="/teams/"]');
      if ($schoolLink.length) {
        schoolForNextResults = $schoolLink.text().trim();
      }
      return;
    }

    // This is a table
    const $header = $el.find('thead th, th[colspan]').first();
    if (!$header.length) return;

    // Extract meet name
    const $meetLink = $header.find('a[href*="/results/"]');
    const meetName = $meetLink.text().trim();
    if (!meetName) return;

    // Extract date
    const $dateSpan = $header.find('span');
    let date = '';
    if ($dateSpan.length) {
      const dateMatch = $dateSpan.text().match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:\s*-\s*\d{1,2})?,?\s*\d{4}/i);
      if (dateMatch) {
        date = dateMatch[0].trim();
      }
    }

    // Get result rows
    $el.find('tr').each((_, row) => {
      const $row = $(row);
      const $cells = $row.find('td');
      if ($cells.length < 2) return;

      const eventName = $cells.eq(0).text().trim();
      const $markLink = $cells.eq(1).find('a');
      let mark = $markLink.length ? $markLink.text().trim() : $cells.eq(1).text().trim();

      if (!mark || mark.length < 3) return;
      const cleanMark = mark.replace(/\s*\(\d+(st|nd|rd|th)?\)/gi, '').trim();
      if (cleanMark.toLowerCase().includes('top') || cleanMark.toLowerCase().includes('meters')) return;

      results.push({
        athlete_id: athleteId,
        event_name: eventName,
        meet_name: meetName,
        mark_raw: cleanMark,
        school_name: schoolForNextResults
      });
    });
  });

  return results;
}

async function backfillTeamIds(options = {}) {
  const { commit = false } = options;

  console.log('========================================');
  console.log(commit ? 'BACKFILLING TEAM IDS' : 'DRY RUN (use --commit to update)');
  console.log('========================================\n');

  // Build school name -> team_id lookup
  console.log('Building school -> team_id lookup...');
  // Fetch ALL teams (default limit is 1000)
  let allTeams = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data: batch } = await supabase
      .from('teams')
      .select('team_id, gender, school_id, schools(short_name, official_name)')
      .range(offset, offset + pageSize - 1);
    if (!batch || batch.length === 0) break;
    allTeams = allTeams.concat(batch);
    offset += pageSize;
    if (batch.length < pageSize) break;
  }
  const teams = allTeams;
  console.log(`  Fetched ${teams.length} teams`);

  const schoolToTeamId = {};
  teams?.forEach(t => {
    const shortName = t.schools?.short_name?.toLowerCase();
    const officialName = t.schools?.official_name?.toLowerCase();
    if (shortName) {
      if (!schoolToTeamId[shortName]) schoolToTeamId[shortName] = {};
      schoolToTeamId[shortName][t.gender] = t.team_id;
    }
    if (officialName && officialName !== shortName) {
      if (!schoolToTeamId[officialName]) schoolToTeamId[officialName] = {};
      schoolToTeamId[officialName][t.gender] = t.team_id;
    }
  });
  console.log(`  Loaded ${Object.keys(schoolToTeamId).length} schools\n`);

  function lookupTeamId(schoolName, gender = 'M') {
    if (!schoolName) return null;
    const key = schoolName.toLowerCase().replace(/\.$/, '');
    const teams = schoolToTeamId[key];
    if (!teams) return null;
    return teams[gender] || teams['M'] || teams['F'] || null;
  }

  // Find athletes with NULL team_id results
  console.log('Finding athletes with NULL team_id results...');
  const { data: nullResults } = await supabase
    .from('results')
    .select('athlete_id')
    .is('team_id', null);

  const athleteIds = [...new Set(nullResults?.map(r => r.athlete_id) || [])];
  console.log(`Found ${athleteIds.length} athletes with NULL team_id results\n`);

  if (athleteIds.length === 0) {
    console.log('No athletes need backfilling!');
    return;
  }

  // Get athlete info (tfrrs_profile_url, gender)
  const { data: athleteInfo } = await supabase
    .from('athletes')
    .select('athlete_id, full_name, gender, tfrrs_profile_url')
    .in('athlete_id', athleteIds);

  const athleteMap = {};
  athleteInfo?.forEach(a => athleteMap[a.athlete_id] = a);

  // Process each athlete
  let totalUpdated = 0;
  let totalSkipped = 0;
  let athletesProcessed = 0;

  for (const athleteId of athleteIds) {
    const athlete = athleteMap[athleteId];
    if (!athlete?.tfrrs_profile_url) {
      console.log(`  [${athleteId}] No TFRRS URL, skipping`);
      totalSkipped++;
      continue;
    }

    athletesProcessed++;
    console.log(`\n[${athletesProcessed}/${athleteIds.length}] ${athlete.full_name} (${athleteId})`);

    try {
      // Fetch and parse
      const html = await fetchUrl(athlete.tfrrs_profile_url);
      const scrapedResults = parseAthleteResults(html, athleteId);
      console.log(`  Scraped ${scrapedResults.length} results`);

      // Get existing NULL team_id results for this athlete
      const { data: dbResults } = await supabase
        .from('results')
        .select('result_id, event_name, meet_name, mark_raw')
        .eq('athlete_id', athleteId)
        .is('team_id', null);

      console.log(`  DB results with NULL team_id: ${dbResults?.length || 0}`);

      // Match and update
      let updated = 0;
      for (const dbResult of dbResults || []) {
        // Find matching scraped result
        const match = scrapedResults.find(sr =>
          sr.event_name === dbResult.event_name &&
          sr.meet_name === dbResult.meet_name &&
          sr.mark_raw === dbResult.mark_raw
        );

        if (match && match.school_name) {
          const teamId = lookupTeamId(match.school_name, athlete.gender);
          if (teamId) {
            if (commit) {
              await supabase
                .from('results')
                .update({ team_id: teamId })
                .eq('result_id', dbResult.result_id);
            }
            updated++;
          }
        }
      }

      console.log(`  Updated: ${updated}`);
      totalUpdated += updated;

      // Rate limit
      await sleep(2000 + Math.random() * 2000);

    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
  }

  console.log('\n========================================');
  console.log('BACKFILL COMPLETE');
  console.log('========================================');
  console.log(`Athletes processed: ${athletesProcessed}`);
  console.log(`Results updated: ${totalUpdated}`);
  console.log(`Skipped (no URL): ${totalSkipped}`);

  if (!commit) {
    console.log('\n>>> DRY RUN - No changes made <<<');
    console.log('Run with --commit to update database');
  }
}

// Parse args
const args = process.argv.slice(2);
const options = {
  commit: args.includes('--commit')
};

backfillTeamIds(options).catch(console.error);
