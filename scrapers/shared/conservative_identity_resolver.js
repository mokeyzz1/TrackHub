/**
 * Conservative fallbacks for source identities that have no reviewed alias yet.
 *
 * These resolvers only accept exact normalized names and unique matches. A named relay team must
 * match one canonical school's official/short name for its gender; an athlete must match one
 * canonical full name/gender and, when the source team is also known canonically, that school.
 * Historical participation for the exact canonical team can corroborate a school-entity mismatch.
 * Ambiguous or fuzzy matches stay unresolved and are quarantined for review.
 */

const { normalizeTeamAlias } = require('./team_alias_resolver');

function normalizeIdentityName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCanonicalTeamName(value) {
  return normalizeTeamAlias(String(value || '').replace(/\s*[-–—]\s*[a-h]$/i, ''))
    .replace(/\b(?:unattached|independent|unaffiliated)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function gender(value) {
  const key = String(value || '').trim().toUpperCase();
  return key === 'M' || key === 'F' ? key : null;
}

function add(index, key, row) {
  if (!key) return;
  if (!index.has(key)) index.set(key, []);
  index.get(key).push(row);
}

class ExactTeamResolver {
  constructor(rows = []) {
    this.byNameGender = new Map();
    this.byId = new Map();
    for (const row of rows) {
      const g = gender(row.gender);
      if (!g || !row.team_id || !row.school_id) continue;
      this.byId.set(Number(row.team_id), row);
      for (const name of [row.official_name, row.short_name]) {
        add(this.byNameGender, `${normalizeCanonicalTeamName(name)}|${g}`, row);
      }
    }
  }

  resolve({ sourceTeamName, sourceGender } = {}) {
    const g = gender(sourceGender);
    const name = normalizeCanonicalTeamName(sourceTeamName);
    if (!g || !name) return null;
    const matches = this.byNameGender.get(`${name}|${g}`) || [];
    const unique = new Map(matches.map(row => [Number(row.team_id), row]));
    if (unique.size !== 1) return null;
    const row = [...unique.values()][0];
    return {
      team_id: Number(row.team_id),
      school_id: Number(row.school_id),
      match_field: 'exact_canonical_team_name',
      match_method: 'exact_canonical_name'
    };
  }

  schoolId(teamId) {
    return this.byId.get(Number(teamId))?.school_id || null;
  }
}

class CompositeTeamResolver {
  constructor(aliasResolver, exactResolver) {
    this.aliasResolver = aliasResolver;
    this.exactResolver = exactResolver;
  }

  resolve(input = {}) {
    return this.aliasResolver?.resolve(input) || this.exactResolver?.resolve(input) || null;
  }

  schoolId(teamId) {
    return this.exactResolver?.schoolId(teamId) || null;
  }
}

class ExactAthleteResolver {
  constructor(
    rows = [],
    teamResolver,
    participationByAthlete = new Map(),
    teamParticipationByAthlete = new Map()
  ) {
    this.byNameGender = new Map();
    this.teamResolver = teamResolver;
    this.participationByAthlete = participationByAthlete;
    this.teamParticipationByAthlete = teamParticipationByAthlete;
    for (const row of rows) {
      const g = gender(row.gender);
      if (!g || !row.athlete_id) continue;
      add(this.byNameGender, `${normalizeIdentityName(row.full_name)}|${g}`, row);
    }
  }

  resolve({ sourceAthleteName, sourceGender, sourceTeamName, sourceTeamId, sourceMeetId } = {}) {
    const g = gender(sourceGender);
    const key = `${normalizeIdentityName(sourceAthleteName)}|${g || ''}`;
    if (!g || !normalizeIdentityName(sourceAthleteName)) return null;
    const candidates = this.byNameGender.get(key) || [];
    if (!candidates.length) return null;

    let filtered = candidates;
    const sourceSchoolId = sourceTeamId
      ? this.teamResolver?.schoolId(sourceTeamId)
      : this.teamResolver?.resolve({ sourceTeamName, sourceGender: g })?.school_id || null;
    if (sourceSchoolId) {
      filtered = candidates.filter(row => Number(row.school_id) === Number(sourceSchoolId));
    }

    // A historical result for the exact canonical team can safely explain a stale or duplicate
    // school_id on the athlete row. This is only allowed when it yields one candidate; a name
    // match alone must never repair a school assignment.
    let matchField = sourceSchoolId ? 'exact_name_gender_school' : 'exact_unique_name_gender';
    if (!filtered.length && sourceTeamId) {
      const sameTeam = candidates.filter(row => this.teamParticipationByAthlete
        .get(Number(row.athlete_id))?.has(Number(sourceTeamId)));
      if (sameTeam.length === 1) {
        filtered = sameTeam;
        matchField = 'exact_name_gender_team_participation';
      }
    }

    // Same-name duplicate rows can be disambiguated when exactly one candidate already
    // participated in this exact meet. This corroboration is only allowed after the source
    // team has resolved to a canonical school; otherwise a cross-school collision could be
    // converted into a false identity match.
    if (filtered.length > 1 && sourceSchoolId && sourceMeetId != null) {
      const participating = filtered.filter(row => this.participationByAthlete
        .get(Number(row.athlete_id))?.has(Number(sourceMeetId)));
      if (participating.length === 1) {
        filtered = participating;
        matchField = 'exact_name_gender_school_meet_participation';
      }
    }

    const unique = new Map(filtered.map(row => [Number(row.athlete_id), row]));
    if (unique.size !== 1) return null;
    const row = [...unique.values()][0];
    return {
      athlete_id: Number(row.athlete_id),
      school_id: row.school_id == null ? null : Number(row.school_id),
      match_field: matchField,
      match_method: matchField === 'exact_name_gender_school_meet_participation'
        ? 'exact_canonical_name_meet_participation'
        : matchField === 'exact_name_gender_team_participation'
          ? 'exact_canonical_name_team_participation'
          : 'exact_canonical_name'
    };
  }
}

class CompositeAthleteResolver {
  constructor(aliasResolver, exactResolver) {
    this.aliasResolver = aliasResolver;
    this.exactResolver = exactResolver;
  }

  resolve(input = {}) {
    return this.aliasResolver?.resolve(input) || this.exactResolver?.resolve(input) || null;
  }
}

async function loadExactTeamResolver(pool) {
  const { rows } = await pool.query(`
    SELECT t.team_id, t.school_id, t.gender, s.official_name, s.short_name
      FROM public.teams t
      JOIN public.schools s ON s.school_id = t.school_id
  `);
  return new ExactTeamResolver(rows);
}

async function loadExactAthleteResolver(pool, sourceRows, teamResolver) {
  const rawNames = [...new Set((sourceRows || [])
    .flatMap(row => (row.relay_athletes || []).map(leg => leg.athlete_name))
    .map(value => String(value || '').trim())
    .filter(Boolean))];
  const names = [...new Set(rawNames
    .map(normalizeIdentityName)
    .filter(Boolean))];
  if (!rawNames.length) return new ExactAthleteResolver([], teamResolver);
  const rows = [];
  // Keep the lookup index-friendly and bounded. The earlier all-name regexp predicate could scan
  // the entire athlete table for a large PT Timing meet. Source names normally preserve the
  // canonical punctuation; JavaScript normalization still handles the identity comparison after
  // these exact/case-insensitive candidates are loaded.
  for (let offset = 0; offset < rawNames.length; offset += 200) {
    const chunk = rawNames.slice(offset, offset + 200);
    const result = await pool.query(
      `SELECT athlete_id, full_name, gender, school_id
         FROM public.athletes
        WHERE full_name = ANY($1::text[])
           OR lower(full_name) = ANY($2::text[])`,
      [chunk, chunk.map(value => value.toLowerCase())]
    );
    rows.push(...result.rows);
  }
  const meetIds = [...new Set((sourceRows || [])
    .map(row => Number(row.target_meet_id || row.meet_id))
    .filter(Number.isInteger))];
  const teamIds = [...new Set((sourceRows || [])
    .map(row => teamResolver?.resolve({
      sourceTeamName: row.source_team_name || row.team_name,
      sourceGender: row.team_gender || row.gender
    })?.team_id)
    .map(value => Number(value))
    .filter(Number.isInteger))];
  const participationByAthlete = new Map();
  const teamParticipationByAthlete = new Map();
  if (rows.length && (meetIds.length || teamIds.length)) {
    const participation = await pool.query(
      `SELECT athlete_id, meet_id
         FROM public.results
        WHERE $3::boolean
          AND athlete_id = ANY($1::bigint[])
          AND meet_id = ANY($2::integer[])
       UNION
       SELECT ra.athlete_id, rr.meet_id
         FROM public.relay_athletes ra
         JOIN public.relay_results rr ON rr.relay_result_id = ra.relay_result_id
        WHERE $3::boolean
          AND ra.athlete_id IS NOT NULL
          AND ra.athlete_id = ANY($1::bigint[])
          AND rr.meet_id = ANY($2::integer[])`,
      [rows.map(row => row.athlete_id), meetIds.length ? meetIds : [0], Boolean(meetIds.length)]
    );
    for (const row of participation.rows) {
      const athleteId = Number(row.athlete_id);
      if (!participationByAthlete.has(athleteId)) participationByAthlete.set(athleteId, new Set());
      participationByAthlete.get(athleteId).add(Number(row.meet_id));
    }
  }
  if (rows.length && teamIds.length) {
    const participation = await pool.query(
      `SELECT athlete_id, team_id
         FROM public.results
        WHERE athlete_id = ANY($1::bigint[])
          AND team_id = ANY($2::bigint[])
       UNION
       SELECT ra.athlete_id, rr.team_id
         FROM public.relay_athletes ra
         JOIN public.relay_results rr ON rr.relay_result_id = ra.relay_result_id
        WHERE ra.athlete_id IS NOT NULL
          AND ra.athlete_id = ANY($1::bigint[])
          AND rr.team_id = ANY($2::bigint[])`,
      [rows.map(row => row.athlete_id), teamIds]
    );
    for (const row of participation.rows) {
      const athleteId = Number(row.athlete_id);
      if (!teamParticipationByAthlete.has(athleteId)) teamParticipationByAthlete.set(athleteId, new Set());
      teamParticipationByAthlete.get(athleteId).add(Number(row.team_id));
    }
  }
  return new ExactAthleteResolver(rows, teamResolver, participationByAthlete, teamParticipationByAthlete);
}

module.exports = {
  CompositeAthleteResolver,
  CompositeTeamResolver,
  ExactAthleteResolver,
  ExactTeamResolver,
  loadExactAthleteResolver,
  loadExactTeamResolver,
  normalizeCanonicalTeamName,
  normalizeIdentityName,
  gender
};
