#!/usr/bin/env node
/**
 * athletic.net import BRIDGE — turns scraped results into rows in the `results` table,
 * translating through the hardened shared modules so athletic.net data comes in as clean as
 * everything else.
 *
 *   scraped result (text + athletic.net ids)  -->  results row (internal ids + parsed numbers)
 *     event code   --event_resolver-->  event_type_id
 *     athlete      --athletic_net id / name-->  athlete_id  (found or created)
 *     "10.35a"     --parseMark-->  mark_seconds / mark_meters
 *     meet         -->  meet_id  (the DB meet we're importing)
 *   then stamp results_source='athletic_net', results_status='imported' on the meet.
 *
 * Athlete matching: primary key = athletic.net athlete id (athletes.athletic_net_url holds it,
 * 55% populated). No id match -> created (school matching is deferred; new ones land Unattached
 * with their athletic_net_url + gender for later linking). Runs on Node 20+ (puppeteer/supabase).
 *
 *   node import_meet_results.js <db_meet_id>              # DRY RUN (reports mapping quality)
 *   node import_meet_results.js <db_meet_id> --commit     # write
 *   node import_meet_results.js <db_meet_id> --json f.json --limit 4   # use a cached scrape
 */
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { EventResolver } = require('../shared/event_resolver');
const { parseName } = require('../shared/name_parser');
const { AthleticNetMeetScraper } = require('./scrape_meet_results');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const UNATTACHED = 1835;

const anetIdFromUrl = url => (String(url || '').match(/\/athlete\/(\d+)/) || [])[1] || null;

// "10.35a" -> {mark_seconds:10.35}; "1:52.34" -> {mark_seconds:112.34}; "5.08m" -> {mark_meters:5.08}
function parseMark(raw) {
  if (!raw) return { mark_seconds: null, mark_meters: null };
  const t = String(raw).trim();
  const md = t.match(/(\d+(?:\.\d+)?)\s*m\b/); // field mark in meters
  if (md && !t.includes(':')) return { mark_seconds: null, mark_meters: parseFloat(md[1]) };
  const clean = t.replace(/[^\d:.]/g, ''); // strip 'a'/'c'/etc. timing suffixes
  if (clean.includes(':')) {
    const [mm, ss] = clean.split(':');
    const sec = parseInt(mm, 10) * 60 + parseFloat(ss);
    return { mark_seconds: isNaN(sec) ? null : +sec.toFixed(2), mark_meters: null };
  }
  const f = parseFloat(clean);
  return { mark_seconds: isNaN(f) ? null : f, mark_meters: null };
}

function environmentFor(season) {
  const s = (season || '').toLowerCase();
  if (s.startsWith('indoor')) return 'indoor';
  if (s.startsWith('outdoor')) return 'outdoor';
  if (s.startsWith('xc')) return 'xc';
  return null;
}

async function loadAthleteAnetMap() {
  const map = new Map(); // athletic.net id -> athlete_id
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('athletes').select('athlete_id, athletic_net_url')
      .not('athletic_net_url', 'is', null).range(from, from + 999);
    if (error || !data || data.length === 0) break;
    for (const a of data) { const id = anetIdFromUrl(a.athletic_net_url); if (id) map.set(id, a.athlete_id); }
    if (data.length < 1000) break;
  }
  return map;
}

