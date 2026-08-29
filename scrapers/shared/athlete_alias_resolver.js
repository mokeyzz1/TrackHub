/**
 * Resolve reviewed external athlete identities without mutating the public athlete record.
 */

class AthleteAliasResolver {
  constructor(rows = []) {
    this.bySourceKey = new Map();
    for (const row of rows) {
      if (!row.source || !row.source_athlete_key || !row.target_athlete_id || row.status === 'revoked') continue;
      const key = `${row.source}|${String(row.source_athlete_key).trim()}`;
      if (!this.bySourceKey.has(key)) this.bySourceKey.set(key, new Map());
      this.bySourceKey.get(key).set(Number(row.target_athlete_id), row);
    }
  }

  static async load(pool, source) {
    if (!pool || typeof pool.query !== 'function') throw new Error('a database pool is required');
    const { rows } = await pool.query(
      `SELECT aa.athlete_alias_id, aa.source, aa.source_athlete_key, aa.source_athlete_name,
              aa.source_gender, aa.target_athlete_id, aa.match_method, aa.status,
              a.school_id AS target_school_id
         FROM ingest.athlete_aliases aa
         LEFT JOIN public.athletes a ON a.athlete_id = aa.target_athlete_id
        WHERE aa.source = $1
          AND aa.status = 'active'`,
      [source]
    );
    return new AthleteAliasResolver(rows);
  }

  resolve({ source, sourceAthleteKey, sourceAthleteScopeKey } = {}) {
    // A scoped key is preferred for name-only observations. It prevents a global name alias
    // from crossing teams or meets while preserving the existing unscoped path for stable
    // external IDs such as a linked TFRRS profile ID.
    const keys = [sourceAthleteScopeKey, sourceAthleteKey]
      .map(value => String(value || '').trim())
      .filter((value, index, values) => value && values.indexOf(value) === index);
    for (const sourceKey of keys) {
      const matches = this.bySourceKey.get(`${String(source || '').trim()}|${sourceKey}`);
      if (!matches) continue;
      if (matches.size !== 1) return null;
      const row = [...matches.values()][0];
      return {
        athlete_id: Number(row.target_athlete_id),
        school_id: row.target_school_id == null ? null : Number(row.target_school_id),
        athlete_alias_id: Number(row.athlete_alias_id),
        match_method: row.match_method
      };
    }
    return null;
  }
}

module.exports = { AthleteAliasResolver };
