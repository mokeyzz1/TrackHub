#!/usr/bin/env node
/**
 * Build or promote a scoped TFRRS athlete crosswalk from an older linked result page.
 *
 * TFRRS junior-college result tables can omit athlete IDs. When an earlier official page for
 * the same championship links a profile, this script can safely create a private alias only if:
 *   - the name and TFRRS team identity match exactly;
 *   - exactly one public athlete already has that TFRRS profile ID;
 *   - the public row has the same gender and either the same team school or Unattached.
 *
 * It never creates or mutates public athletes and never writes public results. Dry-run is the
 * default; --commit inserts only the verified scoped aliases.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { scopedSourceAthleteKey } = require('../../shared/source_observation_adapter');

const DEFAULT_MALE_URL = 'https://www.tfrrs.org/results/92126/m/2025_3C2A_Southern_California_Prelims_and_Championships';
const DEFAULT_FEMALE_URL = 'https://www.tfrrs.org/results/92126/f/2025_3C2A_Southern_California_Prelims_and_Championships';
const UNATTACHED_SCHOOL_ID = 1835;

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  return {
    runId: valueAfter(argv, '--run'),
    maleUrl: valueAfter(argv, '--history-m-url') || DEFAULT_MALE_URL,
    femaleUrl: valueAfter(argv, '--history-f-url') || DEFAULT_FEMALE_URL,
    commit: argv.includes('--commit'),
  };
}

function normalizeName(value) {
  let name = String(value || '').replace(/\s+/g, ' ').trim();
  if (name.includes(',')) {
    const [last, ...rest] = name.split(',');
    const first = rest.join(',').trim();
    if (last.trim() && first) name = `${first} ${last.trim()}`;
  }
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function teamUrlKey(value) {
  const match = String(value || '').match(/\/teams\/tf\/([^/?#]+)/i);
  return match ? match[1].replace(/\.html$/i, '').toLowerCase() : null;
}

function profileFromHref(href, anchorText) {
  const match = String(href || '').match(/\/athletes\/(\d+)(?:\/[^/?#]+\/([^/?#]+?)(?:\.html)?)?$/i);
  if (!match) return null;
  const slugName = match[2]
    ? decodeURIComponent(match[2]).replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
    : null;
  const visibleName = String(anchorText || '').replace(/\s+/g, ' ').trim();
  const name = slugName || visibleName;
  const profileUrl = String(href).startsWith('http')
    ? href
    : `https://www.tfrrs.org${href}`;
  return { id: match[1], name, profileUrl };
}

async function loadHistoricalProfiles(url, gender) {
  const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(response.data);
  const candidates = new Map();

  $('tr').each((_, tr) => {
    const teamAnchor = $(tr).find('a').filter((__, anchor) => (
      String($(anchor).attr('href') || '').includes('/teams/tf/')
    )).first();
    const sourceTeamKey = teamUrlKey(teamAnchor.attr('href'));
    if (!sourceTeamKey) return;

    $(tr).find('a').each((__, anchor) => {
      const profile = profileFromHref($(anchor).attr('href'), $(anchor).text());
      if (!profile) return;
      const key = `${gender}|${sourceTeamKey}|${normalizeName(profile.name)}`;
      if (!candidates.has(key)) candidates.set(key, new Map());
      candidates.get(key).set(profile.id, profile);
    });
  });

  return candidates;
}

async function loadSourceRows(pool, runId) {
  const { rows } = await pool.query(
    `SELECT o.observation_id, o.entity_type, o.target_team_id,
            sr.source_meet_key, sr.payload,
            t.school_id AS target_school_id, t.tfrrs_team_url
       FROM ingest.observations o
       JOIN ingest.source_records sr ON sr.source_record_id = o.source_record_id
       JOIN public.teams t ON t.team_id = o.target_team_id
      WHERE o.run_id = $1::uuid
        AND o.source = 'tfrrs'
        AND o.entity_type IN ('individual_result', 'relay_leg')
        AND o.target_athlete_id IS NULL`,
    [runId]
  );
  return rows;
}

function rowAthleteName(row) {
  if (row.entity_type === 'relay_leg') return row.payload?.leg?.athlete_name || null;
  return row.payload?.athlete_name || null;
}

function identityFromRow(row) {
  const athleteName = rowAthleteName(row);
  const gender = row.payload?.team_gender || null;
  if (!athleteName || !gender || !row.source_meet_key || !row.target_team_id) return null;
  const sourceAthleteKey = scopedSourceAthleteKey('tfrrs', {
    source_meet_key: row.source_meet_key,
    team_id: row.target_team_id,
    team_gender: gender,
    athlete_name: athleteName,
  });
  if (!sourceAthleteKey) return null;
  return {
    sourceAthleteKey,
    sourceAthleteName: athleteName,
    sourceGender: gender,
    sourceMeetKey: String(row.source_meet_key),
    targetTeamId: Number(row.target_team_id),
    targetSchoolId: Number(row.target_school_id),
    teamKey: teamUrlKey(row.tfrrs_team_url),
  };
}

async function loadPublicTargets(pool, tfrrsIds) {
  if (!tfrrsIds.length) return [];
  const { rows } = await pool.query(
    `SELECT a.athlete_id, a.full_name, a.gender, a.tfrrs_athlete_id,
            a.tfrrs_profile_url, a.school_id, s.official_name AS school_name
       FROM public.athletes a
       JOIN public.schools s ON s.school_id = a.school_id
      WHERE a.tfrrs_athlete_id = ANY($1::text[])`,
    [tfrrsIds]
  );
  return rows;
}

async function loadPublicNameTargets(pool, schoolIds) {
  const ids = [...new Set(schoolIds.map(Number).filter(Number.isFinite))];
  if (!ids.length) return [];
  const { rows } = await pool.query(
    `SELECT a.athlete_id, a.full_name, a.gender, a.tfrrs_athlete_id,
            a.tfrrs_profile_url, a.school_id, s.official_name AS school_name
       FROM public.athletes a
       JOIN public.schools s ON s.school_id = a.school_id
      WHERE a.school_id = ANY($1::bigint[])
         OR a.school_id = $2::bigint`,
    [ids, UNATTACHED_SCHOOL_ID]
  );
  return rows;
}

async function loadExistingAliases(pool, sourceKeys) {
  if (!sourceKeys.length) return [];
  const { rows } = await pool.query(
    `SELECT source_athlete_key, target_athlete_id, status
       FROM ingest.athlete_aliases
      WHERE source = 'tfrrs'
        AND source_athlete_key = ANY($1::text[])`,
    [sourceKeys]
  );
  return rows;
}

function buildPlan(rows, historicalCandidates, publicTargets, existingAliases, publicNameTargets = []) {
  const identities = new Map();
  for (const row of rows) {
    const identity = identityFromRow(row);
    if (!identity) continue;
    if (!identities.has(identity.sourceAthleteKey)) identities.set(identity.sourceAthleteKey, identity);
  }

  const targetsById = new Map();
  for (const target of publicTargets) {
    const key = String(target.tfrrs_athlete_id);
    if (!targetsById.has(key)) targetsById.set(key, []);
    targetsById.get(key).push(target);
  }
  const nameTargetsBySchool = new Map();
  const unattachedTargetsByName = new Map();
  for (const target of publicNameTargets) {
    const nameKey = normalizeName(target.full_name);
    const exactKey = `${Number(target.school_id)}|${nameKey}`;
    if (!nameTargetsBySchool.has(exactKey)) nameTargetsBySchool.set(exactKey, []);
    nameTargetsBySchool.get(exactKey).push(target);
    if (Number(target.school_id) === UNATTACHED_SCHOOL_ID) {
      const genderKey = `${target.gender || ''}|${nameKey}`;
      if (!unattachedTargetsByName.has(genderKey)) unattachedTargetsByName.set(genderKey, []);
      unattachedTargetsByName.get(genderKey).push(target);
    }
  }
  const aliasesByKey = new Map(existingAliases.map(row => [row.source_athlete_key, row]));

  return [...identities.values()].map(identity => {
    const historicalKey = `${identity.sourceGender}|${identity.teamKey}|${normalizeName(identity.sourceAthleteName)}`;
    const profiles = [...(historicalCandidates.get(historicalKey)?.values() || [])];
    const base = {
      ...identity,
      historicalKey,
      historicalProfiles: profiles,
      existingAlias: aliasesByKey.get(identity.sourceAthleteKey) || null,
    };

    if (profiles.length !== 1) {
      return { ...base, action: 'hold', reason: profiles.length ? 'ambiguous_historical_profile' : 'no_historical_profile' };
    }

    const profile = profiles[0];
    const idTargets = targetsById.get(profile.id) || [];
    let targets = idTargets;
    let targetMatch = idTargets.length === 1 ? 'tfrrs_athlete_id' : null;
    if (idTargets.length === 0 && publicNameTargets.length) {
      const nameKey = normalizeName(identity.sourceAthleteName);
      const schoolTargets = nameTargetsBySchool.get(`${identity.targetSchoolId}|${nameKey}`) || [];
      const unattachedTargets = unattachedTargetsByName.get(`${identity.sourceGender}|${nameKey}`) || [];
      targets = schoolTargets.length ? schoolTargets : unattachedTargets;
      targetMatch = targets.length === 1 ? 'exact_name_school' : null;
    }
    if (targets.length !== 1) {
      return {
        ...base,
        profile,
        action: 'hold',
        reason: targets.length
          ? 'public_tfrrs_id_not_unique'
          : idTargets.length
            ? 'public_tfrrs_id_not_unique'
            : (publicNameTargets.length ? 'public_name_school_not_found' : 'public_tfrrs_id_not_found'),
      };
    }

    const target = targets[0];
    if (targetMatch === 'exact_name_school'
        && target.tfrrs_athlete_id != null
        && String(target.tfrrs_athlete_id) !== String(profile.id)) {
      return { ...base, profile, target, action: 'hold', reason: 'public_tfrrs_id_conflict' };
    }
    if (normalizeName(target.full_name) !== normalizeName(identity.sourceAthleteName)) {
      return { ...base, profile, target, action: 'hold', reason: 'public_name_mismatch' };
    }
    if (target.gender != null && target.gender !== identity.sourceGender) {
      return { ...base, profile, target, action: 'hold', reason: 'public_gender_mismatch' };
    }
    if (Number(target.school_id) !== identity.targetSchoolId && Number(target.school_id) !== UNATTACHED_SCHOOL_ID) {
      return { ...base, profile, target, action: 'hold', reason: 'public_school_mismatch' };
    }
    if (base.existingAlias && String(base.existingAlias.target_athlete_id) !== String(target.athlete_id)) {
      return { ...base, profile, target, action: 'hold', reason: 'existing_alias_conflict' };
    }
    if (base.existingAlias?.status === 'active') {
      return { ...base, profile, target, action: 'already_active', reason: 'existing_alias_matches' };
    }
    return {
      ...base,
      profile,
      target,
      targetMatch,
      action: 'insert',
      reason: profile.evidenceType === 'tfrrs_team_roster_profile_link'
        ? 'verified_team_roster_profile'
        : profile.evidenceType === 'tfrrs_public_profile_team_link'
        ? 'verified_public_search_profile'
        : 'verified_historical_profile',
    };
  });
}

async function commitPlan(pool, plan) {
  const inserts = plan.filter(row => row.action === 'insert');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of inserts) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [row.sourceAthleteKey]);
      const existing = (await client.query(
        `SELECT target_athlete_id, status
           FROM ingest.athlete_aliases
          WHERE source = 'tfrrs' AND source_athlete_key = $1
          FOR UPDATE`,
        [row.sourceAthleteKey]
      )).rows[0];
      if (existing) {
        if (String(existing.target_athlete_id) !== String(row.target.athlete_id)
            || existing.status !== 'active') {
          throw new Error(`scoped alias conflict for ${row.sourceAthleteKey}`);
        }
        continue;
      }
      await client.query(
        `INSERT INTO ingest.athlete_aliases
           (source, source_athlete_key, source_athlete_name, source_gender,
            target_athlete_id, match_method, status, notes, verified_at, updated_at)
         VALUES ('tfrrs', $1, $2, $3, $4, 'verified_alias', 'active', $5, now(), now())`,
        [
          row.sourceAthleteKey,
          row.sourceAthleteName,
          row.sourceGender,
          row.target.athlete_id,
          `${row.profile.evidenceType === 'tfrrs_team_roster_profile_link'
            ? 'Exact name match to official TFRRS team roster'
            : row.profile.evidenceType === 'tfrrs_public_profile_team_link'
              ? 'Exact name/team match to official TFRRS public profile'
              : 'Exact name/team match to linked TFRRS profile'} ${row.profile.profileUrl}; scoped to source meet ${row.sourceMeetKey} and canonical team ${row.targetTeamId}.`,
        ]
      );
    }
    await client.query('COMMIT');
    return { inserted: inserts.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function run({ runId, maleUrl = DEFAULT_MALE_URL, femaleUrl = DEFAULT_FEMALE_URL, commit = false, env = process.env, pool = null } = {}) {
  if (!runId) throw new Error('--run is required');
  if (!env.INGEST_DATABASE_URL && !pool) throw new Error('INGEST_DATABASE_URL is required');
  const db = pool || new Pool({
    connectionString: env.INGEST_DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 15000,
    application_name: 'trackhub-tfrrs-historical-athlete-crosswalk',
    ssl: env.INGEST_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  try {
    const [rows, maleProfiles, femaleProfiles] = await Promise.all([
      loadSourceRows(db, runId),
      loadHistoricalProfiles(maleUrl, 'M'),
      loadHistoricalProfiles(femaleUrl, 'F'),
    ]);
    const historicalCandidates = new Map([...maleProfiles, ...femaleProfiles]);
    const identities = new Map();
    rows.forEach(row => {
      const identity = identityFromRow(row);
      if (identity && !identities.has(identity.sourceAthleteKey)) identities.set(identity.sourceAthleteKey, identity);
    });
    const candidateIds = new Set();
    for (const identity of identities.values()) {
      const profiles = historicalCandidates.get(`${identity.sourceGender}|${identity.teamKey}|${normalizeName(identity.sourceAthleteName)}`);
      if (profiles?.size === 1) candidateIds.add([...profiles.keys()][0]);
    }
    const [publicTargets, existingAliases] = await Promise.all([
      loadPublicTargets(db, [...candidateIds]),
      loadExistingAliases(db, [...identities.keys()]),
    ]);
    const plan = buildPlan(rows, historicalCandidates, publicTargets, existingAliases);
    const outcome = commit ? await commitPlan(db, plan) : { inserted: 0 };
    return {
      mode: commit ? 'commit' : 'dry_run',
      runId,
      rows: rows.length,
      identities: plan.length,
      historical_profiles: new Set(plan.flatMap(row => row.historicalProfiles.map(profile => profile.id))).size,
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
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
  const args = parseArgs(process.argv.slice(2));
  run({ runId: args.runId, maleUrl: args.maleUrl, femaleUrl: args.femaleUrl, commit: args.commit })
    .then(result => {
      console.log(JSON.stringify({ ...result, plan: undefined }, null, 2));
    })
    .catch(error => {
      console.error(`ERROR ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  buildPlan,
  commitPlan,
  identityFromRow,
  loadHistoricalProfiles,
  loadExistingAliases,
  loadPublicNameTargets,
  loadPublicTargets,
  loadSourceRows,
  normalizeName,
  parseArgs,
  profileFromHref,
  run,
  teamUrlKey,
};
