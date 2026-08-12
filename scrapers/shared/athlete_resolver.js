/**
 * AthleteResolver — the single source of truth for "given a scraped result, find or create its
 * athlete." This logic was copy-pasted across import-meet-results.js and sync-weekend-results.js,
 * which is exactly why fixes (the orphan-leak dedup, name splitting) kept landing on only one of
 * them. Both importers should use this instead.
 *
 * It encapsulates every rule we hardened:
 *   - resolve an existing athlete by TFRRS id, else by name for unattached athletes
 *   - reuse existing unattached athletes (DB-wide, not just this run) so weekly re-syncs don't
 *     spawn a fresh duplicate every weekend (the ~34k orphan cause)
 *   - split full_name -> first_name/last_name on insert (shared name_parser)
 *   - never create the same athlete twice within a run
 *
 * Flow (two-phase, matching the importers):
 *   const ar = new AthleteResolver(supabase);
 *   await ar.preload(allTfrrsIdsSeenInThisBatch);
 *   for (const r of results) r._athleteId = ar.resolve({ tfrrsId, name, schoolId, gender });
 *   await ar.flush();                       // creates the queued new athletes
 *   for (const r of results) r._athleteId = ar.finalId({ tfrrsId, name });  // fill the created ids
 */
const { parseName } = require('./name_parser');

const UNATTACHED_SCHOOL_ID = 1835;

class AthleteResolver {
  constructor(supabase, opts = {}) {
    this.supabase = supabase;
    this.unattachedSchoolId = opts.unattachedSchoolId || UNATTACHED_SCHOOL_ID;
    this.byTfrrs = new Map();          // Number(tfrrs_athlete_id) -> athlete_id
    this.byUnattachedName = new Map(); // full_name -> athlete_id
    this.pending = [];                 // athlete rows to insert on flush()
    this.seen = new Set();             // dedup within this run
    this.created = 0;
    this.createErrors = 0;
  }

  /** Preload existing athletes: those matching the given TFRRS ids, plus all unattached-by-name. */
  async preload(tfrrsIds = []) {
    const ids = [...new Set(tfrrsIds.filter(id => id != null).map(String))];
    for (let i = 0; i < ids.length; i += 1000) {
      const { data } = await this.supabase
        .from('athletes').select('athlete_id, tfrrs_athlete_id').in('tfrrs_athlete_id', ids.slice(i, i + 1000));
      data?.forEach(a => this.byTfrrs.set(Number(a.tfrrs_athlete_id), a.athlete_id));
    }
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.supabase
        .from('athletes').select('athlete_id, full_name')
        .eq('school_id', this.unattachedSchoolId).is('tfrrs_athlete_id', null)
        .range(from, from + 999);
      if (error || !data || data.length === 0) break;
      data.forEach(a => { if (!this.byUnattachedName.has(a.full_name)) this.byUnattachedName.set(a.full_name, a.athlete_id); });
      if (data.length < 1000) break;
    }
    return { existing: this.byTfrrs.size, unattached: this.byUnattachedName.size };
  }

  /**
   * Resolve a scraped athlete to an internal id if already known; otherwise queue a new one.
   * Returns the athlete_id when known now, else null (fill it after flush() via finalId()).
   */
  resolve({ tfrrsId, name, schoolId, gender } = {}) {
    if (tfrrsId != null) {
      const existing = this.byTfrrs.get(Number(tfrrsId));
      if (existing) return existing;
      const key = 't:' + tfrrsId;
      if (!this.seen.has(key)) {
        this.seen.add(key);
        this.pending.push({
          tfrrs_athlete_id: String(tfrrsId),
          full_name: name,
          ...(parseName(name) || {}),
          gender: gender || null,
          school_id: schoolId || this.unattachedSchoolId,
          is_active: true,
        });
      }
      return null;
    }
    if (name) {
      const existing = this.byUnattachedName.get(name);
      if (existing) return existing;
      const key = 'u:' + name;
      if (!this.seen.has(key)) {
        this.seen.add(key);
        this.pending.push({
          tfrrs_athlete_id: null,
          full_name: name,
          ...(parseName(name) || {}),
          gender: gender || null,
          school_id: this.unattachedSchoolId,
          is_active: true,
        });
      }
      return null;
    }
    return null;
  }

  /** Create the queued new athletes (bulk, with one-by-one fallback), updating the lookup maps. */
  async flush() {
    const absorb = (rows) => rows?.forEach(a => {
      if (a.tfrrs_athlete_id) this.byTfrrs.set(Number(a.tfrrs_athlete_id), a.athlete_id);
      else this.byUnattachedName.set(a.full_name, a.athlete_id);
    });
    for (let i = 0; i < this.pending.length; i += 500) {
      const batch = this.pending.slice(i, i + 500);
      const { data, error } = await this.supabase
        .from('athletes').insert(batch).select('athlete_id, tfrrs_athlete_id, full_name');
      if (error) {
        for (const row of batch) {
          const { data: one, error: rowErr } = await this.supabase
            .from('athletes').insert(row).select('athlete_id, tfrrs_athlete_id, full_name').single();
          if (rowErr) { this.createErrors++; } else { this.created++; absorb([one]); }
        }
      } else {
        this.created += batch.length;
        absorb(data);
      }
    }
    const n = this.pending.length;
    this.pending = [];
    return { created: this.created, errors: this.createErrors, queued: n };
  }

  /** After flush(), resolve a scraped athlete to its final internal id (existing or newly created). */
  finalId({ tfrrsId, name } = {}) {
    if (tfrrsId != null) return this.byTfrrs.get(Number(tfrrsId)) || null;
    if (name) return this.byUnattachedName.get(name) || null;
    return null;
  }
}

module.exports = { AthleteResolver, UNATTACHED_SCHOOL_ID };
