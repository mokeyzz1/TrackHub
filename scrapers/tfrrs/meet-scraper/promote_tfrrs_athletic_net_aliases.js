#!/usr/bin/env node
/**
 * Build a private TFRRS crosswalk for rows whose TFRRS result page omitted athlete IDs.
 *
 * Athletic.net is used only as corroborating identity evidence here. An alias is eligible only
 * when the TFRRS team-scoped identity, an exact Athletic.net name/school result, and one existing
 * canonical athlete row that already owns that Athletic.net profile all agree. Dry-run is the
 * default; --commit inserts only private scoped aliases and never changes public facts.
 */

const path = require('path');
const { Pool } = require('pg');
const { AthleticNetSearchClient } = require('../../athletic-net/athletic_net_api');
const {
  identityFromRow,
  loadExistingAliases,
  loadSourceRows,
  normalizeName,
} = require('./promote_historical_athlete_aliases');

require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const UNATTACHED_SCHOOL_ID = 1835;

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  return {
    runId: valueAfter(argv, '--run'),
    commit: argv.includes('--commit'),
    delayMs: valueAfter(argv, '--delay-ms') ? Number(valueAfter(argv, '--delay-ms')) : 250,
    timeoutMs: valueAfter(argv, '--timeout-ms') ? Number(valueAfter(argv, '--timeout-ms')) : 10000,
  };
}

function profileUrl(profileId) {
  return 'https://www.athletic.net/athlete/' + String(profileId).trim() + '/track-and-field';
}

