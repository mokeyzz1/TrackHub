/**
 * Event name resolver — the scraper's gateway to the canonical event catalog.
 *
 * Every result import resolves its raw event name to a canonical `event_type_id`
 * through the `event_aliases` table (loaded once into memory). A name that isn't in
 * the alias map is written to `unmapped_events` for review — never silently mangled.
 *
 * This is what keeps the event-normalization work from drifting back to a mess: the
 * old code path let new spellings (`200` vs `200m` vs `200 Meters`) accumulate as
 * free text until ~half the data was un-normalized. Now a miss is logged, not lost.
 *
 * Usage:
 *   const { EventResolver } = require('../../shared/event_resolver');
 *   const events = new EventResolver();
 *   await events.load(supabase);                 // once, before importing
 *   ...
 *   event_type_id: events.resolve(r.event_name)  // per result row
 *   ...
 *   await events.flushUnmapped(supabase);        // once, after importing
 */
class EventResolver {
  constructor() {
    this.map = new Map();       // normalized raw_name -> event_type_id
    this.unmapped = new Map();  // original raw_name -> miss count (this run)
    this.loaded = false;
  }

  _key(name) {
    return (name == null ? '' : String(name)).trim().toLowerCase();
  }

  /** Load the full event_aliases table into memory. Returns the alias count. */
  async load(supabase) {
    this.map.clear();
    let from = 0;
    const page = 1000;
    for (;;) {
      const { data, error } = await supabase
        .from('event_aliases')
        .select('raw_name, event_type_id')
        .range(from, from + page - 1);
      if (error) throw new Error(`event_aliases load failed: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const a of data) this.map.set(this._key(a.raw_name), a.event_type_id);
      if (data.length < page) break;
      from += page;
    }
    this.loaded = true;
    return this.map.size;
  }

  /**
   * Resolve a raw event name to its event_type_id, or null if unknown.
   * Unknown names are recorded for flushUnmapped() to persist.
   */
  resolve(rawName) {
    if (!this.loaded) throw new Error('EventResolver.resolve() called before load()');
    const k = this._key(rawName);
    if (k && this.map.has(k)) return this.map.get(k);
    if (rawName != null && String(rawName).trim() !== '') {
      this.unmapped.set(rawName, (this.unmapped.get(rawName) || 0) + 1);
    }
    return null;
  }

  /** Count of distinct unknown event names seen this run. */
  get unmappedCount() {
    return this.unmapped.size;
  }

  /**
   * Persist this run's unknown event names to `unmapped_events`, summing seen_count
   * for names already logged. Returns the number of distinct names flushed.
   */
  async flushUnmapped(supabase) {
    const entries = [...this.unmapped.entries()];
    for (const [raw_name, count] of entries) {
      const { data: existing } = await supabase
        .from('unmapped_events')
        .select('seen_count')
        .eq('raw_name', raw_name)
        .maybeSingle();
      if (existing) {
        await supabase
          .from('unmapped_events')
          .update({ seen_count: existing.seen_count + count })
          .eq('raw_name', raw_name);
      } else {
        await supabase
          .from('unmapped_events')
          .insert({ raw_name, seen_count: count });
      }
    }
    const flushed = this.unmapped.size;
    this.unmapped.clear();
    return flushed;
  }
}

module.exports = { EventResolver };
