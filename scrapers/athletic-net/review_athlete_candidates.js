#!/usr/bin/env node
/**
 * Build a private candidate report for quarantined AthleticLIVE identities.
 *
 * This script never writes public athletes, aliases, or results. It reads one
 * completed control-plane run, queries Athletic.net for candidate profiles,
 * and writes a review artifact under scrapers/athletic-net/output/.
 *
 *   INGEST_DATABASE_URL='postgresql://...' node review_athlete_candidates.js \
 *     --run-id <dry-run-uuid>
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('./config');
const { AthleticNetSearchClient } = require('./athletic_net_api');
const { findBestMatch } = require('./map-athletes');
const { ensureIngestDatabaseUrl } = require('../shared/private_database_url');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  const runId = valueAfter(argv, '--run-id');
  if (!runId) throw new Error('--run-id is required');
  return {
    runId,
    output: valueAfter(argv, '--output') || null,
  };
}

function sourceAthleteKey(payload = {}) {
  return payload.source_athlete_key || payload.athletic_net_athlete_id || null;
}

function isUnattached(teamName) {
  return /^(unattached|unatt|unattached athlete)$/i.test(String(teamName || '').trim());
}

function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const payload = row.payload || {};
    const key = [
      sourceAthleteKey(payload),
      String(payload.athlete_name || '').trim().toLowerCase(),
      String(payload.team_gender || '').trim().toUpperCase(),
    ].join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        source_athlete_key: sourceAthleteKey(payload),
        source_name: payload.athlete_name || null,
        source_gender: payload.team_gender || null,
        source_team: payload.team_name || null,
        observations: [],
      });
    }
    groups.get(key).observations.push({
      observation_id: row.observation_id,
      source_record_id: row.source_record_id,
      meet_id: row.target_meet_id,
      event: row.raw_event_name,
      mark_raw: row.mark_raw,
      place: row.place,
      round: row.round,
      reason: row.decision_reason,
    });
  }
  return [...groups.values()].sort((a, b) => String(a.source_name).localeCompare(String(b.source_name)));
}

function candidateSearchInput(group) {
  return {
    full_name: group.source_name || '',
    // Unattached is an affiliation state, not school evidence.
    school_name: isUnattached(group.source_team) ? '' : (group.source_team || ''),
  };
}

function buildCandidateRecord(group, results, error = null) {
  const best = results ? findBestMatch(candidateSearchInput(group), results) : null;
  return {
    source_athlete_key: group.source_athlete_key,
    source_name: group.source_name,
    source_gender: group.source_gender,
    source_team: group.source_team,
    observations: group.observations,
    api_status: error ? 'error' : 'ok',
    api_error: error ? { code: error.code || null, message: error.message } : null,
    recommended_candidate: best ? {
      athletic_net_profile_id: best.athletic_net_id,
      matched_name: best.matched_name,
      matched_school: best.matched_school,
      confidence: best.confidence,
      score: best.score,
      possible_transfer: best.possibleTransfer,
    } : null,
    alternate_candidates: best?.other_candidates || [],
    decision: 'needs_review',
  };
}

function athleticNetProfileUrl(profileId) {
  return profileId
    ? `https://www.athletic.net/athlete/${profileId}/track-and-field`
    : null;
}

function attachExistingProfileMatches(candidates, rows) {
  const byUrl = new Map();
  for (const row of rows || []) {
    if (!row.athletic_net_url) continue;
    if (!byUrl.has(row.athletic_net_url)) byUrl.set(row.athletic_net_url, []);
    byUrl.get(row.athletic_net_url).push(row);
  }
  return candidates.map(candidate => {
    const profileId = candidate.recommended_candidate?.athletic_net_profile_id;
    const url = athleticNetProfileUrl(profileId);
    const matches = url ? (byUrl.get(url) || []) : [];
    return {
      ...candidate,
      existing_profile_match_status: matches.length === 1
        ? 'unique'
        : matches.length > 1 ? 'ambiguous' : 'none',
      existing_profile_matches: matches,
    };
  });
}

async function loadExistingProfileMatches(pool, candidates) {
  const profileIds = [...new Set(candidates
    .map(candidate => candidate.recommended_candidate?.athletic_net_profile_id)
    .filter(id => /^\d+$/.test(String(id || ''))))];
  if (!profileIds.length) return [];
  const urls = profileIds.map(athleticNetProfileUrl);
  const result = await pool.query(
    `SELECT a.athlete_id, a.full_name, a.gender, a.tfrrs_athlete_id,
            a.athletic_net_url, s.official_name AS school_name
       FROM public.athletes a
       JOIN public.schools s ON s.school_id = a.school_id
      WHERE a.athletic_net_url = ANY($1::text[])
      ORDER BY a.athlete_id`,
    [urls]
  );
  return result.rows;
}

async function loadRows(pool, runId) {
  const result = await pool.query(
    `SELECT o.observation_id, o.source_record_id, o.target_meet_id,
            o.raw_event_name, o.mark_raw, o.place, o.round,
            o.decision, o.decision_reason, sr.payload
       FROM ingest.observations o
       JOIN ingest.source_records sr ON sr.source_record_id = o.source_record_id
      WHERE o.run_id = $1
        AND o.decision = 'quarantine'
        AND o.entity_type = 'individual_result'
        AND o.decision_reason = 'missing_athlete'
      ORDER BY o.observation_id`,
    [runId]
  );
  return result.rows;
}

async function buildReport({ runId, output = null, env = process.env, client = null } = {}) {
  const url = ensureIngestDatabaseUrl(env);
  if (!url) throw new Error('INGEST_DATABASE_URL is required');

  const pool = new Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 10000,
    application_name: 'trackhub-athletic-net-athlete-review',
    ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  const search = client || new AthleticNetSearchClient({
    endpoint: config.SEARCH_API,
    minDelayMs: config.DELAY_BETWEEN_REQUESTS,
    maxRetries: config.MAX_RETRIES,
    retryBackoffMs: config.RETRY_BACKOFF_MS,
    timeoutMs: config.REQUEST_TIMEOUT_MS,
  });

  try {
    const groups = groupRows(await loadRows(pool, runId));
    let candidates = [];
    for (const group of groups) {
      try {
        const results = await search.search(group.source_name, { sport: 'tf' });
        candidates.push(buildCandidateRecord(group, results));
      } catch (error) {
        candidates.push(buildCandidateRecord(group, null, error));
      }
    }

    candidates = attachExistingProfileMatches(
      candidates,
      await loadExistingProfileMatches(pool, candidates)
    );

    const report = {
      report_version: 1,
      generated_at: new Date().toISOString(),
      run_id: runId,
      source: 'athletic_net',
      public_writes: 0,
      counts: {
        source_identities: candidates.length,
        recommendations: candidates.filter(row => row.recommended_candidate).length,
        high_api_recommendations: candidates.filter(row => row.recommended_candidate?.confidence === 'high').length,
        api_errors: candidates.filter(row => row.api_status === 'error').length,
        unique_existing_profile_matches: candidates.filter(row => row.existing_profile_match_status === 'unique').length,
      },
      candidates,
    };
    const outputPath = output || path.join(
      __dirname,
      config.OUTPUT_DIR,
      `athlete-candidate-review-${runId}.json`
    );
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    return { report, outputPath };
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  buildReport(parseArgs(process.argv.slice(2)))
    .then(({ report, outputPath }) => {
      const errors = report.candidates.filter(row => row.api_status === 'error').length;
      const recommendations = report.candidates.filter(row => row.recommended_candidate).length;
      console.log(`Candidate report: ${outputPath}`);
      console.log(`  source identities: ${report.candidates.length}`);
      console.log(`  API recommendations: ${recommendations}`);
      console.log(`  API errors: ${errors}`);
      console.log('  public writes: 0');
    })
    .catch(error => {
      console.error(`ERROR ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  buildReport,
  buildCandidateRecord,
  candidateSearchInput,
  attachExistingProfileMatches,
  athleticNetProfileUrl,
  groupRows,
  loadExistingProfileMatches,
  isUnattached,
};
