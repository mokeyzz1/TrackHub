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
 *   node sync-weekend-results.js --compare --control-plane --meet <id>
 *                                                   # Private second-source comparison
 *   node sync-weekend-results.js --days 3           # Look back 3 days instead of 7
 *   node sync-weekend-results.js --fuzzy            # Allow fallback TFRRS name search
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { collapseDuplicateRounds } = require('../../shared/collapse_duplicate_rounds');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const { parseName } = require('../../shared/name_parser');
const { EventResolver } = require('../../shared/event_resolver');
const { fingerprint, fetchAll, normaliseMarkKey } = require('../../shared/result_fingerprint');
const { ControlledIngestion } = require('../../shared/controlled_ingestion');
const { normalizeSourceRows } = require('../../shared/source_observation_adapter');
const { isUnattachedTeamLabel } = require('../../shared/ingestion_contract');
const { TeamAliasResolver } = require('../../shared/team_alias_resolver');
const { AthleteAliasResolver } = require('../../shared/athlete_alias_resolver');
const { parseTfrrsTeamInfo } = require('../../shared/tfrrs_team_identity');
const { requireControlledCommit } = require('../../shared/write_mode_guard');

// Resolves raw event names -> canonical event_type_id via event_aliases (loaded in importResults).
const events = new EventResolver();

require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

function ensureIngestDatabaseUrl(env = process.env) {
  if (env.INGEST_DATABASE_URL || !env.DB_PASSWORD) {
    return env.INGEST_DATABASE_URL || null;
  }
  const host = env.INGEST_DATABASE_HOST || env.SUPABASE_DB_HOST || 'db.hunbahsnaeeztmzqpnrl.supabase.co';
  const port = env.INGEST_DATABASE_PORT || '5432';
  const database = env.INGEST_DATABASE_NAME || 'postgres';
  const user = env.INGEST_DATABASE_USER || 'postgres';
  env.INGEST_DATABASE_URL = 'postgresql://' + user + ':'
    + encodeURIComponent(env.DB_PASSWORD) + '@' + host + ':' + port + '/' + database;
  return env.INGEST_DATABASE_URL;
}

// Mark parsing lives in scrapers/shared/mark_parser.js. Six near-identical copies of these two
// functions existed across the importers and every one carried the same defects: the seconds regex
// demanded 2-3 decimals so "10.6" returned null, and none of them stripped a trailing wind reading
// like "10.24  (2.0)". That is how 1.3M rows ended up with a text mark and no number.
const { parseMarkSeconds, parseMarkMeters } = require("../../shared/mark_parser");

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
    relaysOnly: args.includes('--relays-only'),
    compare: args.includes('--compare'),
    controlPlane: args.includes('--control-plane'),
    legacyDirectWrite: args.includes('--legacy-direct-write'),
    days: parseInt(args.find((a, i) => args[i-1] === '--days') || '7'),
    // --meet <id>: run against ONE meet regardless of the date window. Use this to verify the
    // engine end-to-end before pointing it at a batch (it writes results).
    meetId: args.find((a, i) => args[i-1] === '--meet') || null
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

function cellText($, cells, index) {
  return String($(cells[index]).text() || '').replace(/\s+/g, ' ').trim();
}