async function run(meetDbId, { commit = false, jsonFile = null, limit = 0 } = {}) {
  // 1. the DB meet we're importing into
  const { data: meet, error: me } = await supabase
    .from('meets').select('meet_id, name, date, season, athletic_net_results_url, meet_url')
    .eq('meet_id', meetDbId).single();
  if (me || !meet) throw new Error(`meet ${meetDbId} not found: ${me?.message}`);
  const target = meet.athletic_net_results_url || meet.meet_url;
  if (!target) throw new Error(`meet ${meetDbId} has no athletic.net / meet_url to scrape`);
  console.log(`Meet ${meet.meet_id} "${meet.name}" (${meet.date}, ${meet.season})`);
  console.log(`Source: ${target}\n`);

  // 2. get scraped results (cache or live scrape)
  let scraped;
  if (jsonFile) { scraped = JSON.parse(fs.readFileSync(jsonFile, 'utf8')); }
  else {
    const s = new AthleticNetMeetScraper();
    try { scraped = await s.scrapeMeet(target, { limit }); } finally { await s.close(); }
  }

  // 3. preload translators
  const events = new EventResolver(); await events.load(supabase);
  const anetMap = await loadAthleteAnetMap();
  console.log(`Loaded ${anetMap.size.toLocaleString()} athletes with an athletic.net id\n`);

  // 4. translate
  const env = environmentFor(meet.season);
  const rows = [];
  const stats = { events: scraped.events.length, results: 0, evResolved: 0, evMissed: {},
    athMatched: 0, athNew: 0, markParsed: 0 };
  const newAthletes = new Map(); // anetId(or name key) -> athlete payload (created on commit)

  for (const ev of scraped.events) {
    const etid = events.resolve(ev.eventCode);
    if (etid) stats.evResolved++; else stats.evMissed[ev.eventCode] = (stats.evMissed[ev.eventCode] || 0) + 1;
    const gender = ev.gender === 'f' ? 'F' : ev.gender === 'm' ? 'M' : null;
    for (const r of (ev.results || [])) {
      if (!r.athlete_name || !r.athlete_name.trim()) { stats.skippedBlank = (stats.skippedBlank || 0) + 1; continue; } // empty/relay rows
      stats.results++;
      const anetId = r.athletic_net_athlete_id;
      let athleteId = anetId ? anetMap.get(anetId) : null;
      if (athleteId) stats.athMatched++;
      else { stats.athNew++;
        const key = anetId ? 'a:' + anetId : 'n:' + r.athlete_name;
        if (!newAthletes.has(key)) newAthletes.set(key, {
          full_name: r.athlete_name, ...(parseName(r.athlete_name) || {}),
          gender, school_id: UNATTACHED, is_active: true,
          athletic_net_url: anetId ? `https://www.athletic.net/athlete/${anetId}/track-and-field` : null,
        });
      }
      const mk = parseMark(r.mark_raw);
      if (mk.mark_seconds != null || mk.mark_meters != null) stats.markParsed++;
      rows.push({
        _anetId: anetId, _newKey: athleteId ? null : (anetId ? 'a:' + anetId : 'n:' + r.athlete_name),
        athlete_id: athleteId || null, event_type_id: etid, meet_id: meet.meet_id,
        event_name: ev.eventCode, mark_raw: r.mark_raw, ...mk,
        wind: r.wind, place: parseInt(r.place, 10) || null, date: meet.date,
        meet_name: meet.name, is_pr: !!r.is_pr, environment: env,
      });
    }
  }

  // 5. report
  console.log('=== DRY RUN — translation report ===');
  console.log(`  events: ${stats.events} (event_type_id resolved: ${stats.evResolved}${Object.keys(stats.evMissed).length ? ', MISSED: ' + JSON.stringify(stats.evMissed) : ''})`);
  console.log(`  results: ${stats.results} | marks parsed: ${stats.markParsed}`);
  console.log(`  athletes: matched by athletic.net id = ${stats.athMatched} | new (would create) = ${stats.athNew} (${newAthletes.size} distinct)`);
  console.log('\n  sample rows:');
  rows.slice(0, 4).forEach(r => console.log(`   ${r.place}. et=${r.event_type_id} ath=${r.athlete_id || 'NEW'} ${r.event_name} ${r.mark_raw}->${r.mark_seconds ?? r.mark_meters} wind=${r.wind}`));

  if (!commit) { console.log('\n(dry run — pass --commit to write)'); return; }

  // 6. commit: create new athletes, backfill their ids, insert results, mark the meet
  console.log('\nCreating new athletes...');
  const created = new Map();
  const payloads = [...newAthletes.entries()];
  for (let i = 0; i < payloads.length; i += 500) {
    const batch = payloads.slice(i, i + 500);
    const { data, error } = await supabase.from('athletes')
      .insert(batch.map(([, p]) => p)).select('athlete_id, athletic_net_url, full_name');
    if (error) { console.log('  athlete batch error:', error.message); continue; }
    data.forEach((a, idx) => created.set(batch[idx][0], a.athlete_id));
  }
  for (const r of rows) if (!r.athlete_id && r._newKey) r.athlete_id = created.get(r._newKey) || null;

  const insertable = rows.filter(r => r.athlete_id).map(({ _anetId, _newKey, ...keep }) => keep);
  console.log(`Inserting ${insertable.length} results...`);
  let imported = 0;
  for (let i = 0; i < insertable.length; i += 500) {
    const { error } = await supabase.from('results').insert(insertable.slice(i, i + 500));
    if (error) console.log(`  results batch error: ${error.message}`); else imported += Math.min(500, insertable.length - i);
  }
  await supabase.from('meets').update({ results_status: 'imported', results_source: 'athletic_net', results_imported_at: new Date().toISOString() }).eq('meet_id', meet.meet_id);
  console.log(`\nDONE: imported ${imported} results, created ${created.size} athletes, meet marked imported.`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const meetDbId = args[0];
  const commit = args.includes('--commit');
  const jIdx = args.indexOf('--json'); const jsonFile = jIdx >= 0 ? args[jIdx + 1] : null;
  const lIdx = args.indexOf('--limit'); const limit = lIdx >= 0 ? parseInt(args[lIdx + 1], 10) : 0;
  if (!meetDbId) { console.log('Usage: node import_meet_results.js <db_meet_id> [--commit] [--json f] [--limit N]'); process.exit(1); }
  run(meetDbId, { commit, jsonFile, limit }).catch(e => { console.error('ERROR', e.message); process.exit(1); });
}
