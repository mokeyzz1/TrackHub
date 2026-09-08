const crypto = require('node:crypto');
const {
  SourceAthleteIdentityResolver,
  queryIdentityRows,
} = require('./source_athlete_identity_resolver');

const TFRRS_SOURCE = 'tfrrs';

function requiredText(value, field) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function normalizeTfrrsAthleteId(value) {
  const normalized = requiredText(value, 'tfrrs_athlete_id');
  if (!/^\d+$/.test(normalized)) throw new Error('tfrrs_athlete_id must contain only digits');
  return normalized;
}

function normalizeGender(value) {
  const normalized = requiredText(value, 'gender').toUpperCase();
  if (!['M', 'F'].includes(normalized)) throw new Error('gender must be M or F');
  return normalized;
}

function normalizeTeamUrl(value) {
  const url = new URL(requiredText(value, 'tfrrs_team_url'));
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'www.tfrrs.org') {
    throw new Error('tfrrs_team_url must be an https://www.tfrrs.org URL');
  }
  url.hash = '';
  url.search = '';
  return url.toString();
}

function seasonInterval(value) {
  const label = requiredText(value, 'season');
  let startYear;
  let endYear;
  const academic = label.match(/^(\d{4})-(\d{4})$/);
  const competition = label.match(/^(\d{4})\s+(indoor|outdoor)$/i);

  if (academic) {
    startYear = Number(academic[1]);
    endYear = Number(academic[2]);
  } else if (competition) {
    endYear = Number(competition[1]);
    startYear = endYear - 1;
  } else {
    throw new Error('season must be YYYY-YYYY, YYYY Indoor, or YYYY Outdoor');
  }

  if (endYear !== startYear + 1) throw new Error('season years must be consecutive');
  return {
    seasonCode: `${startYear}-${endYear}`,
    effectiveFrom: `${startYear}-07-01`,
    effectiveTo: `${endYear}-07-01`,
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function buildRosterObservation(row, metadata = {}) {
  const tfrrsAthleteId = normalizeTfrrsAthleteId(row.tfrrs_athlete_id);
  const gender = normalizeGender(row.gender);
  const schoolId = Number(row.school_id);
  if (!Number.isSafeInteger(schoolId) || schoolId <= 0) throw new Error('school_id must be a positive integer');
  const teamUrl = normalizeTeamUrl(row.tfrrs_team_url);
  const interval = seasonInterval(row.season || metadata.season);
  const fullName = requiredText(row.full_name, 'full_name');
  const classYear = row.class_year == null || String(row.class_year).trim() === ''
    ? null
    : String(row.class_year).trim().toUpperCase();
  const teamKey = new URL(teamUrl).pathname.replace(/\/$/, '');
  const sourceRecordKey = `roster:${interval.seasonCode}:athlete:${tfrrsAthleteId}:team:${teamKey}`;
  const payload = {
    tfrrs_athlete_id: tfrrsAthleteId,
    tfrrs_team_url: teamUrl,
    school_id: schoolId,
    gender,
    full_name: fullName,
    class_year: classYear,
    season_code: interval.seasonCode,
  };

  return {
    source: TFRRS_SOURCE,
    source_record_key: sourceRecordKey,
    source_snapshot_hash: crypto.createHash('sha256').update(stableJson(payload)).digest('hex'),
    source_url: teamUrl,
    tfrrs_athlete_id: tfrrsAthleteId,
    school_id: schoolId,
    gender,
    full_name: fullName,
    class_year: classYear,
    season_code: interval.seasonCode,
    effective_from: interval.effectiveFrom,
    effective_to: interval.effectiveTo,
    evidence: payload,
  };
}

function membershipCoversSeason(membership, observation) {
  if (!membership) return false;
  if (!['active', 'affiliate', 'provisional', 'independent'].includes(membership.membership_status)) return false;
  if (membership.verification_status === 'unresolved') return false;
  if (membership.valid_from && membership.valid_from >= observation.effective_to) return false;
  if (membership.valid_to && membership.valid_to < observation.effective_from) return false;
  return true;
}

function buildRosterPlan(observations, context = {}) {
  const athletesByTfrrsId = context.athletesByTfrrsId || new Map();
  const teamsBySchoolGender = context.teamsBySchoolGender || new Map();
  const membershipsBySchool = context.membershipsBySchool || new Map();
  const evidenceBySourceKey = context.evidenceBySourceKey || new Map();
  const grouped = new Map();

  for (const observation of observations) {
    const rows = grouped.get(observation.source_record_key) || [];
    rows.push(observation);
    grouped.set(observation.source_record_key, rows);
  }

  const ready = [];
  const held = [];
  const replayed = [];

  for (const rows of grouped.values()) {
    const observation = rows[0];
    if (rows.some(row => row.source_snapshot_hash !== observation.source_snapshot_hash)) {
      held.push({ observation, reason: 'conflicting_rows_for_source_key' });
      continue;
    }

    const athletes = athletesByTfrrsId.get(observation.tfrrs_athlete_id) || [];
    if (athletes.length !== 1) {
      held.push({ observation, reason: athletes.length ? 'ambiguous_tfrrs_athlete_id' : 'canonical_athlete_missing' });
      continue;
    }
    const athlete = athletes[0];
    if (athlete.gender && athlete.gender !== observation.gender) {
      held.push({ observation, reason: 'athlete_gender_conflict' });
      continue;
    }

    const teams = teamsBySchoolGender.get(`${observation.school_id}|${observation.gender}`) || [];
    if (teams.length !== 1) {
      held.push({ observation, reason: teams.length ? 'ambiguous_canonical_team' : 'canonical_team_missing' });
      continue;
    }
    const team = teams[0];
    if (team.institution_type !== 'collegiate') {
      held.push({ observation, reason: 'school_not_collegiate' });
      continue;
    }
    const memberships = membershipsBySchool.get(observation.school_id) || [];
    if (!memberships.some(row => membershipCoversSeason(row, observation))) {
      held.push({ observation, reason: 'collegiate_membership_not_verified_for_season' });
      continue;
    }

    const existingEvidence = evidenceBySourceKey.get(observation.source_record_key) || [];
    if (existingEvidence.length > 1
      || existingEvidence.some(row => Number(row.athlete_id) !== Number(athlete.athlete_id))) {
      held.push({ observation, reason: 'existing_evidence_identity_conflict' });
      continue;
    }
    if (existingEvidence.length === 1) {
      if (existingEvidence[0].source_snapshot_hash !== observation.source_snapshot_hash) {
        held.push({ observation, reason: 'source_payload_changed' });
      } else {
        replayed.push({ observation, athlete, team, reason: 'exact_replay' });
      }
      continue;
    }

    ready.push({ observation, athlete, team });
  }

  return { ready, held, replayed };
}

async function loadRosterContext(client, observations) {
  const tfrrsIds = [...new Set(observations.map(row => row.tfrrs_athlete_id))];
  const schoolIds = [...new Set(observations.map(row => row.school_id))];
  const sourceKeys = [...new Set(observations.map(row => row.source_record_key))];
  const identityRows = await queryIdentityRows(client, TFRRS_SOURCE, tfrrsIds);
  const identityResolver = new SourceAthleteIdentityResolver(identityRows);
  const resolvedAthleteIds = [...new Set(tfrrsIds.map(key => identityResolver.resolve(key)?.athlete_id).filter(Boolean))];
  const [athletes, teams, memberships, evidence] = await Promise.all([
    client.query('select athlete_id, gender from public.athletes where athlete_id = any($1::bigint[])', [resolvedAthleteIds]),
    client.query(`select team.team_id, team.school_id, team.gender, school.institution_type
      from public.teams team join public.schools school using (school_id)
      where team.school_id = any($1::bigint[])`, [schoolIds]),
    client.query(`select school_id, valid_from, valid_to, membership_status, verification_status
      from public.school_competition_memberships
      where school_id = any($1::bigint[]) and is_primary`, [schoolIds]),
    client.query(`select athlete_id, source_record_key, source_snapshot_hash
      from public.athlete_status_evidence
      where source = $1 and source_record_key = any($2::text[])
        and status_axis = 'career_stage' and status_value = 'collegiate'`, [TFRRS_SOURCE, sourceKeys]),
  ]);

  const collect = (rows, key) => rows.reduce((map, row) => {
    const value = key(row);
    map.set(value, [...(map.get(value) || []), row]);
    return map;
  }, new Map());
  const athletesById = new Map(athletes.rows.map(row => [Number(row.athlete_id), row]));
  const athletesByTfrrsId = new Map(tfrrsIds.map(key => {
    const inspected = identityResolver.inspect(key);
    if (inspected.status === 'missing') return [key, []];
    if (inspected.status === 'conflict') return [key, [{}, {}]];
    const athlete = athletesById.get(Number(inspected.resolution.athlete_id));
    return [key, athlete ? [{ ...athlete, identity_method: inspected.resolution.identity_method }] : []];
  }));
  return {
    athletesByTfrrsId,
    teamsBySchoolGender: collect(teams.rows, row => `${row.school_id}|${row.gender}`),
    membershipsBySchool: collect(memberships.rows, row => Number(row.school_id)),
    evidenceBySourceKey: collect(evidence.rows, row => row.source_record_key),
  };
}

async function persistRosterPlan(client, ready) {
  if (!ready.length) return { season_rows: 0, evidence_rows: 0 };
  const payload = ready.map(({ observation, athlete, team }) => ({
    athlete_id: Number(athlete.athlete_id),
    team_id: Number(team.team_id),
    season_code: observation.season_code,
    year_in_school: observation.class_year,
    source: observation.source,
    source_record_key: observation.source_record_key,
    source_snapshot_hash: observation.source_snapshot_hash,
    source_url: observation.source_url,
    effective_from: observation.effective_from,
    effective_to: observation.effective_to,
    evidence: observation.evidence,
  }));

  const seasons = await client.query(`with incoming as (
      select * from jsonb_to_recordset($1::jsonb) as row(
        athlete_id bigint, team_id bigint, season_code text, year_in_school text)
    )
    insert into public.athlete_team_seasons as existing
      (athlete_id, team_id, season_code, year_in_school, status)
    select athlete_id, team_id, season_code, year_in_school, 'active' from incoming
    on conflict (athlete_id, team_id, season_code) do update
      set year_in_school = coalesce(existing.year_in_school, excluded.year_in_school)
    returning ats_id`, [JSON.stringify(payload)]);

  const evidence = await client.query(`with incoming as (
      select * from jsonb_to_recordset($1::jsonb) as row(
        athlete_id bigint, source text, source_record_key text, source_snapshot_hash text,
        source_url text, effective_from date, effective_to date, evidence jsonb)
    )
    insert into public.athlete_status_evidence
      (athlete_id, status_axis, status_value, effective_from, effective_to, evidence_type,
       source, source_record_key, source_url, source_snapshot_hash, verification_status, evidence)
    select athlete_id, 'career_stage', 'collegiate', effective_from, effective_to, 'roster',
           source, source_record_key, source_url, source_snapshot_hash, 'source_observed', evidence
    from incoming
    on conflict on constraint athlete_status_evidence_source_identity_uq do nothing
    returning athlete_status_evidence_id`, [JSON.stringify(payload)]);

  if (evidence.rowCount !== ready.length) {
    throw new Error(`evidence write count mismatch: expected ${ready.length}, wrote ${evidence.rowCount}`);
  }
  return { season_rows: seasons.rowCount, evidence_rows: evidence.rowCount };
}

module.exports = {
  buildRosterObservation,
  buildRosterPlan,
  loadRosterContext,
  normalizeTeamUrl,
  normalizeTfrrsAthleteId,
  persistRosterPlan,
  seasonInterval,
  stableJson,
};