function parseRelayAthleteNames(value) {
  return String(value || '').split(',')
    .map(name => name.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function headerCellIndex($, $row, pattern) {
  const headers = $row.closest('table').find('thead tr').last().find('th');
  for (let index = 0; index < headers.length; index++) {
    if (pattern.test(cellText($, headers, index))) return index;
  }
  return -1;
}

/**
 * TFRRS currently renders result identities as plain table cells rather than links. Keep the
 * link-based path for older pages, but fall back to the stable current column layout:
 * individual = place, athlete, year, team; relay = place, team, squad, athletes.
 */
function extractTfrrsRowIdentity($, $row, { isRelay = false } = {}) {
  const cells = $row.find('td');
  const athleteLinks = $row.find('a[href*="/athletes/"]');
  const teamLink = $row.find('a[href*="/teams/"]').first();
  const teamCellIndex = headerCellIndex($, $row, /\bteam\b/i);
  const teamName = teamLink.length
    ? teamLink.text().replace(/\s+/g, ' ').trim()
    : cellText($, cells, teamCellIndex >= 0 ? teamCellIndex : (isRelay ? 1 : 3));

  if (!isRelay) {
    const athleteLink = athleteLinks.first();
    const athleteCellIndex = headerCellIndex($, $row, /^(?:name|athlete)s?$/i);
    return {
      athleteId: athleteLink.length ? parseAthleteId(athleteLink.attr('href')) : null,
      athleteName: athleteLink.length
        ? athleteLink.text().replace(/\s+/g, ' ').trim()
        : cellText($, cells, athleteCellIndex >= 0 ? athleteCellIndex : 1),
      schoolName: teamName || null,
      teamInfo: teamLink.length ? parseTfrrsTeamInfo(teamLink.attr('href')) : null,
    };
  }

  const athleteHeaderIndex = headerCellIndex($, $row, /^athletes?$/i);
  const squadCell = cellText($, cells, 2);
  const athleteCellIndex = athleteHeaderIndex >= 0
    ? athleteHeaderIndex
    : (/^[A-Za-z0-9]$/.test(squadCell) ? 3 : 2);
  const relayAthletes = [];
  athleteLinks.each((_, link) => {
    const athleteId = parseAthleteId($(link).attr('href'));
    const athleteName = $(link).text().replace(/\s+/g, ' ').trim();
    if (athleteName) relayAthletes.push({ athleteId, name: athleteName });
  });
  if (!relayAthletes.length) {
    parseRelayAthleteNames(cellText($, cells, athleteCellIndex))
      .forEach(name => relayAthletes.push({ athleteId: null, name }));
  }

  return {
    athleteId: null,
    athleteName: null,
    schoolName: teamName || null,
    teamInfo: teamLink.length ? parseTfrrsTeamInfo(teamLink.attr('href')) : null,
    relayAthletes,
  };
}

// Older meet rows often store the TFRRS result page in the generic meet_url column while the
// newer tfrrs_url column is null. Treat that URL as a TFRRS source only after validating its host
// and result-id shape; never guess from a name or accept an unrelated generic link.
function storedTfrrsUrl(meet) {
  for (const candidate of [meet?.tfrrs_url, meet?.meet_url]) {
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      const host = parsed.hostname.toLowerCase();
      if ((host === 'tfrrs.org' || host.endsWith('.tfrrs.org')) && parseMeetId(candidate)) {
        return candidate;
      }
    } catch (_) {
      // Invalid source URLs are ignored and can be handled by the normal matching path.
    }
  }
  return null;
}

// Parse event ID from URL
function parseEventId(url) {
  const match = url.match(/\/results\/\d+\/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

// Get gender from event name
function getGenderFromEventName(eventName) {
  if (!eventName) return null;
  const lower = eventName.toLowerCase();
  if (lower.includes("men's") || lower.includes('men ')) return 'M';
  if (lower.includes("women's") || lower.includes('women ')) return 'F';
  return null;
}

// Current TFRRS event links carry the gender in the slug (for example, Mens-100-Meters),
// while the visible link text is usually only "100 Meters". The URL is the authoritative
// discriminator when both genders publish the same display name.
function getGenderFromEventUrl(eventUrl) {
  if (!eventUrl) return null;
  const lower = decodeURIComponent(String(eventUrl)).toLowerCase();
  if (/(?:^|\/)mens-/.test(lower)) return 'M';
  if (/(?:^|\/)womens-/.test(lower)) return 'F';
  return null;
}

function isMultiEventName(eventName) {
  return /\b(?:decathlon|heptathlon|pentathlon)\b/i.test(String(eventName || ''));
}

// TFRRS's normal HTML multi-event page mixes the aggregate table with every component table.
// Its official API host exposes the same event with a stable summary table whose first POINTS
// column is the aggregate score. Keep the original URL for provenance and use the API host only
// for fetching the aggregate.
function tfrrsApiEventUrl(eventUrl) {
  try {
    const parsed = new URL(eventUrl);
    if (parsed.hostname === 'tfrrs.org' || parsed.hostname.endsWith('.tfrrs.org')) {
      parsed.hostname = 'api.tfrrs.org';
    }
    return parsed.toString();
  } catch (_) {
    return eventUrl;
  }
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

function normalizeAthleteName(name) {
  return String(name || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Resolve common source/database school-name variants only when the source label is a strict
// prefix of exactly one canonical name for the requested gender. This handles "Riverside City"
// vs "Riverside City College" without incorrectly mapping "San Diego Mesa" to "San Diego".
function findTeamIdBySourceName(teamByName, sourceName, gender, {
  teamBySourceKey = null,
  sourceTeamKey = null,
  sourceTeamState = null,
} = {}) {
  const normalizedSource = normalizeSchoolName(sourceName);
  if (!gender) return null;

  if (teamBySourceKey && sourceTeamKey) {
    const normalizedKey = String(sourceTeamKey).trim();
    const sourceCandidates = [];
    if (sourceTeamState) sourceCandidates.push(`${String(sourceTeamState).toUpperCase()}|${normalizedKey}|${gender}`);
    sourceCandidates.push(`${normalizedKey}|${gender}`);

    for (const key of sourceCandidates) {
      const candidateTeamIds = teamBySourceKey.get(key);
      if (!candidateTeamIds) continue;
      const uniqueTeamIds = candidateTeamIds instanceof Set
        ? candidateTeamIds
        : new Set([candidateTeamIds]);
      if (uniqueTeamIds.size === 1) return [...uniqueTeamIds][0];
    }
  }

  if (!normalizedSource) return null;

  const exactKeys = [
    `${String(sourceName).toLowerCase()}|${gender}`,
    `${normalizedSource}|${gender}`
  ];
  for (const key of exactKeys) {
    const exact = teamByName.get(key);
    if (exact) return exact;
  }

  const candidates = new Set();
  for (const [key, teamId] of teamByName.entries()) {
    const separator = key.lastIndexOf('|');
    if (separator < 1 || key.slice(separator + 1) !== gender) continue;
    const normalizedDbName = key.slice(0, separator);
    if (normalizedDbName.startsWith(`${normalizedSource} `)) {
      candidates.add(teamId);
    }
  }

  return candidates.size === 1 ? [...candidates][0] : null;
}

function parseMultiEventSummary($, {
  eventUrl,
  fetchUrl = eventUrl,
  meetId,
  meetName,
  meetDate,
  eventName,
  dbMeetId,
  dbMeetName,
  eventGender = null,
} = {}) {
  const $table = $('table').first();
  if (!$table.length) return [];

  const headers = $table.find('thead tr').last().find('th');
  let pointsIndex = -1;
  for (let index = 0; index < headers.length; index++) {
    if (/^points$/i.test(cellText($, headers, index))) {
      pointsIndex = index;
      break;
    }
  }
  if (pointsIndex < 0) return [];

  const resultGender = eventGender || getGenderFromEventUrl(eventUrl) || getGenderFromEventName(eventName);
  const eventId = parseEventId(eventUrl);
  const results = [];

  $table.find('tbody tr').each((_, row) => {
    const $row = $(row);
    const cells = $row.find('td');
    const score = cellText($, cells, pointsIndex);
    if (!/^\d+(?:\.\d+)?$/.test(score)) return;

    const identity = extractTfrrsRowIdentity($, $row, { isRelay: false });
    if (!identity.athleteName) return;

    results.push({
      athlete_id: identity.athleteId,
      athlete_name: identity.athleteName,
      event_name: normalizeEventName(eventName),
      event_id: eventId,
      mark_raw: score,
      mark_seconds: null,
      mark_meters: null,
      points: Number(score),
      place: parseInt(cellText($, cells, 0), 10) || null,
      school_name: identity.schoolName,
      source_team_key: identity.teamInfo?.teamSlug || identity.schoolName || null,
      source_team_state: identity.teamInfo?.state || null,
      team_gender: resultGender || identity.teamInfo?.gender || null,
      meet_id: dbMeetId,
      source_meet_key: meetId ? String(meetId) : null,
      meet_name: dbMeetName || meetName,
      date: meetDate,
      round: 'Finals',
      source_url: eventUrl,
      source_fetch_url: fetchUrl,
      multi_event_summary: true,
    });
  });

  return results;
}

// Fetch meets from database that need results
async function getMeetsNeedingResults(daysBack, meetId = null, relaysOnly = false, compare = false) {
  // Single-meet mode: skip the date window entirely (used to verify before batching).
  if (meetId) {
    const { data, error } = await supabase
      .from('meets')
      .select('meet_id, name, date, location, meet_url, status, tfrrs_url, athletic_net_results_url, results_status')
      .eq('meet_id', meetId);
    if (error) { console.error('Error fetching meet:', error.message); return []; }
    const { count } = await supabase.from('results')
      .select('*', { count: 'exact', head: true }).eq('meet_id', meetId);
    if (count && !relaysOnly && !compare) {
      console.log(`Meet ${meetId} already has ${count} results — refusing to import a second source into a non-empty meet.`);
      return [];
    }
    if (count && compare) {
      console.log(`Meet ${meetId} has ${count} results — COMPARE mode: the second source will be staged privately for review.`);
    }
    // RELAYS-ONLY escape hatch (added 2026-08-14 for the M1 timeless-4x100 repair).
    // The refusal above exists because importing a SECOND source into a populated meet is how
    // duplicates were mass-created. This is different: it re-reads the SAME source that already
    // filled the meet, to recover relay rows the old parser dropped. 463 meets have a 4x100 where
    // every row is a status code -- the pre-fix regex required MM:SS and threw away 39.30 -- and
    // 412 of them have a perfectly good 4x400 at the same meet, proving only the short relay broke.
    // Individual results are NOT written in this mode, so the meet's existing rows are untouched.
    if (count && relaysOnly) {
      console.log(`Meet ${meetId} has ${count} results — RELAYS-ONLY mode: individual results will not be touched.`);
    }
    const normalized = (data || []).map(meet => ({
      ...meet,
      tfrrs_url: storedTfrrsUrl(meet)
    }));
    console.log(`Single-meet mode: ${normalized.length} meet selected (${count || 0} existing results)`);
    return normalized;
  }

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

  // Which ones actually need results?
  //
  // This used to Promise.all a count query for EVERY meet in the window (thousands at once).
  // On this weak instance most of those requests fail, and a failed count read as `undefined`
  // made `count > 0` false — i.e. a meet full of results looked EMPTY, so the engine would
  // import a second source on top of it and create duplicates. Two fixes:
  //   1. only check meets we could actually import (a stored results link) — cuts thousands to dozens
  //   2. check sequentially, and FAIL SAFE: if the count can't be read, assume it HAS results
  const importable = meets
    .map(meet => ({ ...meet, tfrrs_url: storedTfrrsUrl(meet) }))
    .filter(meet => meet.tfrrs_url);
  console.log(`${importable.length} of ${meets.length} meets have a stored TFRRS url; checking which are empty...`);

  const needsResults = [];
  let skippedNonEmpty = 0, skippedUnknown = 0;
  for (const meet of importable) {
    const { count, error } = await supabase
      .from('results')
      .select('*', { count: 'exact', head: true })
      .eq('meet_id', meet.meet_id);
    if (error || count == null) { skippedUnknown++; continue; }   // fail safe — never import blind
    if (count > 0) { skippedNonEmpty++; continue; }               // one meet, one source
    needsResults.push({ ...meet, hasResults: false, resultCount: 0 });
  }
  console.log(`${needsResults.length} meets need results (skipped ${skippedNonEmpty} already populated, ${skippedUnknown} unverifiable)\n`);

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
        gender: getGenderFromEventUrl(eventUrl),
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
async function fetchEventResults(eventUrl, meetId, meetName, meetDate, eventName, dbMeetId, dbMeetName, eventGender = null) {
  try {
    const eventId = parseEventId(eventUrl);
    const multiEvent = isMultiEventName(eventName);
    const fetchUrl = multiEvent ? tfrrsApiEventUrl(eventUrl) : eventUrl;

    const response = await axios.get(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const results = [];

    const pageEventName = eventName;
    const resultGender = eventGender || getGenderFromEventUrl(eventUrl) || getGenderFromEventName(pageEventName);

    if (multiEvent) {
      return parseMultiEventSummary($, {
        eventUrl,
        fetchUrl,
        meetId,
        meetName,
        meetDate,
        eventName: pageEventName,
        dbMeetId,
        dbMeetName,
        eventGender: resultGender,
      });
    }

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

      const identity = extractTfrrsRowIdentity($, $row, { isRelay });
      const schoolName = identity.schoolName;
      const teamInfo = identity.teamInfo;

      // For relays, collect all athlete IDs
      if (isRelay) {
        // Collect all athlete IDs for the relay
        if (!schoolName) return; // Relays need at least a team
        const relayAthletes = identity.relayAthletes.map(athlete => ({
          athlete_id: athlete.athleteId,
          name: athlete.name,
        }));

        // Find mark (time) for relay.
        //
        // BUG FIXED 2026-08: this used to require MM:SS.ss (a colon), so it only ever matched
        // relays slower than a minute. A 4x400 ("3:17.58") matched; a 4x100 ("39.30") did NOT,
        // fell through to the DNF/DQ fallback below, and the ONLY 4x100 rows that survived were
        // the teams that literally DNF'd. Effect: 4x100 was 14% usable vs 4x400 at 47%, and
        // meets appeared to have no 4x1 at all. Sub-minute relays now match too.
        // (Two digits before the decimal keeps this from grabbing points/wind-style values.)
        const RELAY_TIME = /^(\d{1,2}:\d{2}\.\d{2,3}|\d{2}\.\d{2,3})$/;
        let markRaw = null;

        // Priority 1: Look for checkmark icon
        cells.each((i, cell) => {
          const $cell = $(cell);
          const hasCheckmark = $cell.find('img[src*="ico-check"], img[src*="ico-plus"]').length > 0;
          if (hasCheckmark && !markRaw) {
            const text = $cell.text().trim();
            if (text && RELAY_TIME.test(text)) {
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
            if (RELAY_TIME.test(text)) {
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
            source_team_key: teamInfo?.teamSlug || schoolName || null,
            source_team_state: teamInfo?.state || null,
            team_gender: resultGender || teamInfo?.gender || null,
            meet_id: dbMeetId,
            source_meet_key: meetId ? String(meetId) : null,
            meet_name: dbMeetName,
            date: meetDate,
            round: roundName,
            source_url: eventUrl
          });
        }
        return;
      }

      const athleteId = identity.athleteId;
      const athleteName = identity.athleteName;

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
        source_team_key: teamInfo?.teamSlug || schoolName || null,
        source_team_state: teamInfo?.state || null,
        team_gender: resultGender || teamInfo?.gender || null,
        year,
        meet_id: dbMeetId,
        source_meet_key: meetId ? String(meetId) : null,
        meet_name: dbMeetName,
        date: meetDate,
        round: roundName,
        source_url: eventUrl
      });
    });

    // Same defect as scrape-meet-results.js (U1: two engines, copy-pasted logic -- exactly how
    // the relay colon bug survived in one file after being fixed in the other). A TFRRS event
    // page renders the event as several tables (combined view + one per heat) and the loop above
    // walks ALL of them, emitting each athlete 2-3 times with different round labels.
    const { rows: deduped, collapsed } = collapseDuplicateRounds(results);
    if (collapsed) console.log(`      collapsed ${collapsed} duplicate round rows (${results.length} -> ${deduped.length})`);
    return deduped;

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
      dbMeetName,
      event.gender
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
async function importResults(results, commit, relaysOnly = false, controlPlane = false) {
  // Load the canonical event catalog so new results/relays get a resolved event_type_id.
  const aliasCount = await events.load(supabase);
  console.log(`Loaded ${aliasCount.toLocaleString()} event aliases for resolution.`);

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
      .select('team_id, gender, school_id, tfrrs_team_url, schools(short_name, official_name)')
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
  const teamBySourceKey = new Map();
  const teamToSchool = new Map();
  for (const team of allTeams) {
    const shortName = team.schools?.short_name;
    const officialName = team.schools?.official_name;

    teamToSchool.set(team.team_id, team.school_id);

    const teamInfo = parseTfrrsTeamInfo(team.tfrrs_team_url);
    if (teamInfo) {
      const addSourceKey = key => {
        if (!teamBySourceKey.has(key)) teamBySourceKey.set(key, new Set());
        teamBySourceKey.get(key).add(team.team_id);
      };
      addSourceKey(`${teamInfo.state}|${teamInfo.teamSlug}|${teamInfo.gender}`);
      addSourceKey(`${teamInfo.teamSlug}|${teamInfo.gender}`);
    }

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

  // Pre-load existing Unattached athletes (no TFRRS id) by name so weekly re-syncs REUSE them
  // instead of creating a fresh duplicate every weekend — the cause of ~34k orphan name-only rows.
  const existingUnattachedByName = new Map(); // full_name -> athlete_id
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('athletes')
      .select('athlete_id, full_name')
      .eq('school_id', UNATTACHED_SCHOOL_ID)
      .is('tfrrs_athlete_id', null)
      .range(from, from + 999);
    if (error || !data || data.length === 0) break;
    data.forEach(a => { if (!existingUnattachedByName.has(a.full_name)) existingUnattachedByName.set(a.full_name, a.athlete_id); });
    if (data.length < 1000) break;
  }
  console.log(`Found ${existingUnattachedByName.size} existing unattached athletes`);

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
      teamId = findTeamIdBySourceName(teamByName, r.school_name, gender, {
        teamBySourceKey,
        sourceTeamKey: r.source_team_key,
        sourceTeamState: r.source_team_state,
      });
    }
    const sourceTeamName = r.school_name || r.team_name || null;
    const sourceIsUnattached = isUnattachedTeamLabel(sourceTeamName);
    const canCreateAthlete = Boolean(teamId) || sourceIsUnattached;

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
        if (canCreateAthlete && !seenAthletes.has(r.athlete_id)) {
          seenAthletes.add(r.athlete_id);
          const schoolId = teamId ? teamToSchool.get(teamId) : UNATTACHED_SCHOOL_ID;
          newAthletes.push({
            tfrrs_athlete_id: String(r.athlete_id),
            full_name: r.athlete_name,
            ...(parseName(r.athlete_name) || {}),  // first_name/last_name on insert
            gender: r.team_gender || null,
            school_id: schoolId,
            is_active: true
          });
        }
      }
    } else if (r.athlete_name) {
      // No TFRRS ID (unattached / post-collegiate). Reuse an existing record by name first —
      // but only when the source explicitly says Unattached/Open/Independent. A named school
      // needs a verified athlete identity; reusing an unattached name would create a false link.
      const existingId = sourceIsUnattached ? existingUnattachedByName.get(r.athlete_name) : null;
      if (existingId) {
        internalAthleteId = existingId;
      } else {
        noAthlete++;
        const nameKey = `unattached:${r.athlete_name}`;
        if (sourceIsUnattached && !seenAthletes.has(nameKey)) {
          seenAthletes.add(nameKey);
          newAthletes.push({
            tfrrs_athlete_id: null,
            full_name: r.athlete_name,
            ...(parseName(r.athlete_name) || {}),  // first_name/last_name on insert
            gender: r.team_gender || null,
            school_id: UNATTACHED_SCHOOL_ID,
            is_active: true
          });
        }
      }
    }

    dbResults.push({
      tfrrs_athlete_id: r.athlete_id,
      athlete_id: internalAthleteId || null,
      athlete_name: r.athlete_name,
      source_athlete_key: r.athlete_id ? String(r.athlete_id) : r.athlete_name || null,
      event_name: r.event_name,
      mark_raw: r.mark_raw,
      mark_seconds: r.mark_seconds,
      mark_meters: r.mark_meters,
      points: r.points ?? null,
      place: r.place,
      meet_name: r.meet_name,
      meet_id: r.meet_id,
      source_meet_key: r.source_meet_key,
      event_id: r.event_id,
      date: r.date,
      team_id: teamId,
      round: r.round,
      school_name: r.school_name || null,
      source_team_key: r.source_team_key || r.school_name || null,
      source_team_state: r.source_team_state || null,
      team_gender: r.team_gender || null,
      source_url: r.source_url || r.event_url || null,
      source_fetch_url: r.source_fetch_url || null,
      multi_event_summary: r.multi_event_summary || false
    });
  }

  // Process relay results - collect new athletes from relays too
  const dbRelayResults = [];
  for (const r of relayResults) {
    let teamId = null;
    if (r.school_name) {
      const gender = r.team_gender || 'M';
      teamId = findTeamIdBySourceName(teamByName, r.school_name, gender, {
        teamBySourceKey,
        sourceTeamKey: r.source_team_key,
        sourceTeamState: r.source_team_state,
      });
    }
    const sourceTeamName = r.school_name || r.team_name || null;
    const sourceIsUnattached = isUnattachedTeamLabel(sourceTeamName);
    const canCreateAthlete = Boolean(teamId) || sourceIsUnattached;

    // Map relay athletes
    const relayAthletes = (r.relay_athletes || []).map((a, idx) => {
      let internalId = tfrrsToInternalId.get(a.athlete_id);
      if (!internalId && a.athlete_id && canCreateAthlete && !seenAthletes.has(a.athlete_id)) {
        seenAthletes.add(a.athlete_id);
        const schoolId = teamId ? teamToSchool.get(teamId) : UNATTACHED_SCHOOL_ID;
        newAthletes.push({
          tfrrs_athlete_id: String(a.athlete_id),
          full_name: a.name,
          ...(parseName(a.name) || {}),  // first_name/last_name on insert
          gender: r.team_gender || null,
          school_id: schoolId,
          is_active: true
        });
      }
      return {
        tfrrs_athlete_id: a.athlete_id,
        athlete_id: internalId || null,
        athlete_name: a.name,
        source_athlete_key: a.athlete_id ? String(a.athlete_id) : a.name || null,
        leg_order: idx + 1
      };
    });

    dbRelayResults.push({
      // Keep the source shape explicit. The shared adapter uses this marker to create a
      // relay_result parent plus separately attributable relay_leg observations. Without it,
      // control-plane dry runs treated the team row as an individual result with no athlete and
      // quarantined every relay even when all legs were matched.
      is_relay: true,
      team_id: teamId,
      school_name: r.school_name,
      source_team_key: r.source_team_key || r.school_name || null,
      source_team_state: r.source_team_state || null,
      team_gender: r.team_gender || null,
      event_name: r.event_name,
      mark_raw: r.mark_raw,
      mark_seconds: r.mark_seconds,
      place: r.place,
      meet_name: r.meet_name,
      meet_id: r.meet_id,
      source_meet_key: r.source_meet_key,
      event_id: r.event_id,
      date: r.date,
      round: r.round,
      source_url: r.source_url || r.event_url || null,
      relay_athletes: relayAthletes
    });
  }

  console.log('\nProcessing summary:');
  console.log(`  Team matched: ${matched.toLocaleString()}`);
  console.log(`  No team match: ${noTeam.toLocaleString()}`);
  console.log(`  Missing athletes: ${noAthlete.toLocaleString()}`);
  console.log(`  New athletes to create: ${newAthletes.length.toLocaleString()}`);
  console.log(`  Relay results: ${dbRelayResults.length.toLocaleString()}`);

  // Resolve every event before creating athletes or writing facts. A run that cannot classify all
  // of its rows must stop before it creates partial side effects. The old path resolved events at
  // insert time, which allowed a successful-looking import to leave NULL event_type_id rows.
  for (const row of [...dbResults, ...dbRelayResults]) {
    row.event_type_id = events.resolve(row.event_name);
  }
  if (events.unmappedCount > 0) {
    console.error(`\n✖ ${events.unmappedCount} unmapped event name(s) found before write.`);
    [...events.unmapped.entries()].sort((a, b) => b[1] - a[1])
      .forEach(([name, count]) => console.error(`    ${String(count).padStart(6)}x  ${name}`));
    if (commit && !controlPlane) {
      await events.flushUnmapped(supabase);
      console.error('  Import refused. Add aliases, then re-run. No athletes or result rows were written.');
      return { imported: 0, errors: 1, skipped: 0, relaysImported: 0, relayErrors: 0 };
    }
  }

  // TFRRS currently renders many result tables without athlete profile links. If a row exactly
  // matches one existing performance in this same meet by normalized name, canonical event, and
  // normalized mark, reuse that one athlete identity. This is deliberately not a global name
  // matcher: same-name athletes across schools/seasons remain unresolved, and source identity
  // stays explicit in source_athlete_key.
  const hydrateExistingMeetAthletes = async rows => {
    const candidates = rows.filter(row =>
      !row.athlete_id && row.athlete_name && row.meet_id && row.event_type_id && row.mark_raw
    );
    if (!candidates.length) return 0;

    const existingByKey = new Map();
    const athleteNames = new Map();
    const meetIds = [...new Set(candidates.map(row => row.meet_id))];

    for (const meetId of meetIds) {
      let existing;
      try {
        existing = await fetchAll(() => supabase
          .from('results')
          .select('athlete_id, event_type_id, mark_raw, mark_seconds, mark_meters')
          .eq('meet_id', meetId));
      } catch (error) {
        console.warn(`  Could not load existing athlete identities for meet ${meetId}: ${error.message}`);
        continue;
      }

      const athleteIds = [...new Set(existing.map(row => row.athlete_id).filter(Boolean))];
      for (let index = 0; index < athleteIds.length; index += 1000) {
        const chunk = athleteIds.slice(index, index + 1000);
        const { data, error } = await supabase
          .from('athletes')
          .select('athlete_id, full_name')
          .in('athlete_id', chunk);
        if (error) {
          console.warn(`  Could not load athlete names for meet ${meetId}: ${error.message}`);
          continue;
        }
        (data || []).forEach(athlete => athleteNames.set(Number(athlete.athlete_id), athlete.full_name));
      }

      for (const row of existing) {
        const athleteName = athleteNames.get(Number(row.athlete_id));
        if (!athleteName || !row.event_type_id || !row.mark_raw) continue;
        const key = [
          meetId,
          normalizeAthleteName(athleteName),
          row.event_type_id,
          normaliseMarkKey(row.mark_raw),
        ].join('|');
        if (!existingByKey.has(key)) existingByKey.set(key, new Set());
        existingByKey.get(key).add(Number(row.athlete_id));
      }
    }

    let hydrated = 0;
    for (const row of candidates) {
      const key = [
        row.meet_id,
        normalizeAthleteName(row.athlete_name),
        row.event_type_id,
        normaliseMarkKey(row.mark_raw),
      ].join('|');
      const athleteIds = existingByKey.get(key);
      if (!athleteIds || athleteIds.size !== 1) continue;
      row.athlete_id = [...athleteIds][0];
      row.athlete_resolution_method = 'existing_meet_performance';
      hydrated++;
    }
    return hydrated;
  };

  const hydratedAthletes = await hydrateExistingMeetAthletes(dbResults);
  if (hydratedAthletes) {
    console.log(`  Reused ${hydratedAthletes.toLocaleString()} existing meet-scoped athlete identities`);
  }

  const stageControlPlane = async (commitMode) => {
    const sourceRows = relaysOnly ? dbRelayResults : [...dbResults, ...dbRelayResults];
    const controlled = new ControlledIngestion();
    let teamAliases;
    let athleteAliases;
    try {
      teamAliases = await TeamAliasResolver.load(controlled.store.pool, 'tfrrs');
      athleteAliases = await AthleteAliasResolver.load(controlled.store.pool, 'tfrrs');
    } catch (error) {
      if (controlled.ownsStore) await controlled.store.close();
      throw error;
    }
    const records = normalizeSourceRows('tfrrs', sourceRows, events, {
      teamResolver: teamAliases,
      athleteResolver: athleteAliases,
      requireNamedTeam: true
    });
    const outcome = await controlled.run({
      source: 'tfrrs',
      scope: {
        // Use the full scrape for scope identity. In relay-only mode sourceRows can be empty
        // when the source legitimately publishes no relay events, but the meet must still be
        // attributable for queue coverage reconciliation.
        meet_ids: [...new Set(results.map(row => row.meet_id).filter(Boolean))],
        relays_only: relaysOnly,
        source_observation_count: results.length,
        source_relay_observation_count: relayResults.length,
      },
      parserVersion: 'tfrrs-html-v2',
      records,
      commit: commitMode
    });
    console.log(`\nCONTROL PLANE RUN ${outcome.runId}`);
    console.log(`  staged=${outcome.staged_observations} inserted=${outcome.inserted || 0} claimed=${outcome.claimed || 0} skipped=${outcome.skipped || 0} quarantined=${outcome.quarantined || 0}`);
    if (events.unmappedCount > 0 && commitMode) await events.flushUnmapped(supabase);
    return outcome;
  };

  // This mode persists an auditable dry-run without touching athletes or public facts.
  if (controlPlane && !commit) {
    const outcome = await stageControlPlane(false);
    return {
      imported: 0,
      errors: outcome.quarantined || 0,
      skipped: outcome.skipped || 0,
      relaysImported: 0,
      relayErrors: 0,
      runId: outcome.runId
    };
  }

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

  if (controlPlane) {
    const outcome = await stageControlPlane(true);
    if (outcome.quarantined) process.exitCode = 1;
    return {
      imported: outcome.inserted || 0,
      errors: outcome.quarantined || 0,
      skipped: outcome.skipped || 0,
      relaysImported: outcome.relayParents || 0,
      relayErrors: 0,
      runId: outcome.runId
    };
  }

  // Filter valid individual results
  const validResults = dbResults.filter(r => r.athlete_id != null);
  console.log(`\nValid individual results: ${validResults.length.toLocaleString()}`);

  // Check for existing results to avoid duplicates. Always paginate these reads: PostgREST's
  // default response cap is 1,000 rows, and a large meet otherwise looks partially empty to the
  // duplicate guard.
  console.log('Checking for existing results...');
  const meetIds = [...new Set([...validResults, ...dbRelayResults].map(r => r.meet_id).filter(Boolean))];
  const existingResults = new Set();
  const existingRelays = new Set();

  const relayFingerprint = row => {
    if (!row.team_id || !row.event_type_id || !row.mark_raw || !/\d/.test(String(row.mark_raw))) return null;
    return `${row.team_id}|${row.event_type_id}|${normaliseMarkKey(row.mark_raw)}`;
  };
  const scopedResultFingerprint = row => `${row.meet_id}|${fingerprint(row)}`;
  const scopedRelayFingerprint = row => {
    const key = relayFingerprint(row);
    return key ? `${row.meet_id}|${key}` : null;
  };

  for (const meetId of meetIds) {
    const existing = await fetchAll(() => supabase
      .from('results')
      .select('athlete_id, event_type_id, mark_raw, mark_seconds, mark_meters, place, round, date')
      .eq('meet_id', meetId));

    existing?.forEach(r => {
      if (r.event_type_id != null) existingResults.add(`${meetId}|${fingerprint(r)}`);
    });

    const existingRelayData = await fetchAll(() => supabase
      .from('relay_results')
      .select('team_id, event_type_id, mark_raw, mark_seconds, place, round, date')
      .eq('meet_id', meetId));

    existingRelayData.forEach(r => {
      const key = relayFingerprint(r);
      if (key) existingRelays.add(`${meetId}|${key}`);
    });
  }
  console.log(`Found ${existingResults.size.toLocaleString()} existing individual results`);
  console.log(`Found ${existingRelays.size.toLocaleString()} existing relay results`);

  // Filter out duplicates
  const seenResultFingerprints = new Set(existingResults);
  const newResults = validResults.filter(r => {
    const key = scopedResultFingerprint(r);
    if (seenResultFingerprints.has(key)) return false;
    seenResultFingerprints.add(key);
    return true;
  });

  const seenRelayFingerprints = new Set(existingRelays);
  const newRelays = dbRelayResults.filter(r => {
    const key = scopedRelayFingerprint(r);
    // DNS/DQ/etc. are legitimate relay facts but have no numeric performance identity. Keep them
    // for now; the private source-record key will make their replays idempotent once this writer
    // is fully routed through the control plane.
    if (!key) return true;
    if (seenRelayFingerprints.has(key)) return false;
    seenRelayFingerprints.add(key);
    return true;
  });

  const skippedDupes = validResults.length - newResults.length;
  // In relays-only mode the meet is already populated from this same source; leave its individual
  // results completely alone and write only the relay rows the old parser dropped.
  const individualsToWrite = relaysOnly ? [] : newResults;
  if (relaysOnly) console.log(`RELAYS-ONLY: withholding ${newResults.length.toLocaleString()} individual results`);
  console.log(`Skipping ${skippedDupes.toLocaleString()} duplicate individual results`);
  console.log(`Importing ${newResults.length.toLocaleString()} new individual results`);
  console.log(`Importing ${newRelays.length.toLocaleString()} new relay results`);

  let imported = 0;
  let errors = 0;

  // Import individual results
  for (let i = 0; i < individualsToWrite.length; i += 500) {
    const batch = individualsToWrite.slice(i, i + 500).map(r => ({
      athlete_id: r.athlete_id,
      event_name: r.event_name,
      event_type_id: r.event_type_id,
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
      // Don't drop the whole batch — one bad row would strand 499 athletes as zero-result
      // shells. Retry row-by-row so only truly-bad rows fail.
      console.log(`  Batch error: ${error.message}. Retrying row-by-row...`);
      for (const row of batch) {
        const { error: rowErr } = await supabase.from('results').insert(row);
        if (rowErr) {
          errors++;
        } else {
          imported++;
          existingResults.add(scopedResultFingerprint(row));
        }
      }
    } else {
      imported += batch.length;
      batch.forEach(row => existingResults.add(scopedResultFingerprint(row)));
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
        event_type_id: relay.event_type_id,
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
    const relayKey = scopedRelayFingerprint(relay);
    if (relayKey) existingRelays.add(relayKey);

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
        event_type_id: relay.event_type_id,
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
      const batchKeys = new Set();
      const newResultInserts = resultInserts.filter(r => {
        const key = scopedResultFingerprint(r);
        if (existingResults.has(key) || batchKeys.has(key)) return false;
        batchKeys.add(key);
        return true;
      });

      if (newResultInserts.length > 0) {
        const { error: resultError } = await supabase
          .from('results')
          .insert(newResultInserts);

        if (resultError) {
          console.log(`  Relay results error: ${resultError.message}`);
        } else {
          batchKeys.forEach(key => existingResults.add(key));
        }
      }
    }

    relaysImported++;
  }

  console.log(`Relay results imported: ${relaysImported.toLocaleString()}`);

  // Report/persist any event names that weren't in the alias map (drift detection).
  if (events.unmappedCount > 0) {
    console.log(`\n⚠ ${events.unmappedCount} event name(s) had no alias mapping (event_type_id left null).`);
    if (commit) {
      const flushed = await events.flushUnmapped(supabase);
      console.log(`  Logged ${flushed} to unmapped_events for review — add them to event_aliases.`);
    } else {
      console.log('  (dry run — not logged to unmapped_events)');
    }
  }

  return { imported, errors, skipped: skippedDupes, relaysImported, relayErrors };
}

// Main function
async function main() {
  const options = parseArgs();
  ensureIngestDatabaseUrl();

  if (options.compare && !options.controlPlane) {
    throw new Error('--compare requires --control-plane so the second source stays private until reviewed');
  }

  requireControlledCommit({
    commit: options.commit,
    controlPlane: options.controlPlane,
    legacyDirectWrite: options.legacyDirectWrite,
    importer: 'TFRRS weekend importer'
  });
  if (options.commit && options.legacyDirectWrite) {
    console.warn('WARNING: explicit legacy direct-write mode enabled; no private ingest transaction will protect this run.');
  }

  console.log('='.repeat(60));
  console.log('SYNC WEEKEND RESULTS');
  console.log('='.repeat(60));
  console.log(`Mode: ${options.commit ? 'FULL PIPELINE (scrape + import)' : options.scrape ? 'SCRAPE ONLY' : 'FIND MATCHES ONLY'}`);
  console.log(`Looking back: ${options.days} days`);
  console.log(`Fuzzy fallback: ${options.fuzzy ? 'enabled' : 'disabled'}`);

  // Step 1: Find meets that need results
  const meetsNeedingResults = await getMeetsNeedingResults(
    options.days,
    options.meetId,
    options.relaysOnly,
    options.compare
  );

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

  const { imported, errors, skipped, relaysImported, relayErrors } = await importResults(
    allScrapedResults,
    options.commit,
    options.relaysOnly,
    options.controlPlane
  );

  if (options.commit) {
    const importedMeetIds = new Set(allScrapedResults.map(r => r.meet_id).filter(Boolean));
    const totalImported = imported + (relaysImported || 0);
    const hasErrors = errors > 0 || relayErrors > 0;
    const status = hasErrors ? 'partial' : totalImported > 0 ? 'imported' : 'pending';
    const statusError = hasErrors
      ? `individual_errors=${errors}; relay_errors=${relayErrors}`
      : totalImported === 0
        ? 'Scrape returned rows but wrote no new rows; leaving the meet retryable.'
        : null;

    for (const meetId of importedMeetIds) {
      await supabase
        .from('meets')
        .update({
          results_status: status,
          results_source: status === 'imported' ? 'tfrrs' : null,
          results_imported_at: status === 'imported' ? new Date().toISOString() : null,
          results_last_checked_at: new Date().toISOString(),
          results_error: statusError
        })
        .eq('meet_id', meetId);
    }

    if (hasErrors) process.exitCode = 1;
  }

  console.log('\n' + '='.repeat(60));
  console.log(errors || relayErrors ? 'COMPLETED WITH PROBLEMS' : 'COMPLETE');
  console.log('='.repeat(60));
  console.log(`Individual results imported: ${imported.toLocaleString()}`);
  console.log(`Relay results imported: ${(relaysImported || 0).toLocaleString()}`);
  console.log(`Skipped (duplicates): ${skipped.toLocaleString()}`);
  console.log(`Errors: ${errors.toLocaleString()}`);
}

if (require.main === module) {
  main()
    .then(() => {
      if (process.exitCode === 1) process.exit(1);
    })
    .catch(error => {
      console.error('FATAL:', error?.stack || error);
      process.exit(1);
    });
}

module.exports = {
  ensureIngestDatabaseUrl,
  extractTfrrsRowIdentity,
  fetchEventResults,
  fetchMeetEvents,
  findTeamIdBySourceName,
  getGenderFromEventUrl,
  getMeetsNeedingResults,
  main,
  parseMultiEventSummary,
  parseArgs,
  parseMeetId,
  parseRelayAthleteNames,
  scrapeMeet,
  storedTfrrsUrl,
  tfrrsApiEventUrl,
};
