#!/usr/bin/env node
/**
 * Build or promote a private TFRRS athlete crosswalk from official team roster pages.
 *
 * TFRRS championship tables sometimes render athlete names without profile links, while the
 * corresponding gendered team page still contains the current roster with linked profiles. A
 * roster link is accepted only when its team URL is the exact canonical team URL for the source
 * observation, and the existing public athlete passes the shared name/gender/school checks.
 *
 * Dry-run is the default. --commit writes only verified rows to ingest.athlete_aliases; it never
 * creates or mutates public athletes and never writes public results.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const { Pool } = require('pg');

const {
  buildPlan,
  commitPlan,
  identityFromRow,
  loadExistingAliases,
  loadPublicNameTargets,
  loadPublicTargets,
  loadSourceRows,
  normalizeName,
  profileFromHref,
  teamUrlKey,
} = require('./promote_historical_athlete_aliases');
const { requestWithRetry, USER_AGENT } = require('./promote_public_search_athlete_aliases');

const TFRRS_TEAM_URL = 'https://www.tfrrs.org/teams/tf';
const DEFAULT_DELAY_MS = 250;
const DEFAULT_CONCURRENCY = 3;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  return {
    runId: valueAfter(argv, '--run'),
    commit: argv.includes('--commit'),
    delayMs: valueAfter(argv, '--delay-ms') ? Number(valueAfter(argv, '--delay-ms')) : DEFAULT_DELAY_MS,
    concurrency: valueAfter(argv, '--concurrency')
      ? Number(valueAfter(argv, '--concurrency'))
      : DEFAULT_CONCURRENCY,
  };
}

function parseTeamRosterProfiles(html) {
  const $ = cheerio.load(html);
  const profiles = new Map();
  $('a').filter((_, anchor) => String($(anchor).attr('href') || '').includes('/athletes/'))
    .each((_, anchor) => {
      const profile = profileFromHref($(anchor).attr('href'), $(anchor).text());
      if (profile && !profiles.has(profile.id)) profiles.set(profile.id, profile);
    });
  return [...profiles.values()];
}

async function loadTeamRosterProfiles(teamKey, { http = axios } = {}) {
  const url = `${TFRRS_TEAM_URL}/${teamKey}.html`;
  const response = await requestWithRetry(() => http.get(url, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 15000,
  }));
  if (response.status !== 200) throw new Error(`TFRRS team roster returned HTTP ${response.status}`);
  return { teamKey, url, profiles: parseTeamRosterProfiles(response.data) };
}

async function loadTeamRosters(teamKeys, {
  delayMs = DEFAULT_DELAY_MS,
  concurrency = DEFAULT_CONCURRENCY,
  http = axios,
  onProgress = () => {},
} = {}) {
  const keys = [...new Set(teamKeys.filter(Boolean))].sort();
  const results = new Map();
  let next = 0;
  let completed = 0;

  const worker = async () => {
    while (true) {
      const index = next++;
      if (index >= keys.length) return;
      if (index > 0 && delayMs > 0) await sleep(delayMs);
      const teamKey = keys[index];
      try {
        results.set(teamKey, await loadTeamRosterProfiles(teamKey, { http }));
      } catch (error) {
        results.set(teamKey, { teamKey, url: `${TFRRS_TEAM_URL}/${teamKey}.html`, profiles: [], error: error.message });
      }
      completed += 1;
      onProgress({ completed, total: keys.length, teamKey, rosterSize: results.get(teamKey).profiles.length });
    }
  };

  const workerCount = Math.min(Math.max(1, Number(concurrency) || 1), Math.max(1, keys.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

function identitiesFromRows(rows) {
  const identities = new Map();
  for (const row of rows) {
    const identity = identityFromRow(row);
    if (identity && !identities.has(identity.sourceAthleteKey)) identities.set(identity.sourceAthleteKey, identity);
  }
  return identities;
}

function buildRosterCandidates(rows, rosters) {
  const identities = identitiesFromRows(rows);
  const candidates = new Map();
  const stats = {
    identities: identities.size,
    team_pages: rosters.size,
    team_page_errors: [...rosters.values()].filter(roster => roster.error).length,
    roster_profiles: [...rosters.values()].reduce((total, roster) => total + roster.profiles.length, 0),
    exact_name_hits: 0,
    ambiguous_name_hits: 0,
    verified_hits: 0,
  };

  for (const identity of identities.values()) {
    const roster = rosters.get(identity.teamKey);
    if (!roster) continue;
    const matches = roster.profiles.filter(profile => (
      normalizeName(profile.name) === normalizeName(identity.sourceAthleteName)
    ));
    if (matches.length) stats.exact_name_hits += 1;
    if (matches.length > 1) stats.ambiguous_name_hits += 1;
    if (matches.length !== 1) continue;
    const profile = {
      ...matches[0],
      evidenceType: 'tfrrs_team_roster_profile_link',
      evidenceTeamKey: identity.teamKey,
      evidenceTeamUrl: `${TFRRS_TEAM_URL}/${identity.teamKey}.html`,
    };
    const key = `${identity.sourceGender}|${identity.teamKey}|${normalizeName(identity.sourceAthleteName)}`;
    if (!candidates.has(key)) candidates.set(key, new Map());
    candidates.get(key).set(profile.id, profile);
    stats.verified_hits += 1;
  }
  return { candidates, stats };
}

function parseProfileTitleName(html) {
  const $ = cheerio.load(html);
  const title = $("title").text().replace(/\s+/g, " ").trim();
  const match = title.match(/^TFRRS\s*\|\s*(.*?)\s+(?:–|-)\s+Track/i);
  return match ? match[1].trim() : null;
}

async function loadLegacyProfileEvidence(profileId, { http = axios } = {}) {
  const profileUrl = `https://www.tfrrs.org/athletes/${profileId}`;
  const response = await requestWithRetry(() => http.get(profileUrl, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 15000,
  }));
  if (response.status !== 200) throw new Error(`TFRRS legacy profile returned HTTP ${response.status}`);
  const $ = cheerio.load(response.data);
  return {
    id: String(profileId),
    profileUrl,
    name: parseProfileTitleName(response.data),
    teamKeys: new Set(
      $('a').map((_, anchor) => String($(anchor).attr('href') || ''))
        .get()
        .map(href => {
          const match = href.match(/\/teams\/tf\/([^/?#]+)/i);
          return match ? match[1].replace(/\.html$/i, '').toLowerCase() : null;
        })
        .filter(Boolean)
    ),
  };
}

async function loadLegacyProfileEvidenceMap(profileIds, {
  delayMs = DEFAULT_DELAY_MS,
  concurrency = DEFAULT_CONCURRENCY,
  http = axios,
  onProgress = () => {},
} = {}) {
  const ids = [...new Set(profileIds.map(String).filter(Boolean))].sort();
  const results = new Map();
  let next = 0;
  let completed = 0;

  const worker = async () => {
    while (true) {
      const index = next++;
      if (index >= ids.length) return;
      if (index > 0 && delayMs > 0) await sleep(delayMs);
      const id = ids[index];
      try {
        results.set(id, await loadLegacyProfileEvidence(id, { http }));
      } catch (error) {
        results.set(id, { id, profileUrl: `https://www.tfrrs.org/athletes/${id}`, teamKeys: new Set(), error: error.message });
      }
      completed += 1;
      onProgress({ completed, total: ids.length, profileId: id, error: results.get(id).error || null });
    }
  };

  const workerCount = Math.min(Math.max(1, Number(concurrency) || 1), Math.max(1, ids.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

function buildCrossSeasonCandidates(rows, rosterCandidates, publicNameTargets, legacyProfiles) {
  const identities = identitiesFromRows(rows);
  const candidates = new Map();
  const stats = {
    eligible_name_targets: 0,
    legacy_profiles_checked: 0,
    legacy_profile_errors: 0,
    legacy_team_verified_hits: 0,
    legacy_team_mismatch_hits: 0,
  };

  for (const identity of identities.values()) {
    const rosterKey = `${identity.sourceGender}|${identity.teamKey}|${normalizeName(identity.sourceAthleteName)}`;
    const currentProfiles = rosterCandidates.get(rosterKey);
    if (currentProfiles && currentProfiles.size !== 1) continue;

    const targetRows = publicNameTargets.filter(target => (
      normalizeName(target.full_name) === normalizeName(identity.sourceAthleteName)
      && (Number(target.school_id) === identity.targetSchoolId || Number(target.school_id) === 1835)
      && target.tfrrs_athlete_id != null
      && (target.gender == null || target.gender === identity.sourceGender)
    ));
    stats.eligible_name_targets += targetRows.length;
    const profiles = new Map();
    for (const target of targetRows) {
      const legacy = legacyProfiles.get(String(target.tfrrs_athlete_id));
      if (!legacy) continue;
      stats.legacy_profiles_checked += 1;
      if (legacy.error) {
        stats.legacy_profile_errors += 1;
        continue;
      }
      if (normalizeName(legacy.name) !== normalizeName(identity.sourceAthleteName)) {
        stats.legacy_team_mismatch_hits += 1;
        continue;
      }
      if (!legacy.teamKeys.has(identity.teamKey)) {
        stats.legacy_team_mismatch_hits += 1;
        continue;
      }
      stats.legacy_team_verified_hits += 1;
      profiles.set(String(target.tfrrs_athlete_id), {
        id: String(target.tfrrs_athlete_id),
        name: identity.sourceAthleteName,
        profileUrl: legacy.profileUrl,
        evidenceType: currentProfiles
          ? 'tfrrs_cross_season_profile_pair'
          : 'tfrrs_legacy_profile_team_match',
        evidenceTeamKey: identity.teamKey,
        evidenceTeamUrl: `${TFRRS_TEAM_URL}/${identity.teamKey}.html`,
        currentProfileUrl: currentProfiles ? [...currentProfiles.values()][0].profileUrl : null,
      });
    }
    if (profiles.size) candidates.set(rosterKey, profiles);
  }
  return { candidates, stats };
}

function preferCrossSeasonCandidates(rosterCandidates, crossSeasonCandidates) {
  const merged = new Map(rosterCandidates);
  for (const [key, profiles] of crossSeasonCandidates) merged.set(key, profiles);
  return merged;
}

function selectRows(rows, identitiesLimit) {
  if (!Number.isFinite(identitiesLimit) || identitiesLimit <= 0) return rows;
  const identities = [...identitiesFromRows(rows).values()].slice(0, identitiesLimit);
  const selectedKeys = new Set(identities.map(identity => identity.sourceAthleteKey));
  return rows.filter(row => {
    const identity = identityFromRow(row);
    return identity && selectedKeys.has(identity.sourceAthleteKey);
  });
}

async function run({
  runId,
  commit = false,
  limit = null,
  delayMs = DEFAULT_DELAY_MS,
  concurrency = DEFAULT_CONCURRENCY,
  env = process.env,
  pool = null,
  http = axios,
  onProgress = () => {},
} = {}) {
  if (!runId) throw new Error('--run is required');
  if (!env.INGEST_DATABASE_URL && !pool) throw new Error('INGEST_DATABASE_URL is required');
  const db = pool || new Pool({
    connectionString: env.INGEST_DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 15000,
    application_name: 'trackhub-tfrrs-team-roster-crosswalk',
    ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  try {
    const allRows = await loadSourceRows(db, runId);
    const rows = selectRows(allRows, limit);
    const identities = identitiesFromRows(rows);
    const rosters = await loadTeamRosters([...new Set([...identities.values()].map(identity => identity.teamKey))], {
      delayMs,
      concurrency,
      http,
      onProgress: progress => onProgress({ phase: 'team', ...progress }),
    });
    const { candidates, stats } = buildRosterCandidates(rows, rosters);
    const [publicNameTargets, existingAliases] = await Promise.all([
      loadPublicNameTargets(db, [...identities.values()].map(identity => identity.targetSchoolId)),
      loadExistingAliases(db, [...identities.keys()]),
    ]);
    const eligibleLegacyIds = publicNameTargets
      .filter(target => target.tfrrs_athlete_id != null)
      .filter(target => [...identities.values()].some(identity => (
        normalizeName(target.full_name) === normalizeName(identity.sourceAthleteName)
        && (Number(target.school_id) === identity.targetSchoolId || Number(target.school_id) === 1835)
        && (target.gender == null || target.gender === identity.sourceGender)
      )))
      .map(target => target.tfrrs_athlete_id);
    const legacyProfiles = await loadLegacyProfileEvidenceMap(eligibleLegacyIds, {
      delayMs,
      concurrency,
      http,
      onProgress: progress => onProgress({ phase: 'legacy_profile', ...progress }),
    });
    const crossSeason = buildCrossSeasonCandidates(rows, candidates, publicNameTargets, legacyProfiles);
    const mergedCandidates = preferCrossSeasonCandidates(candidates, crossSeason.candidates);
    const candidateIds = new Set();
    for (const profiles of mergedCandidates.values()) {
      for (const id of profiles.keys()) candidateIds.add(id);
    }
    const publicTargets = await loadPublicTargets(db, [...candidateIds]);
    const plan = buildPlan(rows, mergedCandidates, publicTargets, existingAliases, publicNameTargets);
    const outcome = commit ? await commitPlan(db, plan) : { inserted: 0 };
    return {
      mode: commit ? 'commit' : 'dry_run',
      runId,
      rows: rows.length,
      all_rows: allRows.length,
      ...stats,
      ...crossSeason.stats,
      candidate_profiles: candidateIds.size,
      verified_inserts: plan.filter(row => row.action === 'insert').length,
      already_active: plan.filter(row => row.action === 'already_active').length,
      holds: plan.filter(row => row.action === 'hold').length,
      hold_reasons: plan.filter(row => row.action === 'hold').reduce((counts, row) => {
        counts[row.reason] = (counts[row.reason] || 0) + 1;
        return counts;
      }, {}),
      ...outcome,
      plan,
    };
  } finally {
    if (!pool) await db.end();
  }
}

if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
  if (!process.env.INGEST_DATABASE_URL && process.env.DB_PASSWORD) {
    const host = process.env.INGEST_DATABASE_HOST
      || process.env.SUPABASE_DB_HOST
      || 'db.hunbahsnaeeztmzqpnrl.supabase.co';
    const port = process.env.INGEST_DATABASE_PORT || '5432';
    const database = process.env.INGEST_DATABASE_NAME || 'postgres';
    const user = process.env.INGEST_DATABASE_USER || 'postgres';
    process.env.INGEST_DATABASE_URL = `postgresql://${user}:${encodeURIComponent(process.env.DB_PASSWORD)}@${host}:${port}/${database}`;
  }
  const args = parseArgs(process.argv.slice(2));
  run({
    runId: args.runId,
    commit: args.commit,
    delayMs: args.delayMs,
    concurrency: args.concurrency,
    onProgress: progress => {
      if (progress.completed === progress.total || progress.completed % 10 === 0) {
        console.error(`TFRRS team pages ${progress.completed}/${progress.total}`);
      }
    },
  })
    .then(result => {
      console.log(JSON.stringify({ ...result, plan: undefined }, null, 2));
    })
    .catch(error => {
      console.error(`ERROR ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  buildCrossSeasonCandidates,
  buildRosterCandidates,
  identitiesFromRows,
  loadTeamRosterProfiles,
  loadTeamRosters,
  loadLegacyProfileEvidence,
  loadLegacyProfileEvidenceMap,
  parseArgs,
  parseProfileTitleName,
  parseTeamRosterProfiles,
  run,
  selectRows,
};
