#!/usr/bin/env node
/**
 * Sync Weekend Results - Complete pipeline in one command
 *
 * This script:
 * 1. Finds meets from the past week that don't have results yet
 * 2. Searches TFRRS for matching meets by name/date
 * 3. Scrapes results directly from TFRRS
 * 4. Imports results to database with duplicate checking
 *
 * Usage:
 *   node sync-weekend-results.js                    # Dry run - show matches
 *   node sync-weekend-results.js --scrape           # Find matches + scrape (no import)
 *   node sync-weekend-results.js --commit           # Full pipeline: find + scrape + import
 *   node sync-weekend-results.js --days 3           # Look back 3 days instead of 7
 *   node sync-weekend-results.js --fuzzy            # Allow fallback TFRRS name search
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DELAY_MS = 2000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// School ID for unattached athletes
const UNATTACHED_SCHOOL_ID = 1835;

// Normalize event names for consistent storage
function normalizeEventName(name) {
  if (!name) return name;

  // Remove gender prefix (Men's, Women's)
  let n = name.replace(/^(Men'?s?\s+|Women'?s?\s+)/i, '').trim();

  // Sprints
  if (/^60\s*(Meters?|m|Meter\s*Dash)?$/i.test(n)) return '60m';
  if (/^200\s*(Meters?|m|Meter\s*Dash)?$/i.test(n)) return '200m';
  if (/^300\s*(Meters?|m|Meter\s*Dash)?$/i.test(n)) return '300m';
  if (/^400\s*(Meters?|m|Meter\s*Dash)?$/i.test(n)) return '400m';

  // Middle distance
  if (/^600\s*(Meters?|m|Meter\s*Run)?$/i.test(n)) return '600m';
  if (/^800\s*(Meters?|m|Meter\s*Run)?$/i.test(n)) return '800m';
  if (/^1000\s*(Meters?|m|Meter\s*Run)?$/i.test(n)) return '1000m';
  if (/^1500\s*(Meters?|m|Meter\s*Run)?$/i.test(n)) return '1500m';

  // Mile
  if (/^(1\s*)?Mile(\s*Run)?$/i.test(n)) return 'Mile';

  // Distance
  if (/^3000\s*(Meters?|m|Meter\s*Run)?$/i.test(n)) return '3000m';
  if (/^5000\s*(Meters?|m|Meter\s*Run)?$/i.test(n)) return '5000m';
  if (/^10,?000\s*(Meters?|m|Meter\s*Run)?$/i.test(n)) return '10000m';

  // Hurdles
  if (/^60\s*(m\s*)?(Hurdles?|H|Meter\s*Hurdles?)$/i.test(n)) return '60m H';
  if (/^100\s*(m\s*)?(Hurdles?|H|Meter\s*Hurdles?)$/i.test(n)) return '100m H';
  if (/^110\s*(m\s*)?(Hurdles?|H|Meter\s*Hurdles?)$/i.test(n)) return '110m H';
  if (/^400\s*(m\s*)?(Hurdles?|H|Meter\s*Hurdles?)$/i.test(n)) return '400m H';

  // Steeplechase
  if (/^(3000\s*(m\s*)?)?Steeplechase$/i.test(n)) return '3000m SC';

  // Field - jumps
  if (/^High\s*Jump$/i.test(n)) return 'High Jump';
  if (/^Long\s*Jump$/i.test(n)) return 'Long Jump';
  if (/^Triple\s*Jump$/i.test(n)) return 'Triple Jump';
  if (/^Pole\s*Vault$/i.test(n)) return 'Pole Vault';

  // Field - throws
  if (/^Shot\s*Put$/i.test(n)) return 'Shot Put';
  if (/^Discus(\s*Throw)?$/i.test(n)) return 'Discus';
  if (/^Hammer(\s*Throw)?$/i.test(n)) return 'Hammer';
  if (/^Javelin(\s*Throw)?$/i.test(n)) return 'Javelin';
  if (/^(Weight\s*Throw|WT)$/i.test(n)) return 'Weight Throw';

  // Relays
  if (/^4\s*x\s*100\s*(m|Meters?)?\s*(Relay)?$/i.test(n)) return '4x100m';
  if (/^4\s*x\s*200\s*(m|Meters?)?\s*(Relay)?$/i.test(n)) return '4x200m';
  if (/^4\s*x\s*400\s*(m|Meters?)?\s*(Relay)?$/i.test(n)) return '4x400m';
  if (/^4\s*x\s*800\s*(m|Meters?)?\s*(Relay)?$/i.test(n)) return '4x800m';
  if (/^(Distance\s*Medley\s*Relay|DMR)$/i.test(n)) return 'DMR';
  if (/^(Sprint\s*Medley\s*Relay|SMR)$/i.test(n)) return 'SMR';

  // Multi-events
  if (/^Heptathlon$/i.test(n)) return 'Heptathlon';
  if (/^Decathlon$/i.test(n)) return 'Decathlon';
  if (/^Pentathlon$/i.test(n)) return 'Pentathlon';

  return n; // Return cleaned name if no specific match
}

// Parse command line args
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    scrape: args.includes('--scrape') || args.includes('--commit'),
    commit: args.includes('--commit'),
    fuzzy: args.includes('--fuzzy'),
    days: parseInt(args.find((a, i) => args[i-1] === '--days') || '7')
  };
}

// Manual mappings for meets with known naming differences
// Key: partial match from DB name, Value: partial match for TFRRS name
const MEET_NAME_MAPPINGS = {
  'ncaa division i indoor': 'ncaa division i indoor track',
  'ncaa division ii indoor': 'ncaa division ii indoor track',
  'ncaa division iii indoor': 'ncaa division iii indoor track',
  'neicaaa': 'neicaaa',
  'naia': 'naia',
  'njcaa': 'njcaa',
  'hbcu national': 'hbcu championship',
  'aartfc': 'aartfc',
};

// Normalize meet name for fuzzy matching
function normalizeMeetName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    // Remove common filler words that differ between sources
    .replace(/\b(invitational|invite|indoor|outdoor|classic|open|track\s*(and|&)?\s*field|championships?|presented\s+by.*$|roster.*$|\d{4})\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Check if meets match via manual mapping
function checkManualMapping(dbName, tfrrsName) {
  const dbLower = dbName.toLowerCase();
  const tfrrsLower = tfrrsName.toLowerCase();

  for (const [dbPattern, tfrrsPattern] of Object.entries(MEET_NAME_MAPPINGS)) {
    if (dbLower.includes(dbPattern) && tfrrsLower.includes(tfrrsPattern)) {
      return true;
    }
  }
  return false;
}

// Calculate similarity between two strings (0-1)
function similarity(s1, s2) {
  // Check manual mappings first
  if (checkManualMapping(s1, s2)) {
    return 0.95; // High score for manual matches
  }

  const n1 = normalizeMeetName(s1);
  const n2 = normalizeMeetName(s2);

  if (n1 === n2) return 1;

  // Check if one contains the other
  if (n1.includes(n2) || n2.includes(n1)) return 0.85;

  const words1 = n1.split(' ').filter(w => w.length > 2);
  const words2 = n2.split(' ').filter(w => w.length > 2);

  if (words1.length === 0 || words2.length === 0) return 0;

  // Count matching words (including partial matches)
  let matchCount = 0;
  for (const w1 of words1) {
    for (const w2 of words2) {
      if (w1 === w2 || w1.includes(w2) || w2.includes(w1)) {
        matchCount++;
        break;
      }
    }
  }

  return matchCount / Math.max(words1.length, words2.length);
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

// Parse athlete ID from URL
function parseAthleteId(url) {
  const match = url.match(/\/athletes\/(\d+)\//);
  return match ? parseInt(match[1]) : null;
}

// Parse meet ID from URL
function parseMeetId(url) {
  const match = url.match(/\/results\/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

// Parse event ID from URL
function parseEventId(url) {
  const match = url.match(/\/results\/\d+\/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

// Parse team info from URL
function parseTeamInfo(url) {
  const match = url.match(/\/teams\/tf\/([A-Z]{2})_college_([mf])_(.+)\.html/);
  if (match) {
    return {
      state: match[1],
      gender: match[2] === 'm' ? 'M' : 'F',
      teamSlug: match[3]
    };
  }
  return null;
}

// Get gender from event name
function getGenderFromEventName(eventName) {
  if (!eventName) return null;
  const lower = eventName.toLowerCase();
  if (lower.includes("men's") || lower.includes('men ')) return 'M';
  if (lower.includes("women's") || lower.includes('women ')) return 'F';
  return null;
}

// Parse mark to seconds
function parseMarkSeconds(mark) {
  if (!mark) return null;
  mark = mark.trim();

  const secMatch = mark.match(/^(\d{1,2}\.\d{2,3})$/);
  if (secMatch) return parseFloat(secMatch[1]);

  const minSecMatch = mark.match(/^(\d{1,2}):(\d{2}\.\d{2,3})$/);
  if (minSecMatch) return parseInt(minSecMatch[1]) * 60 + parseFloat(minSecMatch[2]);

  const hourMatch = mark.match(/^(\d{1,2}):(\d{2}):(\d{2}\.\d{2,3})$/);
  if (hourMatch) {
    return parseInt(hourMatch[1]) * 3600 + parseInt(hourMatch[2]) * 60 + parseFloat(hourMatch[3]);
  }

  return null;
}

// Parse mark to meters
function parseMarkMeters(mark) {
  if (!mark) return null;

  const meterMatch = mark.match(/([\d.]+)\s*m/i);
  if (meterMatch) return parseFloat(meterMatch[1]);

  const feetInchMatch = mark.match(/(\d+)'\s*([\d.]+)"/);
  if (feetInchMatch) {
    const feet = parseInt(feetInchMatch[1]);
    const inches = parseFloat(feetInchMatch[2]);
    return (feet * 12 + inches) * 0.0254;
  }

  return null;
}

// Parse date from meet page
function parseDate(dateStr) {
  if (!dateStr) return null;

  const months = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
  };

  const match = dateStr.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:-\d{1,2})?,?\s*(\d{4})/i);
  if (match) {
    const month = months[match[1].toLowerCase()];
    const day = match[2].padStart(2, '0');
    return `${match[3]}-${month}-${day}`;
  }

  return null;
}

// Normalize school name for team matching
function normalizeSchoolName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fetch meets from database that need results
async function getMeetsNeedingResults(daysBack) {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - daysBack);

  const startStr = startDate.toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  console.log(`\nLooking for meets from ${startStr} to ${todayStr}...`);

  let { data: meets, error } = await supabase
    .from('meets')
    .select('meet_id, name, date, location, meet_url, status, tfrrs_url, athletic_net_results_url, results_status')
    .gte('date', startStr)
    .lt('date', todayStr)
    .order('date', { ascending: false });

  if (error) {
    const missingNewColumns = ['tfrrs_url', 'athletic_net_results_url', 'results_status']
      .some(column => error.message?.includes(column));

    if (!missingNewColumns) {
      console.error('Error fetching meets:', error.message);
      return [];
    }

    console.log('Result-link columns are not in Supabase yet; continuing with legacy meet fields');
    const fallback = await supabase
      .from('meets')
      .select('meet_id, name, date, location, meet_url, status')
      .gte('date', startStr)
      .lt('date', todayStr)
      .order('date', { ascending: false });

    if (fallback.error) {
      console.error('Error fetching meets:', fallback.error.message);
      return [];
    }

    meets = (fallback.data || []).map(meet => ({
      ...meet,
      tfrrs_url: null,
      athletic_net_results_url: null,
      results_status: null
    }));
  }

  console.log(`Found ${meets.length} meets in date range`);

  // Check which ones have results
  const meetsWithResultsCheck = await Promise.all(meets.map(async (meet) => {
    const { count } = await supabase
      .from('results')
      .select('*', { count: 'exact', head: true })
      .eq('meet_id', meet.meet_id);

    return { ...meet, hasResults: count > 0, resultCount: count };
  }));

  const needsResults = meetsWithResultsCheck.filter(m => !m.hasResults);
  console.log(`${needsResults.length} meets need results\n`);

  return needsResults;
}

async function updateMeetResultStatus(meetId, status, errorMessage = null) {
  const updates = {
    results_status: status,
    results_last_checked_at: new Date().toISOString()
  };

  if (errorMessage) {
    updates.results_error = errorMessage;
  }

  const { error } = await supabase
    .from('meets')
    .update(updates)
    .eq('meet_id', meetId);

  if (error) {
    const missingNewColumns = ['results_status', 'results_last_checked_at', 'results_error']
      .some(column => error.message?.includes(column));
    if (!missingNewColumns) {
      console.log(`  Could not update result status for meet ${meetId}: ${error.message}`);
    }
  }
}

// Search TFRRS for meets on a specific date
async function searchTfrrsForDate(targetDate) {
  console.log(`  Searching TFRRS for meets on ${targetDate}...`);

  const meets = [];
  let page = 1;

  const targetDateObj = new Date(targetDate);

  while (page <= 20) {
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

        if (meetDateObj < targetDateObj) {
          foundOlder = true;
        }
      });

      if (foundOlder && meetsOnPage === 0) {
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

  // Search the exact date and adjacent dates (for multi-day meets with date discrepancies)
  const datesToSearch = [dbMeet.date];

  // Add day before and after
  const meetDate = new Date(dbMeet.date);
  const dayBefore = new Date(meetDate);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const dayAfter = new Date(meetDate);
  dayAfter.setDate(dayAfter.getDate() + 1);

  datesToSearch.push(dayBefore.toISOString().split('T')[0]);
  datesToSearch.push(dayAfter.toISOString().split('T')[0]);

  let allTfrrsMeets = [];
  for (const searchDate of datesToSearch) {
    const meets = await searchTfrrsForDate(searchDate);
    allTfrrsMeets = allTfrrsMeets.concat(meets);
  }

  // Remove duplicates by URL
  const seenUrls = new Set();
  allTfrrsMeets = allTfrrsMeets.filter(m => {
    if (seenUrls.has(m.url)) return false;
    seenUrls.add(m.url);
    return true;
  });

  if (allTfrrsMeets.length === 0) {
    console.log('  No TFRRS meets found on this date or adjacent dates');
    return null;
  }

  console.log(`  Found ${allTfrrsMeets.length} TFRRS meets (searching ${datesToSearch.join(', ')})`);

  let bestMatch = null;
  let bestScore = 0;

  for (const tfrrsMeet of allTfrrsMeets) {
    const score = similarity(dbMeet.name, tfrrsMeet.name);
    console.log(`    - "${tfrrsMeet.name}" (similarity: ${(score * 100).toFixed(0)}%)`);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = tfrrsMeet;
    }
  }

  if (bestScore >= 0.35) {
    console.log(`  Best match: "${bestMatch.name}" (${(bestScore * 100).toFixed(0)}%)`);
    return { ...bestMatch, similarity: bestScore };
  }

  console.log('  No good match found (threshold: 35%)');
  return null;
}

// Fetch meet page and get event links
async function fetchMeetEvents(meetUrl) {
  try {
    const response = await axios.get(meetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const events = [];
    const seenUrls = new Set();

    const meetId = parseMeetId(meetUrl);
    const meetName = $('h3.panel-title').first().text().trim();
    const dateText = $('.panel-heading-normal-text').first().text().trim();
    const meetDate = parseDate(dateText);

    $('a[href*="/results/"]').each((_, el) => {
      const href = $(el).attr('href');
      const eventName = $(el).text().trim();

      if (!eventName || eventName.length < 3) return;
      if (href.includes('_search')) return;

      const pathParts = href.split('/').filter(Boolean);
      const hasEventId = pathParts.filter(p => /^\d+$/.test(p)).length >= 2;
      if (!hasEventId) return;

      const eventUrl = href.startsWith('http') ? href : `https://www.tfrrs.org${href}`;

      if (seenUrls.has(eventUrl)) return;
      seenUrls.add(eventUrl);

      events.push({
        eventName,
        eventUrl,
        meetName,
        meetDate
      });
    });

    return { meetId, meetName, meetDate, events };

  } catch (error) {
    console.error(`Error fetching meet ${meetUrl}: ${error.message}`);
    return null;
  }
}

// Fetch event results page and parse all results
async function fetchEventResults(eventUrl, meetId, meetName, meetDate, eventName, dbMeetId, dbMeetName) {
  try {
    const eventId = parseEventId(eventUrl);

    const response = await axios.get(eventUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const results = [];

    const pageEventName = eventName;

    // Parse CSS to find hidden columns
    const hiddenClasses = new Set();
    $('style').each((_, style) => {
      const css = $(style).text();
      const matches = css.matchAll(/\.((?:round|heat)_[\w_]+)\s*\{\s*display:\s*none/g);
      for (const match of matches) {
        hiddenClasses.add(match[1]);
      }
    });

    $('table tbody tr').each((_, row) => {
      // Detect round from cell class names
      let roundName = 'Unknown';
      const $firstTimeCell = $(row).find('td[class*="round_"], td[class*="heat_"]').first();
      if ($firstTimeCell.length) {
        const cellClass = $firstTimeCell.attr('class') || '';
        if (cellClass.includes('round_4')) {
          roundName = 'Finals';
        } else if (cellClass.includes('round_1') || cellClass.includes('round_2') || cellClass.includes('round_3')) {
          roundName = 'Preliminaries';
        } else if (cellClass.includes('heat_')) {
          const heatMatch = cellClass.match(/heat_(\d+)_(\d+)/);
          if (heatMatch) {
            roundName = `Heat ${heatMatch[2]}`;
          } else {
            roundName = 'Heat';
          }
        }
      }

      const $row = $(row);
      const cells = $row.find('td');

      if (cells.length < 4) return;

      const place = parseInt($(cells[0]).text().trim()) || null;

      const isRelay = pageEventName.toLowerCase().includes('relay') ||
                      pageEventName.toLowerCase().includes('medley');

      const $athleteLinks = $row.find('a[href*="/athletes/"]');
      const $teamLink = $row.find('a[href*="/teams/"]').first();
      let schoolName = null;
      let teamInfo = null;

      if ($teamLink.length) {
        schoolName = $teamLink.text().trim();
        teamInfo = parseTeamInfo($teamLink.attr('href'));
      }

      // For relays, collect all athlete IDs
      if (isRelay) {
        if (!$teamLink.length) return; // Relays need at least a team

        // Collect all athlete IDs for the relay
        const relayAthletes = [];
        $athleteLinks.each((_, link) => {
          const url = $(link).attr('href');
          const id = parseAthleteId(url);
          let name = $(link).text().trim().replace(/\s+/g, ' ');
          if (id) relayAthletes.push({ athlete_id: id, name });
        });

        // Find mark (time) for relay
        let markRaw = null;

        // Priority 1: Look for checkmark icon
        cells.each((i, cell) => {
          const $cell = $(cell);
          const hasCheckmark = $cell.find('img[src*="ico-check"], img[src*="ico-plus"]').length > 0;
          if (hasCheckmark && !markRaw) {
            const text = $cell.text().trim();
            if (text && /^\d{1,2}:\d{2}\.\d{2,3}$/.test(text)) {
              markRaw = text;
            }
          }
        });

        // Priority 2: Find first visible time cell
        if (!markRaw) {
          cells.each((i, cell) => {
            if (markRaw) return;
            const $cell = $(cell);
            const cellClass = $cell.attr('class') || '';
            const isHidden = [...hiddenClasses].some(hc => cellClass.includes(hc));
            if (isHidden) return;

            const text = $cell.text().trim();
            if (/^\d{1,2}:\d{2}\.\d{2,3}$/.test(text)) {
              markRaw = text;
            }
          });
        }

        // Priority 3: DNF, DQ, etc.
        if (!markRaw) {
          cells.each((i, cell) => {
            if (markRaw) return;
            const text = $(cell).text().trim();
            if (/^(DNF|DQ|DNS|NT|SCR)$/i.test(text)) {
              markRaw = text.toUpperCase();
            }
          });
        }

        if (markRaw) {
          results.push({
            is_relay: true,
            relay_athletes: relayAthletes,
            event_name: normalizeEventName(pageEventName),
            event_id: eventId,
            mark_raw: markRaw,
            mark_seconds: parseMarkSeconds(markRaw),
            place,
            school_name: schoolName,
            team_gender: getGenderFromEventName(pageEventName) || teamInfo?.gender || null,
            meet_id: dbMeetId,
            meet_name: dbMeetName,
            date: meetDate,
            round: roundName
          });
        }
        return;
      }

      const $athleteLink = $athleteLinks.first();

      let athleteId = null;
      let athleteName = null;

      if ($athleteLink.length) {
        const athleteUrl = $athleteLink.attr('href');
        athleteId = parseAthleteId(athleteUrl);
        athleteName = $athleteLink.text().trim();
      } else {
        const nameCell = $(cells[1]);
        if (nameCell.length) {
          athleteName = nameCell.text().trim().replace(/\s+/g, ' ');
        }
      }

      if (!athleteName) return;

      let year = null;
      cells.each((i, cell) => {
        const text = $(cell).text().trim();
        if (/^(FR|SO|JR|SR)(-\d)?$/i.test(text)) {
          year = text.toUpperCase();
        }
      });

      let markRaw = null;

      // Priority 1: Look for checkmark icon
      cells.each((i, cell) => {
        const $cell = $(cell);
        const hasCheckmark = $cell.find('img[src*="ico-check"], img[src*="ico-plus"]').length > 0;
        if (hasCheckmark && !markRaw) {
          const text = $cell.text().trim();
          if (text && text.length < 20) {
            markRaw = text;
          }
        }
      });

      // Priority 2: Find first visible time cell
      if (!markRaw) {
        cells.each((i, cell) => {
          if (markRaw) return;
          const $cell = $(cell);
          const cellClass = $cell.attr('class') || '';

          const isHidden = [...hiddenClasses].some(hc => cellClass.includes(hc));
          if (isHidden) return;

          const text = $cell.text().trim();

          if (/^\d{1,2}:\d{2}\.\d{2,3}$/.test(text) ||
              /^\d{1,2}\.\d{2,3}$/.test(text) ||
              /^\d{1,2}:\d{2}:\d{2}\.\d{2}$/.test(text)) {
            markRaw = text;
          }
          if (/^[\d.]+m$/i.test(text) ||
              /^\d+'\s*[\d.]*"?$/.test(text) ||
              /^\d+-[\d.]+$/.test(text)) {
            markRaw = text;
          }
        });
      }

      // Priority 3: DNF, NT, DNS, etc.
      if (!markRaw) {
        cells.each((i, cell) => {
          if (markRaw) return;
          const text = $(cell).text().trim();
          if (/^(DNF|NT|DNS|FS|FOUL|NH|NM|DQ|SCR|DNQ|NWI)$/i.test(text)) {
            markRaw = text.toUpperCase();
          }
        });
      }

      if (!markRaw) return;

      results.push({
        athlete_id: athleteId,
        athlete_name: athleteName,
        event_name: normalizeEventName(pageEventName),
        event_id: eventId,
        mark_raw: markRaw,
        mark_seconds: parseMarkSeconds(markRaw),
        mark_meters: parseMarkMeters(markRaw),
        place,
        school_name: schoolName,
        team_gender: getGenderFromEventName(pageEventName) || teamInfo?.gender || null,
        year,
        meet_id: dbMeetId,
        meet_name: dbMeetName,
        date: meetDate,
        round: roundName
      });
    });

    return results;

  } catch (error) {
    console.error(`Error fetching event ${eventUrl}: ${error.message}`);
    return [];
  }
}

// Scrape all results from a TFRRS meet
async function scrapeMeet(meetUrl, dbMeetId, dbMeetName, dbMeetDate) {
  console.log(`  Scraping: ${meetUrl}`);

  const meetData = await fetchMeetEvents(meetUrl);
  if (!meetData) {
    console.log('  Failed to fetch meet page');
    return [];
  }

  const meetDate = dbMeetDate || meetData.meetDate;
  console.log(`  Found ${meetData.events.length} events`);

  const allResults = [];

  for (const event of meetData.events) {
    const results = await fetchEventResults(
      event.eventUrl,
      meetData.meetId,
      meetData.meetName,
      meetDate,
      event.eventName,
      dbMeetId,
      dbMeetName
    );

    if (results.length > 0) {
      allResults.push(...results);
    }

    await sleep(DELAY_MS);
  }

  console.log(`  Scraped ${allResults.length} results`);
  return allResults;
}

// Import results to database
async function importResults(results, commit) {
  // Separate relays from individual results
  const relayResults = results.filter(r => r.is_relay === true);
  const individualResults = results.filter(r => r.is_relay !== true);

  console.log(`\nPreparing to import ${results.length} results...`);
  console.log(`  Individual: ${individualResults.length}`);
  console.log(`  Relays: ${relayResults.length}`);

  // Load all teams for matching
  console.log('\nLoading teams from database...');
  let allTeams = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data: batch, error } = await supabase
      .from('teams')
      .select('team_id, gender, school_id, schools(short_name, official_name)')
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error loading teams:', error.message);
      break;
    }

    if (!batch || batch.length === 0) break;
    allTeams = allTeams.concat(batch);
    offset += pageSize;
    if (batch.length < pageSize) break;
  }

  console.log(`Loaded ${allTeams.length} teams`);

  // Build team lookup
  const teamByName = new Map();
  const teamToSchool = new Map();
  for (const team of allTeams) {
    const shortName = team.schools?.short_name;
    const officialName = team.schools?.official_name;

    teamToSchool.set(team.team_id, team.school_id);

    if (shortName) {
      const exactKey = `${shortName.toLowerCase()}|${team.gender}`;
      const normKey = `${normalizeSchoolName(shortName)}|${team.gender}`;
      if (!teamByName.has(exactKey)) teamByName.set(exactKey, team.team_id);
      if (!teamByName.has(normKey)) teamByName.set(normKey, team.team_id);
    }
    if (officialName) {
      const exactKey = `${officialName.toLowerCase()}|${team.gender}`;
      const normKey = `${normalizeSchoolName(officialName)}|${team.gender}`;
      if (!teamByName.has(exactKey)) teamByName.set(exactKey, team.team_id);
      if (!teamByName.has(normKey)) teamByName.set(normKey, team.team_id);
    }
  }

  // Collect all TFRRS athlete IDs (from individual results AND relay athletes)
  const allTfrrsIds = new Set();
  individualResults.forEach(r => {
    if (r.athlete_id) allTfrrsIds.add(r.athlete_id);
  });
  relayResults.forEach(r => {
    (r.relay_athletes || []).forEach(a => {
      if (a.athlete_id) allTfrrsIds.add(a.athlete_id);
    });
  });

  // Load existing athletes
  console.log('Loading existing athletes...');
  const tfrrsToInternalId = new Map();
  const tfrrsIds = [...allTfrrsIds];

  for (let i = 0; i < tfrrsIds.length; i += 1000) {
    const chunk = tfrrsIds.slice(i, i + 1000).map(String);
    const { data } = await supabase
      .from('athletes')
      .select('athlete_id, tfrrs_athlete_id')
      .in('tfrrs_athlete_id', chunk);

    if (data) {
      data.forEach(a => tfrrsToInternalId.set(parseInt(a.tfrrs_athlete_id), a.athlete_id));
    }
  }

  console.log(`Found ${tfrrsToInternalId.size} existing athletes`);

  // Process individual results
  let matched = 0;
  let noTeam = 0;
  let noAthlete = 0;

  const dbResults = [];
  const newAthletes = [];
  const seenAthletes = new Set();

  for (const r of individualResults) {
    // Find team_id
    let teamId = null;
    if (r.school_name) {
      const gender = r.team_gender || 'M';

      const exactKey = `${r.school_name.toLowerCase()}|${gender}`;
      const normKey = `${normalizeSchoolName(r.school_name)}|${gender}`;
      teamId = teamByName.get(exactKey) || teamByName.get(normKey);

      if (!teamId) {
        const normName = normalizeSchoolName(r.school_name);
        for (const [k, v] of teamByName) {
          if (k.startsWith(r.school_name.toLowerCase() + '|') || k.startsWith(normName + '|')) {
            teamId = v;
            break;
          }
        }
      }
    }

    if (teamId) {
      matched++;
    } else {
      noTeam++;
    }

    // Check if athlete exists
    let internalAthleteId = null;

    if (r.athlete_id) {
      internalAthleteId = tfrrsToInternalId.get(r.athlete_id);
      if (!internalAthleteId) {
        noAthlete++;
        if (!seenAthletes.has(r.athlete_id)) {
          seenAthletes.add(r.athlete_id);
          const schoolId = teamId ? teamToSchool.get(teamId) : UNATTACHED_SCHOOL_ID;
          newAthletes.push({
            tfrrs_athlete_id: String(r.athlete_id),
            full_name: r.athlete_name,
            gender: r.team_gender || null,
            school_id: schoolId,
            is_active: true
          });
        }
      }
    } else if (r.athlete_name) {
      noAthlete++;
      const nameKey = `unattached:${r.athlete_name}`;
      if (!seenAthletes.has(nameKey)) {
        seenAthletes.add(nameKey);
        newAthletes.push({
          tfrrs_athlete_id: null,
          full_name: r.athlete_name,
          gender: r.team_gender || null,
          school_id: UNATTACHED_SCHOOL_ID,
          is_active: true
        });
      }
    }

    dbResults.push({
      tfrrs_athlete_id: r.athlete_id,
      athlete_id: internalAthleteId || null,
      athlete_name: r.athlete_name,
      event_name: r.event_name,
      mark_raw: r.mark_raw,
      mark_seconds: r.mark_seconds,
      mark_meters: r.mark_meters,
      place: r.place,
      meet_name: r.meet_name,
      meet_id: r.meet_id,
      event_id: r.event_id,
      date: r.date,
      team_id: teamId,
      round: r.round
    });
  }

  // Process relay results - collect new athletes from relays too
  const dbRelayResults = [];
  for (const r of relayResults) {
    let teamId = null;
    if (r.school_name) {
      const gender = r.team_gender || 'M';
      const exactKey = `${r.school_name.toLowerCase()}|${gender}`;
      const normKey = `${normalizeSchoolName(r.school_name)}|${gender}`;
      teamId = teamByName.get(exactKey) || teamByName.get(normKey);
    }

    // Map relay athletes
    const relayAthletes = (r.relay_athletes || []).map((a, idx) => {
      let internalId = tfrrsToInternalId.get(a.athlete_id);
      if (!internalId && a.athlete_id && !seenAthletes.has(a.athlete_id)) {
        seenAthletes.add(a.athlete_id);
        const schoolId = teamId ? teamToSchool.get(teamId) : UNATTACHED_SCHOOL_ID;
        newAthletes.push({
          tfrrs_athlete_id: String(a.athlete_id),
          full_name: a.name,
          gender: r.team_gender || null,
          school_id: schoolId,
          is_active: true
        });
      }
      return {
        tfrrs_athlete_id: a.athlete_id,
        athlete_id: internalId || null,
        athlete_name: a.name,
        leg_order: idx + 1
      };
    });

    dbRelayResults.push({
      team_id: teamId,
      event_name: r.event_name,
      mark_raw: r.mark_raw,
      mark_seconds: r.mark_seconds,
      place: r.place,
      meet_name: r.meet_name,
      meet_id: r.meet_id,
      event_id: r.event_id,
      date: r.date,
      round: r.round,
      relay_athletes: relayAthletes
    });
  }

  console.log('\nProcessing summary:');
  console.log(`  Team matched: ${matched.toLocaleString()}`);
  console.log(`  No team match: ${noTeam.toLocaleString()}`);
  console.log(`  Missing athletes: ${noAthlete.toLocaleString()}`);
  console.log(`  New athletes to create: ${newAthletes.length.toLocaleString()}`);
  console.log(`  Relay results: ${dbRelayResults.length.toLocaleString()}`);

  if (!commit) {
    console.log('\n>>> DRY RUN - No changes made <<<');
    console.log('Run with --commit to import');
    return { imported: 0, errors: 0, skipped: 0, relaysImported: 0 };
  }

  // Create new athletes
  if (newAthletes.length > 0) {
    console.log('\nCreating new athletes...');
    let athletesCreated = 0;

    for (let i = 0; i < newAthletes.length; i += 500) {
      const batch = newAthletes.slice(i, i + 500);
      const { data, error } = await supabase
        .from('athletes')
        .insert(batch)
        .select('athlete_id, tfrrs_athlete_id');

      if (error) {
        console.log(`  Batch error: ${error.message}`);
      } else {
        athletesCreated += batch.length;
        if (data) {
          data.forEach(a => {
            if (a.tfrrs_athlete_id) {
              tfrrsToInternalId.set(parseInt(a.tfrrs_athlete_id), a.athlete_id);
            }
          });
        }
      }
    }

    console.log(`Created ${athletesCreated} athletes`);

    // Update dbResults with new athlete IDs
    for (const r of dbResults) {
      if (!r.athlete_id && r.tfrrs_athlete_id) {
        r.athlete_id = tfrrsToInternalId.get(r.tfrrs_athlete_id) || null;
      }
    }

    // Update relay athletes with new IDs
    for (const r of dbRelayResults) {
      for (const a of r.relay_athletes) {
        if (!a.athlete_id && a.tfrrs_athlete_id) {
          a.athlete_id = tfrrsToInternalId.get(a.tfrrs_athlete_id) || null;
        }
      }
    }
  }

  // Filter valid individual results
  const validResults = dbResults.filter(r => r.athlete_id != null);
  console.log(`\nValid individual results: ${validResults.length.toLocaleString()}`);

  // Check for existing results to avoid duplicates
  console.log('Checking for existing results...');
  const meetIds = [...new Set([...validResults, ...dbRelayResults].map(r => r.meet_id).filter(Boolean))];
  const existingResults = new Set();
  const existingRelays = new Set();

  for (const meetId of meetIds) {
    const { data: existing } = await supabase
      .from('results')
      .select('athlete_id, event_name, mark_raw, date')
      .eq('meet_id', meetId);

    existing?.forEach(r => {
      const key = `${r.athlete_id}|${r.event_name}|${r.mark_raw}|${r.date}`;
      existingResults.add(key);
    });

    const { data: existingRelayData } = await supabase
      .from('relay_results')
      .select('team_id, event_name, mark_raw, date')
      .eq('meet_id', meetId);

    existingRelayData?.forEach(r => {
      const key = `${r.team_id}|${r.event_name}|${r.mark_raw}|${r.date}`;
      existingRelays.add(key);
    });
  }
  console.log(`Found ${existingResults.size.toLocaleString()} existing individual results`);
  console.log(`Found ${existingRelays.size.toLocaleString()} existing relay results`);

  // Filter out duplicates
  const newResults = validResults.filter(r => {
    const key = `${r.athlete_id}|${r.event_name}|${r.mark_raw}|${r.date}`;
    return !existingResults.has(key);
  });

  const newRelays = dbRelayResults.filter(r => {
    const key = `${r.team_id}|${r.event_name}|${r.mark_raw}|${r.date}`;
    return !existingRelays.has(key);
  });

  const skippedDupes = validResults.length - newResults.length;
  console.log(`Skipping ${skippedDupes.toLocaleString()} duplicate individual results`);
  console.log(`Importing ${newResults.length.toLocaleString()} new individual results`);
  console.log(`Importing ${newRelays.length.toLocaleString()} new relay results`);

  let imported = 0;
  let errors = 0;

  // Import individual results
  for (let i = 0; i < newResults.length; i += 500) {
    const batch = newResults.slice(i, i + 500).map(r => ({
      athlete_id: r.athlete_id,
      event_name: r.event_name,
      mark_raw: r.mark_raw,
      mark_seconds: r.mark_seconds,
      mark_meters: r.mark_meters,
      place: r.place,
      meet_name: r.meet_name,
      meet_id: r.meet_id,
      event_id: r.event_id,
      date: r.date,
      team_id: r.team_id,
      round: r.round
    }));

    const { error } = await supabase
      .from('results')
      .insert(batch);

    if (error) {
      console.log(`  Batch error: ${error.message}`);
      errors += batch.length;
    } else {
      imported += batch.length;
    }
  }
  console.log(`Individual results imported: ${imported.toLocaleString()}`);

  // Import relay results
  let relaysImported = 0;
  let relayErrors = 0;

  for (const relay of newRelays) {
    // 1. Insert into relay_results
    const { data: insertedRelay, error: relayError } = await supabase
      .from('relay_results')
      .insert({
        team_id: relay.team_id,
        event_name: relay.event_name,
        mark_raw: relay.mark_raw,
        mark_seconds: relay.mark_seconds,
        place: relay.place,
        meet_name: relay.meet_name,
        meet_id: relay.meet_id,
        event_id: relay.event_id,
        date: relay.date,
        round: relay.round
      })
      .select('relay_result_id')
      .single();

    if (relayError) {
      console.log(`  Relay insert error: ${relayError.message}`);
      relayErrors++;
      continue;
    }

    // 2. Insert into relay_athletes
    const athleteInserts = relay.relay_athletes
      .filter(a => a.athlete_id)
      .map(a => ({
        relay_result_id: insertedRelay.relay_result_id,
        athlete_id: a.athlete_id,
        tfrrs_athlete_id: a.tfrrs_athlete_id ? String(a.tfrrs_athlete_id) : null,
        athlete_name: a.athlete_name,
        leg_order: a.leg_order
      }));

    if (athleteInserts.length > 0) {
      const { error: athleteError } = await supabase
        .from('relay_athletes')
        .insert(athleteInserts);

      if (athleteError) {
        console.log(`  Relay athletes error: ${athleteError.message}`);
      }
    }

    // 3. Insert into results table (one row per athlete)
    const resultInserts = relay.relay_athletes
      .filter(a => a.athlete_id)
      .map(a => ({
        athlete_id: a.athlete_id,
        event_name: relay.event_name,
        mark_raw: relay.mark_raw,
        mark_seconds: relay.mark_seconds,
        place: relay.place,
        meet_name: relay.meet_name,
        meet_id: relay.meet_id,
        event_id: relay.event_id,
        date: relay.date,
        team_id: relay.team_id,
        round: relay.round
      }));

    if (resultInserts.length > 0) {
      // Check for duplicates before inserting
      const newResultInserts = resultInserts.filter(r => {
        const key = `${r.athlete_id}|${r.event_name}|${r.mark_raw}|${r.date}`;
        return !existingResults.has(key);
      });

      if (newResultInserts.length > 0) {
        const { error: resultError } = await supabase
          .from('results')
          .insert(newResultInserts);

        if (resultError) {
          console.log(`  Relay results error: ${resultError.message}`);
        }
      }
    }

    relaysImported++;
  }

  console.log(`Relay results imported: ${relaysImported.toLocaleString()}`);

  return { imported, errors, skipped: skippedDupes, relaysImported, relayErrors };
}

// Main function
async function main() {
  const options = parseArgs();

  console.log('='.repeat(60));
  console.log('SYNC WEEKEND RESULTS');
  console.log('='.repeat(60));
  console.log(`Mode: ${options.commit ? 'FULL PIPELINE (scrape + import)' : options.scrape ? 'SCRAPE ONLY' : 'FIND MATCHES ONLY'}`);
  console.log(`Looking back: ${options.days} days`);
  console.log(`Fuzzy fallback: ${options.fuzzy ? 'enabled' : 'disabled'}`);

  // Step 1: Find meets that need results
  const meetsNeedingResults = await getMeetsNeedingResults(options.days);

  if (meetsNeedingResults.length === 0) {
    console.log('\nNo meets need results. All caught up!');
    return;
  }

  // Step 2: Use stored TFRRS URLs first. These come from USTFCCCA result links
  // after a meet has completed, and avoid fragile name matching.
  const matches = [];
  const needsTfrrsUrl = [];

  for (const meet of meetsNeedingResults) {
    if (meet.tfrrs_url) {
      const tfrrsMeetId = parseMeetId(meet.tfrrs_url);
      matches.push({
        dbMeet: meet,
        tfrrsMeet: {
          name: meet.name,
          url: meet.tfrrs_url,
          date: meet.date,
          similarity: 1,
          source: 'stored_tfrrs_url',
          tfrrsMeetId
        }
      });
      continue;
    }

    needsTfrrsUrl.push(meet);
  }

  if (options.fuzzy) {
    for (const meet of needsTfrrsUrl) {
      const match = await findTfrrsMatch(meet);
      if (match) {
        const tfrrsMeetId = parseMeetId(match.url);
        matches.push({
          dbMeet: meet,
          tfrrsMeet: { ...match, source: 'fuzzy_search', tfrrsMeetId }
        });
      }
      await sleep(1000);
    }
  } else if (options.commit) {
    for (const meet of needsTfrrsUrl) {
      await updateMeetResultStatus(meet.meet_id, 'missing_tfrrs_url');
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('MATCH SUMMARY');
  console.log('='.repeat(60));
  console.log(`Meets needing results: ${meetsNeedingResults.length}`);
  console.log(`Stored TFRRS URLs: ${meetsNeedingResults.filter(m => m.tfrrs_url).length}`);
  console.log(`Missing TFRRS URLs: ${needsTfrrsUrl.length}`);
  console.log(`Matches found: ${matches.length}`);

  if (matches.length > 0) {
    console.log('\nMatches:');
    matches.forEach(({ dbMeet, tfrrsMeet }) => {
      console.log(`  - "${dbMeet.name}" (${dbMeet.date})`);
      console.log(`    Source: ${tfrrsMeet.source}`);
      console.log(`    TFRRS: "${tfrrsMeet.name}"`);
      console.log(`    URL: ${tfrrsMeet.url}`);
    });
  }

  if (needsTfrrsUrl.length > 0 && !options.fuzzy) {
    console.log('\nMeets without stored TFRRS URL:');
    needsTfrrsUrl.forEach(meet => {
      console.log(`  - "${meet.name}" (${meet.date})`);
    });
  }

  if (!options.scrape) {
    console.log('\nRun with --scrape to scrape results');
    console.log('Run with --commit to scrape AND import to database');
    return;
  }

  // Step 3: Scrape results from matched TFRRS meets
  console.log('\n' + '='.repeat(60));
  console.log('SCRAPING RESULTS');
  console.log('='.repeat(60));

  const allScrapedResults = [];

  for (const { dbMeet, tfrrsMeet } of matches) {
    console.log(`\n[${dbMeet.name}]`);
    const results = await scrapeMeet(
      tfrrsMeet.url,
      dbMeet.meet_id,
      dbMeet.name,
      dbMeet.date
    );
    allScrapedResults.push(...results);
  }

  console.log(`\nTotal scraped: ${allScrapedResults.length.toLocaleString()} results`);

  if (allScrapedResults.length === 0) {
    console.log('No results to import.');
    return;
  }

  // Step 4: Import to database
  console.log('\n' + '='.repeat(60));
  console.log('IMPORTING RESULTS');
  console.log('='.repeat(60));

  const { imported, errors, skipped, relaysImported, relayErrors } = await importResults(allScrapedResults, options.commit);

  if (options.commit) {
    const importedMeetIds = new Set(allScrapedResults.map(r => r.meet_id).filter(Boolean));
    for (const meetId of importedMeetIds) {
      await supabase
        .from('meets')
        .update({
          results_status: 'imported',
          results_imported_at: new Date().toISOString(),
          results_last_checked_at: new Date().toISOString(),
          results_error: null
        })
        .eq('meet_id', meetId);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE');
  console.log('='.repeat(60));
  console.log(`Individual results imported: ${imported.toLocaleString()}`);
  console.log(`Relay results imported: ${(relaysImported || 0).toLocaleString()}`);
  console.log(`Skipped (duplicates): ${skipped.toLocaleString()}`);
  console.log(`Errors: ${errors.toLocaleString()}`);
}

main().catch(console.error);
