/**
 * Athletic.net Athlete ID Mapper
 *
 * Maps athletes from our database to athletic.net IDs using their search API.
 * Fast - uses HTTP API, no browser needed.
 *
 * Usage:
 *   node map-athletes.js              # Start or resume
 *   node map-athletes.js --fresh      # Start fresh
 *   node map-athletes.js --test 10    # Test with 10 athletes
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const config = require('./config');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Paths
const SCRIPT_DIR = __dirname;
const OUTPUT_DIR = path.join(SCRIPT_DIR, config.OUTPUT_DIR);
const LOGS_DIR = path.join(SCRIPT_DIR, config.LOGS_DIR);

// Ensure directories exist
[OUTPUT_DIR, LOGS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Logging
const LOG_FILE = path.join(LOGS_DIR, `map-${new Date().toISOString().split('T')[0]}.log`);

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Search athletic.net API
function searchAthleticNet(query) {
  return new Promise((resolve, reject) => {
    const url = `${config.SEARCH_API}?q=${encodeURIComponent(query)}&sport=tf`;

    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    }, (res) => {
      if (res.statusCode === 429) {
        reject(new Error('RATE_LIMITED'));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

// Normalize name for comparison (remove suffixes, trim, lowercase)
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, '') // Remove suffixes
    .replace(/[^a-z\s]/g, '') // Remove special chars
    .trim();
}

// Extract school name from athletic.net subtext
function extractSchoolFromSubtext(subtext) {
  // Format: "School Name (Collegiate)||City, State"
  const parts = subtext.split('||');
  const schoolPart = parts[0] || '';
  return schoolPart.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();
}

// Check if names match (handles variations)
function namesMatch(name1, name2) {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  // Exact match
  if (n1 === n2) return { match: true, exact: true };

  // One contains the other (for partial names)
  if (n1.includes(n2) || n2.includes(n1)) return { match: true, exact: false };

  // Check if first and last name match (order might differ)
  const parts1 = n1.split(/\s+/);
  const parts2 = n2.split(/\s+/);
  if (parts1.length >= 2 && parts2.length >= 2) {
    const first1 = parts1[0], last1 = parts1[parts1.length - 1];
    const first2 = parts2[0], last2 = parts2[parts2.length - 1];
    if (first1 === first2 && last1 === last2) return { match: true, exact: false };
  }

  return { match: false, exact: false };
}

// Check if schools match
function schoolsMatch(ourSchool, theirSubtext) {
  const ourNorm = ourSchool.toLowerCase().trim();
  const theirSchool = extractSchoolFromSubtext(theirSubtext);

  // Exact match
  if (ourNorm === theirSchool) return true;

  // Partial match (one contains the other)
  if (ourNorm.includes(theirSchool) || theirSchool.includes(ourNorm)) return true;

  // Handle common abbreviations
  const abbrevs = {
    'st.': 'state',
    'st ': 'state ',
    'u.': 'university',
    'univ.': 'university',
  };
  let ourExpanded = ourNorm;
  let theirExpanded = theirSchool;
  for (const [abbr, full] of Object.entries(abbrevs)) {
    ourExpanded = ourExpanded.replace(abbr, full);
    theirExpanded = theirExpanded.replace(abbr, full);
  }
  if (ourExpanded === theirExpanded) return true;
  if (ourExpanded.includes(theirExpanded) || theirExpanded.includes(ourExpanded)) return true;

  return false;
}

// Find best match from search results
function findBestMatch(athlete, results) {
  if (!results.response || !results.response.docs) return null;

  const docs = results.response.docs;
  const candidates = [];

  for (const doc of docs) {
    if (doc.type !== 'Athlete') continue;

    const resultName = doc.textsuggest || '';
    const resultSubtext = doc.subtext || '';
    const isCollegiate = resultSubtext.toLowerCase().includes('collegiate');

    // Skip non-collegiate athletes
    if (!isCollegiate) continue;

    // Check name match
    const nameResult = namesMatch(athlete.full_name, resultName);
    if (!nameResult.match) continue;

    // Check school match
    const schoolMatch = schoolsMatch(athlete.school_name, resultSubtext);

    // Calculate score
    let score = 0;
    if (nameResult.exact) score += 50;
    else score += 30;
    if (schoolMatch) score += 50;
    if (isCollegiate) score += 10;

    candidates.push({
      athletic_net_id: doc.id_db,
      matched_name: doc.textsuggest,
      matched_school: doc.subtext,
      name_exact: nameResult.exact,
      school_match: schoolMatch,
      score: score
    });
  }

  if (candidates.length === 0) return null;

  // Sort by score
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  // Determine confidence
  let confidence;
  if (best.name_exact && best.school_match) {
    confidence = 'high';
  } else if (best.school_match) {
    confidence = 'high'; // Name close enough, school matches
  } else if (best.name_exact) {
    confidence = 'medium'; // Exact name but different school (possible transfer)
  } else {
    confidence = 'low';
  }

  // Flag if likely transfer (name matches but school doesn't)
  const possibleTransfer = best.name_exact && !best.school_match;

  return {
    athletic_net_id: best.athletic_net_id,
    matched_name: best.matched_name,
    matched_school: best.matched_school,
    confidence: confidence,
    possible_transfer: possibleTransfer,
    score: best.score,
    other_candidates: candidates.length > 1 ? candidates.slice(1, 3) : [] // Keep top 2 alternates
  };
}

// Load checkpoint
function loadCheckpoint() {
  const file = path.join(OUTPUT_DIR, 'mapping-checkpoint.json');
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
      log('Could not load checkpoint', 'WARN');
    }
  }
  return { lastIndex: -1, startedAt: new Date().toISOString() };
}

// Save checkpoint
function saveCheckpoint(checkpoint) {
  const file = path.join(OUTPUT_DIR, 'mapping-checkpoint.json');
  fs.writeFileSync(file, JSON.stringify(checkpoint, null, 2));
}

// Append to mapping file
function appendMapping(mappings) {
  const file = path.join(OUTPUT_DIR, 'athlete-mapping.json');
  let existing = [];
  if (fs.existsSync(file)) {
    try {
      existing = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
      existing = [];
    }
  }
  existing.push(...mappings);
  fs.writeFileSync(file, JSON.stringify(existing, null, 2));
}

// Append to no-match file
function appendNoMatch(athletes) {
  const file = path.join(OUTPUT_DIR, 'no-match.json');
  let existing = [];
  if (fs.existsSync(file)) {
    try {
      existing = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
      existing = [];
    }
  }
  existing.push(...athletes);
  fs.writeFileSync(file, JSON.stringify(existing, null, 2));
}

// Main function
async function mapAthletes(options = {}) {
  const { fresh = false, testLimit = null } = options;

  log('========================================');
  log('Athletic.net Athlete ID Mapper');
  log('========================================');

  // Load athletes from database (paginated to get all)
  log('Loading athletes from database...');
  let allAthletes = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data: athletes, error } = await supabase
      .from('athletes')
      .select('athlete_id, full_name, school_id, schools(short_name)')
      .order('athlete_id')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      log(`Database error: ${error.message}`, 'ERROR');
      process.exit(1);
    }

    if (!athletes || athletes.length === 0) break;

    allAthletes.push(...athletes);
    log(`  Loaded page ${page + 1} (${allAthletes.length} total)`);
    page++;

    if (athletes.length < pageSize) break; // Last page
  }

  const athletes = allAthletes;

  // Flatten school name
  const athleteList = athletes.map(a => ({
    athlete_id: a.athlete_id,
    full_name: a.full_name,
    school_name: a.schools?.short_name || ''
  }));

  log(`Loaded ${athleteList.length.toLocaleString()} athletes`);

  // Load checkpoint
  let checkpoint = fresh ? { lastIndex: -1, startedAt: new Date().toISOString() } : loadCheckpoint();
  const startIndex = checkpoint.lastIndex + 1;

  if (startIndex > 0 && !fresh) {
    log(`Resuming from index ${startIndex}`);
  }

  // Determine end
  const endIndex = testLimit ? Math.min(startIndex + testLimit, athleteList.length) : athleteList.length;
  log(`Processing athletes ${startIndex} to ${endIndex - 1}`);

  // Stats
  let matchCount = 0;
  let noMatchCount = 0;
  let errorCount = 0;
  let pendingMappings = [];
  let pendingNoMatch = [];

  // Process
  for (let i = startIndex; i < endIndex; i++) {
    const athlete = athleteList[i];
    const progress = `[${i + 1}/${endIndex}]`;

    try {
      // Search by name
      const query = athlete.full_name;
      const results = await searchAthleticNet(query);

      // Find match
      const match = findBestMatch(athlete, results);

      if (match) {
        matchCount++;
        pendingMappings.push({
          athlete_id: athlete.athlete_id,
          full_name: athlete.full_name,
          school_name: athlete.school_name,
          ...match,
          mapped_at: new Date().toISOString()
        });
        const transferFlag = match.possible_transfer ? ' [TRANSFER?]' : '';
        log(`${progress} ✓ ${athlete.full_name} → ${match.athletic_net_id} (${match.confidence})${transferFlag}`);
      } else {
        noMatchCount++;
        pendingNoMatch.push({
          athlete_id: athlete.athlete_id,
          full_name: athlete.full_name,
          school_name: athlete.school_name
        });
        log(`${progress} ✗ ${athlete.full_name} - no match`);
      }

      // Update checkpoint
      checkpoint.lastIndex = i;

      // Save periodically
      if (pendingMappings.length + pendingNoMatch.length >= config.SAVE_EVERY || i === endIndex - 1) {
        if (pendingMappings.length > 0) appendMapping(pendingMappings);
        if (pendingNoMatch.length > 0) appendNoMatch(pendingNoMatch);
        saveCheckpoint(checkpoint);
        log(`Saved ${pendingMappings.length} mappings, ${pendingNoMatch.length} no-match`);
        pendingMappings = [];
        pendingNoMatch = [];
      }

      // Rate limit
      await sleep(config.DELAY_BETWEEN_REQUESTS);

    } catch (error) {
      if (error.message === 'RATE_LIMITED') {
        log(`${progress} Rate limited! Waiting 1 minute...`, 'WARN');
        await sleep(config.DELAY_ON_RATE_LIMIT);
        i--; // Retry this athlete
        continue;
      }

      errorCount++;
      log(`${progress} Error: ${athlete.full_name} - ${error.message}`, 'ERROR');
      await sleep(config.DELAY_ON_ERROR);
    }

    // Progress report
    if ((i + 1) % 1000 === 0) {
      log(`--- Progress: ${i + 1}/${endIndex} | Matched: ${matchCount} | No match: ${noMatchCount} | Errors: ${errorCount} ---`);
    }
  }

  // Final save
  if (pendingMappings.length > 0) appendMapping(pendingMappings);
  if (pendingNoMatch.length > 0) appendNoMatch(pendingNoMatch);
  saveCheckpoint(checkpoint);

  // Report
  log('========================================');
  log('MAPPING COMPLETE');
  log('========================================');
  log(`Total processed: ${matchCount + noMatchCount + errorCount}`);
  log(`Matched: ${matchCount} (${((matchCount / (matchCount + noMatchCount)) * 100).toFixed(1)}%)`);
  log(`No match: ${noMatchCount}`);
  log(`Errors: ${errorCount}`);
  log(`Mapping saved to: ${path.join(OUTPUT_DIR, 'athlete-mapping.json')}`);
}

// Parse args
const args = process.argv.slice(2);
const options = {
  fresh: args.includes('--fresh'),
  testLimit: null
};

const testIndex = args.indexOf('--test');
if (testIndex !== -1 && args[testIndex + 1]) {
  options.testLimit = parseInt(args[testIndex + 1]);
}

// Run
mapAthletes(options).catch(error => {
  log(`Fatal error: ${error.message}`, 'ERROR');
  process.exit(1);
});
