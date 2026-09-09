#!/usr/bin/env node
/**
 * Build a private TFRRS athlete crosswalk from the public athlete search.
 *
 * Some TFRRS meet result pages publish a name but omit the athlete profile ID. The public
 * search can recover a profile ID, but a search hit alone is not enough to identify a person:
 * the profile page must also contain the exact canonical TFRRS team link for the source row.
 * This script only promotes an alias when the existing public athlete record also passes the
 * same name, gender, and school safety checks used by the historical crosswalk.
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
  loadPublicTargets,
  loadSourceRows,
  normalizeName,
  profileFromHref,
} = require('./promote_historical_athlete_aliases');

const SEARCH_URL = 'https://www.tfrrs.org/?do=search';
const SEARCH_POST_URL = 'https://www.tfrrs.org/search.html';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/139 Safari/537.36';
const DEFAULT_SEARCH_DELAY_MS = 500;
const DEFAULT_PROFILE_DELAY_MS = 250;
const REQUEST_TIMEOUT_MS = 15000;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

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
    limit: valueAfter(argv, '--limit') ? Number(valueAfter(argv, '--limit')) : null,
    searchDelayMs: valueAfter(argv, '--search-delay-ms')
      ? Number(valueAfter(argv, '--search-delay-ms'))
      : DEFAULT_SEARCH_DELAY_MS,
    profileDelayMs: valueAfter(argv, '--profile-delay-ms')
      ? Number(valueAfter(argv, '--profile-delay-ms'))
      : DEFAULT_PROFILE_DELAY_MS,
  };
}

function cookieHeader(setCookie) {
  return (setCookie || []).map(value => String(value).split(';')[0]).join('; ');
}

function surnameForSearch(name) {
  const tokens = String(name || '').trim().split(/\s+/).filter(Boolean);
  while (tokens.length > 1 && /^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens[tokens.length - 1] || null;
}

function parseSearchProfiles(html) {
  const $ = cheerio.load(html);
  const profiles = new Map();
  $('#myTable tbody tr').each((_, tr) => {
    const anchor = $(tr).find('a').filter((__, element) => (
      String($(element).attr('href') || '').includes('/athletes/')
    )).first();
    if (!anchor.length) return;
    const href = anchor.attr('href');
    const match = String(href || '').match(/\/athletes\/(\d+)/i);
    if (!match) return;
    const parsed = profileFromHref(href, $(anchor).text());
    const profile = parsed || {
      id: match[1],
      name: $(anchor).text().replace(/\s+/g, ' ').trim(),
      profileUrl: String(href).startsWith('http') ? href : `https://www.tfrrs.org${href}`,
    };
    if (!profiles.has(profile.id)) profiles.set(profile.id, profile);
  });
  return [...profiles.values()];
}

function parseProfileTeamKeys(html) {
  const $ = cheerio.load(html);
  return new Set(
    $('a').map((_, anchor) => String($(anchor).attr('href') || ''))
      .get()
      .map(href => {
        const match = href.match(/\/teams\/tf\/([^/?#]+)/i);
        return match ? match[1].replace(/\.html$/i, '').toLowerCase() : null;
      })
      .filter(Boolean)
  );
}

async function requestWithRetry(request, { retries = 2, retryDelayMs = 1000 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      const response = await request();
      if (!RETRYABLE_STATUS.has(response.status) || attempt >= retries) return response;
      await sleep(retryDelayMs * (attempt + 1));
    } catch (error) {
      const status = error.response?.status;
      if (attempt >= retries || (status && !RETRYABLE_STATUS.has(status))) throw error;
      await sleep(retryDelayMs * (attempt + 1));
    }
    attempt += 1;
  }
}

async function createSearchSession(http = axios) {
  const response = await requestWithRetry(() => http.get(SEARCH_URL, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: REQUEST_TIMEOUT_MS,
  }));
  const $ = cheerio.load(response.data);
  const token = $('input[name="authenticity_token"]').attr('value');
  if (!token) throw new Error('TFRRS search form did not expose an authenticity token');
  return {
    token,
    cookie: cookieHeader(response.headers['set-cookie']),
  };
}

async function searchSurname(session, surname, http = axios) {
  const response = await requestWithRetry(() => http.post(
    SEARCH_POST_URL,
    new URLSearchParams({
      authenticity_token: session.token,
      athlete: surname,
      team: '',
      meet: '',
    }).toString(),
    {
      headers: {
        'User-Agent': USER_AGENT,
        Cookie: session.cookie,
        Referer: SEARCH_URL,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: REQUEST_TIMEOUT_MS,
      validateStatus: () => true,
    }
  ));
  if (response.status !== 200) throw new Error(`TFRRS search returned HTTP ${response.status}`);
  return parseSearchProfiles(response.data);
}

async function loadPublicSearchProfiles(names, {
  delayMs = DEFAULT_SEARCH_DELAY_MS,
  http = axios,
  session = null,
  onProgress = () => {},
} = {}) {
  let searchSession = session || await createSearchSession(http);
  const surnames = [...new Set(names.map(surnameForSearch).filter(Boolean))].sort();
  const profiles = new Map();
  const queries = [];
  for (let index = 0; index < surnames.length; index += 1) {
    if (index > 0 && delayMs > 0) await sleep(delayMs);
    const surname = surnames[index];
    let hits = [];
    let error = null;
    try {
      hits = await searchSurname(searchSession, surname, http);
    } catch (firstError) {
      try {
        searchSession = await createSearchSession(http);
        hits = await searchSurname(searchSession, surname, http);
      } catch (secondError) {
        error = secondError.message || firstError.message;
      }
    }
    queries.push({ surname, hits: hits.length, ...(error ? { error } : {}) });
    onProgress({ phase: 'search', completed: index + 1, total: surnames.length, surname, hits: hits.length });
    for (const profile of hits) {
      if (!profiles.has(profile.id)) profiles.set(profile.id, profile);
    }
  }
  return {
    profiles: [...profiles.values()],
    queries,
    searchErrors: queries.filter(query => query.error).length,
    session: searchSession,
  };
}

async function loadProfileEvidence(profile, {
  http = axios,
  delayMs = DEFAULT_PROFILE_DELAY_MS,
} = {}) {
  if (delayMs > 0) await sleep(delayMs);
  const response = await requestWithRetry(() => http.get(profile.profileUrl, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: REQUEST_TIMEOUT_MS,
  }));
  if (response.status !== 200) throw new Error(`TFRRS profile returned HTTP ${response.status}`);
  return {
    ...profile,
    teamKeys: [...parseProfileTeamKeys(response.data)],
  };
}

function identitiesFromRows(rows) {
  const identities = new Map();
  for (const row of rows) {
    const identity = identityFromRow(row);
    if (identity && !identities.has(identity.sourceAthleteKey)) {
      identities.set(identity.sourceAthleteKey, identity);
    }
  }
  return identities;
}

async function loadPublicSearchCandidates(rows, {
  searchDelayMs = DEFAULT_SEARCH_DELAY_MS,
  profileDelayMs = DEFAULT_PROFILE_DELAY_MS,
  http = axios,
  onProgress = () => {},
} = {}) {
  const identities = identitiesFromRows(rows);
  const identityNames = [...identities.values()].map(identity => identity.sourceAthleteName);
  const search = await loadPublicSearchProfiles(identityNames, {
    delayMs: searchDelayMs,
    http,
    onProgress,
  });
  const profilesByName = new Map();
  for (const profile of search.profiles) {
    const key = normalizeName(profile.name);
    if (!profilesByName.has(key)) profilesByName.set(key, []);
    profilesByName.get(key).push(profile);
  }

  const evidenceByProfileId = new Map();
  const candidates = new Map();
  const stats = {
    identities: identities.size,
    search_queries: search.queries.length,
    search_profiles: search.profiles.length,
    search_errors: search.searchErrors,
    search_error_surnames: search.queries.filter(query => query.error).map(query => query.surname),
    exact_name_hits: 0,
    team_verified_hits: 0,
    team_mismatch_hits: 0,
    team_unverified_hits: 0,
    profile_fetch_errors: 0,
  };

  const identityList = [...identities.values()];
  for (let index = 0; index < identityList.length; index += 1) {
    const identity = identityList[index];
    const exactHits = profilesByName.get(normalizeName(identity.sourceAthleteName)) || [];
    if (exactHits.length) stats.exact_name_hits += 1;
    for (const profile of exactHits) {
      let evidence = evidenceByProfileId.get(profile.id);
      if (!evidence) {
        try {
          evidence = await loadProfileEvidence(profile, { http, delayMs: profileDelayMs });
          evidenceByProfileId.set(profile.id, evidence);
        } catch (error) {
          stats.profile_fetch_errors += 1;
          evidenceByProfileId.set(profile.id, { ...profile, teamKeys: [], error: error.message });
          evidence = evidenceByProfileId.get(profile.id);
        }
      }
      if (evidence.teamKeys.includes(identity.teamKey)) {
        stats.team_verified_hits += 1;
        const candidate = {
          ...profile,
          evidenceType: 'tfrrs_public_profile_team_link',
          evidenceTeamKeys: evidence.teamKeys,
        };
        const key = `${identity.sourceGender}|${identity.teamKey}|${normalizeName(identity.sourceAthleteName)}`;
        if (!candidates.has(key)) candidates.set(key, new Map());
        candidates.get(key).set(candidate.id, candidate);
      } else if (evidence.teamKeys.length) {
        stats.team_mismatch_hits += 1;
      } else {
        stats.team_unverified_hits += 1;
      }
    }
    onProgress({ phase: 'profile', completed: index + 1, total: identityList.length, name: identity.sourceAthleteName });
  }

  return { candidates, stats, searchQueries: search.queries };
}

function selectRows(rows, limit) {
  if (!Number.isFinite(limit) || limit <= 0) return rows;
  const identities = [...identitiesFromRows(rows).values()].slice(0, limit);
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
  searchDelayMs = DEFAULT_SEARCH_DELAY_MS,
  profileDelayMs = DEFAULT_PROFILE_DELAY_MS,
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
    application_name: 'trackhub-tfrrs-public-search-crosswalk',
    ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  try {
    const allRows = await loadSourceRows(db, runId);
    const rows = selectRows(allRows, limit);
    const { candidates, stats, searchQueries } = await loadPublicSearchCandidates(rows, {
      searchDelayMs,
      profileDelayMs,
      http,
      onProgress,
    });
    const candidateIds = new Set();
    for (const profiles of candidates.values()) {
      for (const id of profiles.keys()) candidateIds.add(id);
    }
    const identities = identitiesFromRows(rows);
    const [publicTargets, existingAliases] = await Promise.all([
      loadPublicTargets(db, [...candidateIds]),
      loadExistingAliases(db, [...identities.keys()]),
    ]);
    const plan = buildPlan(rows, candidates, publicTargets, existingAliases);
    const outcome = commit ? await commitPlan(db, plan) : { inserted: 0 };
    return {
      mode: commit ? 'commit' : 'dry_run',
      runId,
      rows: rows.length,
      all_rows: allRows.length,
      ...stats,
      candidate_profiles: [...candidateIds].length,
      verified_inserts: plan.filter(row => row.action === 'insert').length,
      already_active: plan.filter(row => row.action === 'already_active').length,
      holds: plan.filter(row => row.action === 'hold').length,
      hold_reasons: plan.filter(row => row.action === 'hold').reduce((counts, row) => {
        counts[row.reason] = (counts[row.reason] || 0) + 1;
        return counts;
      }, {}),
      search_queries: searchQueries,
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
    limit: args.limit,
    searchDelayMs: args.searchDelayMs,
    profileDelayMs: args.profileDelayMs,
    onProgress: progress => {
      if (progress.phase === 'search'
          && (progress.completed === progress.total || progress.completed % 25 === 0)) {
        console.error(`TFRRS search ${progress.completed}/${progress.total} surnames`);
      }
      if (progress.phase === 'profile'
          && (progress.completed === progress.total || progress.completed % 25 === 0)) {
        console.error(`TFRRS profiles ${progress.completed}/${progress.total} identities`);
      }
    },
  })
    .then(result => {
      console.log(JSON.stringify({ ...result, plan: undefined, search_queries: undefined }, null, 2));
    })
    .catch(error => {
      console.error(`ERROR ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  createSearchSession,
  loadProfileEvidence,
  loadPublicSearchCandidates,
  loadPublicSearchProfiles,
  normalizeName,
  parseArgs,
  parseProfileTeamKeys,
  parseSearchProfiles,
  requestWithRetry,
  run,
  searchSurname,
  surnameForSearch,
  USER_AGENT,
};