function normalizeSchool(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(university|college|univ|coll)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function schoolMatches(expected, actual) {
  const left = normalizeSchool(expected);
  const right = normalizeSchool(
    String(actual || '').split('||')[0].replace(/\s*\([^)]*\)\s*$/, '')
  );
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function namesCompatible(sourceName, targetName) {
  const source = normalizeName(sourceName);
  const target = normalizeName(targetName);
  return Boolean(source && target && (
    source === target
    || source.endsWith(' ' + target)
    || target.endsWith(' ' + source)
  ));
}

function collegiateDoc(doc) {
  return String(doc && doc.subtext || '').toLowerCase().includes('collegiate');
}

/**
 * Return a candidate only when exactly one API document has exact normalized name and school.
 * This intentionally does not use a fuzzy best-result fallback.
 */
function strictApiCandidate(payload, { sourceAthleteName, sourceSchoolName }) {
  const docs = Array.isArray(payload && payload.response && payload.response.docs)
    ? payload.response.docs
    : [];
  const matches = docs
    .filter(doc => doc.type === 'Athlete' && collegiateDoc(doc))
    .filter(doc => normalizeName(doc.textsuggest) === normalizeName(sourceAthleteName))
    .filter(doc => schoolMatches(sourceSchoolName, doc.subtext))
    .map(doc => ({
      id: String(doc.id_db),
      matched_name: doc.textsuggest,
      matched_school: doc.subtext,
      name_exact: true,
      school_match: true,
      confidence: 'high',
    }));

  if (matches.length !== 1) {
    return {
      candidate: null,
      reason: matches.length ? 'ambiguous_exact_api_candidates' : 'no_exact_api_candidate',
      candidate_count: matches.length,
      candidates: matches,
    };
  }
  return { candidate: matches[0], candidate_count: 1, candidates: matches };
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

function buildPlan(identities, candidateRows, targets, aliases) {
  const candidatesByKey = new Map(candidateRows.map(row => [row.sourceAthleteKey, row]));
  const targetsByUrl = new Map();
  for (const target of targets) {
    const url = String(target.athletic_net_url || '').replace(/\/$/, '');
    if (!url) continue;
    if (!targetsByUrl.has(url)) targetsByUrl.set(url, []);
    targetsByUrl.get(url).push(target);
  }
  const aliasesByKey = new Map(aliases.map(row => [String(row.source_athlete_key), row]));

  return [...identities.values()].map(identity => {
    const candidateRow = candidatesByKey.get(identity.sourceAthleteKey) || null;
    const candidate = candidateRow && candidateRow.candidate;
    const url = candidate ? profileUrl(candidate.id) : null;
    const owners = url ? (targetsByUrl.get(url) || []) : [];
    const alias = aliasesByKey.get(identity.sourceAthleteKey) || null;
    const base = {
      ...identity,
      candidate: candidate || null,
      candidate_count: candidateRow ? candidateRow.candidate_count || 0 : 0,
      candidate_reason: candidateRow ? candidateRow.reason || null : null,
      athletic_net_url: url,
      profile_owners: owners,
      existing_alias: alias,
    };

    if (!candidateRow) return { ...base, action: 'hold', reason: 'candidate_not_searched' };
    if (candidateRow.error) {
      return { ...base, action: 'hold', reason: 'api_error:' + candidateRow.error };
    }
    if (!candidate) {
      return { ...base, action: 'hold', reason: candidateRow.reason || 'candidate_not_verified' };
    }
    if (!candidate.name_exact || !candidate.school_match || candidate.confidence !== 'high') {
      return { ...base, action: 'hold', reason: 'candidate_not_strictly_verified' };
    }
    if (owners.length !== 1) {
      return { ...base, action: 'hold', reason: 'profile_owner_not_unique' };
    }

    const target = owners[0];
    if (!namesCompatible(identity.sourceAthleteName, target.full_name)) {
      return { ...base, target, action: 'hold', reason: 'target_name_mismatch' };
    }
    if (target.gender != null && target.gender !== identity.sourceGender) {
      return { ...base, target, action: 'hold', reason: 'target_gender_mismatch' };
    }
    if (Number(target.school_id) !== Number(identity.targetSchoolId)
        && Number(target.school_id) !== UNATTACHED_SCHOOL_ID) {
      return { ...base, target, action: 'hold', reason: 'target_school_mismatch' };
    }
    if (alias && String(alias.target_athlete_id) !== String(target.athlete_id)) {
      return { ...base, target, action: 'hold', reason: 'existing_alias_conflict' };
    }
    if (alias && alias.status === 'active') {
      return { ...base, target, action: 'already_active', reason: 'existing_alias_matches' };
    }

    return { ...base, target, action: 'insert', reason: 'verified_cross_source_profile' };
  });
}

async function loadSchoolNames(pool, schoolIds) {
  const ids = [...new Set(schoolIds.map(Number).filter(Number.isFinite))];
  if (!ids.length) return new Map();
  const result = await pool.query(
    'SELECT school_id, official_name, short_name FROM public.schools WHERE school_id = ANY($1::bigint[])',
    [ids]
  );
  return new Map(result.rows.map(row => [
    Number(row.school_id),
    row.official_name || row.short_name,
  ]));
}

async function loadPublicTargetsByProfiles(pool, profileIds) {
  const urls = [...new Set(profileIds.map(profileUrl))];
  if (!urls.length) return [];
  const result = await pool.query(
    [
      'SELECT a.athlete_id, a.full_name, a.gender, a.school_id,',
      'a.tfrrs_athlete_id, a.tfrrs_profile_url, a.athletic_net_url,',
      's.official_name AS school_name',
      'FROM public.athletes a JOIN public.schools s ON s.school_id = a.school_id',
      "WHERE regexp_replace(coalesce(a.athletic_net_url, ''), '/+$', '') = ANY($1::text[])",
      'ORDER BY a.athlete_id',
    ].join(' '),
    [urls.map(url => url.replace(/\/$/, ''))]
  );
  return result.rows;
}

async function searchCandidates(identities, schoolNames, {
  delayMs = 250,
  timeoutMs = 10000,
  client = null,
  onProgress = () => {},
} = {}) {
  const search = client || new AthleticNetSearchClient({
    minDelayMs: delayMs,
    maxRetries: 0,
    timeoutMs,
  });
  const out = [];
  const list = [...identities.values()];
  for (let index = 0; index < list.length; index += 1) {
    const identity = list[index];
    const sourceSchoolName = schoolNames.get(Number(identity.targetSchoolId)) || '';
    try {
      const payload = await search.search(identity.sourceAthleteName, { sport: 'tf', rows: 50 });
      out.push({
        sourceAthleteKey: identity.sourceAthleteKey,
        sourceSchoolName,
        ...strictApiCandidate(payload, {
          sourceAthleteName: identity.sourceAthleteName,
          sourceSchoolName,
        }),
      });
    } catch (error) {
      out.push({
        sourceAthleteKey: identity.sourceAthleteKey,
        sourceSchoolName,
        candidate: null,
        candidate_count: 0,
        error: error.code || error.message,
      });
    }
    onProgress({
      completed: index + 1,
      total: list.length,
      name: identity.sourceAthleteName,
    });
  }
  return out;
}

async function commitPlan(pool, plan) {
  const inserts = plan.filter(row => row.action === 'insert');
  if (!inserts.length) return { aliases_created: 0 };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of inserts) {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        ['tfrrs-athletic-net-alias|' + row.sourceAthleteKey]
      );
      const existing = (await client.query(
        [
          'SELECT target_athlete_id, status FROM ingest.athlete_aliases',
          "WHERE source = 'tfrrs' AND source_athlete_key = $1 FOR UPDATE",
        ].join(' '),
        [row.sourceAthleteKey]
      )).rows[0];
      if (existing) {
        if (String(existing.target_athlete_id) !== String(row.target.athlete_id)
            || existing.status !== 'active') {
          throw new Error('scoped alias conflict for ' + row.sourceAthleteKey);
        }
        continue;
      }
      await client.query(
        [
          'INSERT INTO ingest.athlete_aliases',
          '(source, source_athlete_key, source_athlete_name, source_gender,',
          'target_athlete_id, match_method, status, notes, verified_at, updated_at)',
          "VALUES ('tfrrs', $1, $2, $3, $4, 'verified_alias', 'active', $5, now(), now())",
        ].join(' '),
        [
          row.sourceAthleteKey,
          row.sourceAthleteName,
          row.sourceGender,
          row.target.athlete_id,
          'Exact TFRRS team-scoped name plus exact Athletic.net name/school candidate with '
            + 'unique existing profile ' + row.athletic_net_url + '; source meet '
            + row.sourceMeetKey + ', canonical team ' + row.targetTeamId + '.',
        ]
      );
    }
    await client.query('COMMIT');
    return { aliases_created: inserts.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function run({
  runId,
  commit = false,
  delayMs = 250,
  timeoutMs = 10000,
  env = process.env,
  pool = null,
  client = null,
  onProgress = () => {},
} = {}) {
  if (!runId) throw new Error('--run is required');
  if (!env.INGEST_DATABASE_URL && !pool) throw new Error('INGEST_DATABASE_URL is required');
  const db = pool || new Pool({
    connectionString: env.INGEST_DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 15000,
    application_name: 'trackhub-tfrrs-athletic-net-crosswalk',
    ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  try {
    const rows = await loadSourceRows(db, runId);
    const identities = identitiesFromRows(rows);
    const schoolNames = await loadSchoolNames(
      db,
      [...identities.values()].map(row => row.targetSchoolId)
    );
    const candidateRows = await searchCandidates(identities, schoolNames, {
      delayMs,
      timeoutMs,
      client,
      onProgress,
    });
    const candidateIds = candidateRows.map(row => row.candidate && row.candidate.id).filter(Boolean);
    const [targets, aliases] = await Promise.all([
      loadPublicTargetsByProfiles(db, candidateIds),
      loadExistingAliases(db, [...identities.keys()]),
    ]);
    const plan = buildPlan(identities, candidateRows, targets, aliases);
    const outcome = commit ? await commitPlan(db, plan) : { aliases_created: 0 };
    return {
      mode: commit ? 'commit' : 'dry_run',
      runId,
      rows: rows.length,
      identities: identities.size,
      api_candidates: candidateRows.filter(row => row.candidate).length,
      api_errors: candidateRows.filter(row => row.error).length,
      candidate_profiles: new Set(candidateIds).size,
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
  if (!process.env.INGEST_DATABASE_URL && process.env.DB_PASSWORD) {
    const host = process.env.INGEST_DATABASE_HOST
      || process.env.SUPABASE_DB_HOST
      || 'db.hunbahsnaeeztmzqpnrl.supabase.co';
    const port = process.env.INGEST_DATABASE_PORT || '5432';
    const database = process.env.INGEST_DATABASE_NAME || 'postgres';
    const user = process.env.INGEST_DATABASE_USER || 'postgres';
    process.env.INGEST_DATABASE_URL = 'postgresql://' + user + ':'
      + encodeURIComponent(process.env.DB_PASSWORD) + '@' + host + ':' + port + '/' + database;
  }
  const args = parseArgs(process.argv.slice(2));
  run({
    runId: args.runId,
    commit: args.commit,
    delayMs: args.delayMs,
    timeoutMs: args.timeoutMs,
    onProgress: progress => {
      if (progress.completed === progress.total || progress.completed % 25 === 0) {
        console.error(
          'Athletic.net cross-source search ' + progress.completed + '/' + progress.total
        );
      }
    },
  })
    .then(result => console.log(JSON.stringify({ ...result, plan: undefined }, null, 2)))
    .catch(error => {
      console.error('ERROR ' + error.message);
      process.exit(1);
    });
}

module.exports = {
  buildPlan,
  commitPlan,
  identitiesFromRows,
  loadPublicTargetsByProfiles,
  loadSchoolNames,
  normalizeSchool,
  namesCompatible,
  parseArgs,
  profileUrl,
  schoolMatches,
  searchCandidates,
  strictApiCandidate,
  run,
};
