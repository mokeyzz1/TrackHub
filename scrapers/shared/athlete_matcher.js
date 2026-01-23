#!/usr/bin/env node
/**
 * Athlete Matcher
 *
 * Matches scraped athlete names to athletes in the database.
 * Uses fuzzy matching and team context for accurate matches.
 *
 * Matching strategy:
 * 1. Exact match on name + team
 * 2. Fuzzy match on name with team verification
 * 3. Name variants (First Last vs Last, First)
 */

const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace('https://', '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Supabase REST helper
function supabaseRequest(method, endpoint, data = null) {
  return new Promise((resolve, reject) => {
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
    };
    if (method === 'POST' || method === 'PATCH') {
      headers['Prefer'] = 'return=representation';
    }
    const options = {
      hostname: SUPABASE_URL,
      path: '/rest/v1/' + endpoint,
      method: method,
      headers: headers
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = body ? JSON.parse(body) : {};
          if (res.statusCode >= 400) {
            reject({ status: res.statusCode, message: result.message || body });
          } else {
            resolve(result);
          }
        } catch (e) {
          resolve(body);
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

/**
 * Normalize name for comparison
 */
function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')  // Remove non-letters
    .replace(/\s+/g, ' ')       // Normalize spaces
    .trim();
}

/**
 * Get name variants (First Last, Last First, etc.)
 */
function getNameVariants(name) {
  const normalized = normalizeName(name);
  const parts = normalized.split(' ').filter(p => p.length > 0);

  if (parts.length < 2) return [normalized];

  const variants = [normalized];

  // First Last
  variants.push(parts.join(' '));

  // Last, First (if comma present)
  if (name.includes(',')) {
    const [last, first] = name.split(',').map(s => normalizeName(s));
    variants.push(`${first} ${last}`);
    variants.push(`${last} ${first}`);
  } else {
    // Assume First Last, add Last First variant
    const first = parts[0];
    const last = parts.slice(1).join(' ');
    variants.push(`${last} ${first}`);
  }

  // Handle middle names - try without middle
  if (parts.length > 2) {
    variants.push(`${parts[0]} ${parts[parts.length - 1]}`);
  }

  return [...new Set(variants)];
}

/**
 * Calculate similarity between two strings (0-1)
 */
function similarity(s1, s2) {
  const n1 = normalizeName(s1);
  const n2 = normalizeName(s2);

  if (n1 === n2) return 1.0;
  if (!n1 || !n2) return 0;

  // Check variants
  const v1 = getNameVariants(s1);
  const v2 = getNameVariants(s2);

  for (const v of v1) {
    if (v2.includes(v)) return 0.95;
  }

  // Levenshtein-based similarity
  const maxLen = Math.max(n1.length, n2.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshtein(n1, n2);
  return 1 - (distance / maxLen);
}

/**
 * Levenshtein distance
 */
function levenshtein(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Normalize team name for comparison
 */
function normalizeTeam(team) {
  if (!team) return '';
  return team
    .toLowerCase()
    .replace(/university|college|state|tech|inst\.?/gi, '')
    .replace(/\([^)]*\)/g, '')  // Remove parenthetical
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if two team names likely match
 */
function teamsMatch(team1, team2) {
  const t1 = normalizeTeam(team1);
  const t2 = normalizeTeam(team2);

  if (!t1 || !t2) return false;
  if (t1 === t2) return true;

  // Check if one contains the other
  if (t1.includes(t2) || t2.includes(t1)) return true;

  // Check similarity
  return similarity(t1, t2) > 0.7;
}

class AthleteMatcher {
  constructor() {
    this.athleteCache = new Map();
    this.teamCache = new Map();
  }

  /**
   * Load athletes from database (with caching)
   */
  async loadAthletes(teamName = null) {
    const cacheKey = teamName || '__all__';

    if (this.athleteCache.has(cacheKey)) {
      return this.athleteCache.get(cacheKey);
    }

    // athletes -> schools via school_id
    let endpoint = 'athletes?select=athlete_id,full_name,school_id,schools(school_id,official_name,short_name)';

    if (teamName) {
      // Search by school name - rough filter, refined in code
      const normalizedTeam = normalizeTeam(teamName);
      const firstWord = normalizedTeam.split(' ')[0];
      if (firstWord.length > 2) {
        endpoint += `&schools.official_name=ilike.*${encodeURIComponent(firstWord)}*`;
      }
    }

    endpoint += '&limit=5000';

    try {
      const athletes = await supabaseRequest('GET', endpoint);
      this.athleteCache.set(cacheKey, athletes);
      return athletes;
    } catch (e) {
      console.error('Error loading athletes:', e.message);
      return [];
    }
  }

  /**
   * Find best match for an athlete name + team
   */
  async findMatch(athleteName, teamName, eventName = null) {
    // Load potential matches
    const athletes = await this.loadAthletes(teamName);

    let bestMatch = null;
    let bestScore = 0;

    for (const athlete of athletes) {
      // Calculate name similarity
      const nameSim = similarity(athleteName, athlete.full_name);

      // Check team match (athlete.schools is from the join)
      const schoolName = athlete.schools?.official_name || athlete.schools?.short_name;
      const teamMatches = schoolName && teamsMatch(teamName, schoolName);

      // Calculate combined score
      let score = nameSim;

      if (teamMatches) {
        score += 0.3; // Boost for team match
      } else if (schoolName) {
        score -= 0.2; // Penalty for team mismatch
      }

      // Threshold for consideration
      if (score > bestScore && nameSim > 0.7) {
        bestScore = score;
        bestMatch = {
          athlete_id: athlete.athlete_id,
          full_name: athlete.full_name,
          school_id: athlete.school_id,
          school_name: schoolName,
          confidence: Math.min(score, 1.0),
          name_similarity: nameSim,
          team_matched: teamMatches
        };
      }
    }

    return bestMatch;
  }

  /**
   * Match multiple entries and update database
   */
  async matchEntries(meetId) {
    console.log(`Matching entries for meet ${meetId}...`);

    // Get unmatched entries
    const entries = await supabaseRequest('GET',
      `meet_entries?meet_id=eq.${meetId}&athlete_id=is.null&select=entry_id,athlete_name,team_name,event_name`
    );

    console.log(`Found ${entries.length} unmatched entries`);

    let matched = 0;
    let unmatched = 0;

    for (const entry of entries) {
      const match = await this.findMatch(entry.athlete_name, entry.team_name, entry.event_name);

      if (match && match.confidence > 0.75) {
        // Update entry with match
        await supabaseRequest('PATCH', `meet_entries?entry_id=eq.${entry.entry_id}`, {
          athlete_id: match.athlete_id,
          team_id: match.team_id,
          match_confidence: match.confidence,
          updated_at: new Date().toISOString()
        });

        console.log(`  ✓ ${entry.athlete_name} → ${match.full_name} (${(match.confidence * 100).toFixed(0)}%)`);
        matched++;
      } else {
        console.log(`  ✗ ${entry.athlete_name} (${entry.team_name}) - no match`);
        unmatched++;
      }
    }

    console.log(`\nMatching complete: ${matched} matched, ${unmatched} unmatched`);
    return { matched, unmatched };
  }

  /**
   * Match a single result record
   */
  async matchResult(participantName, teamName) {
    return await this.findMatch(participantName, teamName);
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const matcher = new AthleteMatcher();

  if (command === 'match-meet' && args[1]) {
    const meetId = parseInt(args[1]);
    matcher.matchEntries(meetId)
      .then(result => {
        console.log('\nDone!');
        process.exit(0);
      })
      .catch(err => {
        console.error('Error:', err);
        process.exit(1);
      });
  } else if (command === 'test' && args[1]) {
    const name = args[1];
    const team = args[2] || '';
    matcher.findMatch(name, team)
      .then(match => {
        if (match) {
          console.log('\nBest match:');
          console.log(`  Name: ${match.full_name}`);
          console.log(`  Team: ${match.school_name}`);
          console.log(`  Confidence: ${(match.confidence * 100).toFixed(0)}%`);
          console.log(`  Athlete ID: ${match.athlete_id}`);
        } else {
          console.log('\nNo match found');
        }
        process.exit(0);
      })
      .catch(err => {
        console.error('Error:', err);
        process.exit(1);
      });
  } else {
    console.log('Usage:');
    console.log('  node athlete_matcher.js match-meet <meet_id>');
    console.log('  node athlete_matcher.js test "<athlete_name>" "<team_name>"');
    console.log('');
    console.log('Examples:');
    console.log('  node athlete_matcher.js match-meet 123');
    console.log('  node athlete_matcher.js test "John Smith" "Nebraska"');
    process.exit(1);
  }
}

module.exports = { AthleteMatcher, similarity, teamsMatch, normalizeName };
