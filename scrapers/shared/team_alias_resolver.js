/**
 * Resolve a reviewed source-team alias to one canonical public.teams row.
 *
 * This module is intentionally conservative: it only returns a team when the source/gender
 * combination has exactly one active reviewed mapping. Unknown and ambiguous labels remain null so
 * relay observations continue to quarantine instead of being guessed into production.
 */

function normalizeTeamAlias(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function genderKey(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'M' || normalized === 'F' ? normalized : null;
}

function addMapping(index, key, row) {
  if (!key) return;
  if (!index.has(key)) index.set(key, new Map());
  const byTeam = index.get(key);
  byTeam.set(Number(row.team_id), row);
}

class TeamAliasResolver {
  constructor(rows = []) {
    this.bySourceKey = new Map();
    this.bySourceName = new Map();

    for (const row of rows) {
      const source = String(row.source || '').trim();
      const gender = genderKey(row.source_gender);
      if (!source || !gender || !row.team_id || row.status === 'revoked') continue;

      addMapping(this.bySourceKey,
        `${source}|${normalizeTeamAlias(row.source_team_key)}|${gender}`,
        row);
      addMapping(this.bySourceName,
        `${source}|${normalizeTeamAlias(row.source_team_name)}|${gender}`,
        row);
    }
  }

  static async load(pool, source) {
    if (!pool || typeof pool.query !== 'function') throw new Error('a database pool is required');
    const { rows } = await pool.query(
      `SELECT team_alias_id, source, source_team_key, source_team_name, source_gender,
              team_id, match_method, status
         FROM ingest.team_aliases
        WHERE source = $1
          AND status = 'active'`,
      [source]
    );
    return new TeamAliasResolver(rows);
  }

  resolve({ source, sourceTeamKey, sourceTeamName, sourceGender } = {}) {
    const sourceKey = String(source || '').trim();
    const gender = genderKey(sourceGender);
    if (!sourceKey || !gender) return null;

    const candidates = [
      ['source_key', this.bySourceKey, normalizeTeamAlias(sourceTeamKey)],
      ['source_name', this.bySourceName, normalizeTeamAlias(sourceTeamName)]
    ];

    for (const [matchField, index, value] of candidates) {
      if (!value) continue;
      const byTeam = index.get(`${sourceKey}|${value}|${gender}`);
      if (!byTeam || byTeam.size !== 1) continue;
      const row = [...byTeam.values()][0];
      return {
        team_id: Number(row.team_id),
        team_alias_id: Number(row.team_alias_id),
        match_field: matchField,
        match_method: row.match_method
      };
    }

    return null;
  }
}

module.exports = {
  TeamAliasResolver,
  normalizeTeamAlias,
  genderKey
};
