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
      `SELECT athlete_alias_id, source, source_athlete_key, source_athlete_name,
              source_gender, target_athlete_id, match_method, status
         FROM ingest.athlete_aliases
        WHERE source = $1
          AND status = 'active'`,
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
        athlete_alias_id: Number(row.athlete_alias_id),
        match_method: row.match_method
      };
    }
    return null;
  }
}

module.exports = { AthleteAliasResolver };
