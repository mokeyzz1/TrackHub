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
 * with their athletic_net_url + gender for later linking). Runs on Node 22+ (puppeteer/supabase).
 *
 *   node import_meet_results.js <db_meet_id>              # DRY RUN (reports mapping quality)
 *   node import_meet_results.js <db_meet_id> --commit --control-plane # controlled write
 *   node import_meet_results.js <db_meet_id> --json f.json --limit 4   # use a cached scrape
 */
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { EventResolver } = require('../shared/event_resolver');
const { parseName } = require('../shared/name_parser');
const { AthleticNetMeetScraper } = require('./scrape_meet_results');
const { ControlledIngestion } = require('../shared/controlled_ingestion');
const { normalizeSourceRows } = require('../shared/source_observation_adapter');
const { TeamAliasResolver } = require('../shared/team_alias_resolver');
const { AthleteAliasResolver } = require('../shared/athlete_alias_resolver');
const { requireControlledCommit } = require('../shared/write_mode_guard');
const { ensureIngestDatabaseUrl } = require('../shared/private_database_url');
const { loadSourceAthleteIdentityResolver } = require('../shared/source_athlete_identity_resolver');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const UNATTACHED = 1835;

// Mark parsing lives in scrapers/shared/mark_parser.js — see the header there.
// The local copy that used to sit here did `const [mm, ss] = clean.split(':')`, which on
// "1:05:37.73" binds mm="1", ss="05" and returned 65 SECONDS for a 65-minute run. Six rows in the
// database carried that (repaired 2026-08-19 by scrapers/backfill-mark-seconds.js). One shared
// implementation now, so the two engines cannot drift apart again.
const { parseMark } = require('../shared/mark_parser');

function countScrapedObservations(scraped, relayStats = {}) {
  const individualRows = (scraped?.events || []).reduce(
    (total, event) => total + (event.results || []).filter(result => !result.is_relay && result.athlete_name && result.athlete_name.trim()).length,
    0
  );
  return individualRows + Number(relayStats.relays || 0);
}

function environmentFor(season) {
  const s = (season || '').toLowerCase();
  if (s.startsWith('indoor')) return 'indoor';
  if (s.startsWith('outdoor')) return 'outdoor';
  if (s.startsWith('xc')) return 'xc';
  return null;
}

const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

function eventsForImportMode(events, relaysOnly) {
  const sourceEvents = Array.isArray(events) ? events : [];
  if (!relaysOnly) return sourceEvents;
  return sourceEvents.filter(event => (event.results || []).some(result => result.is_relay));
}

/**
 * Build athlete lookups scoped to THIS meet's athletes (fast + avoids re-creating dupes):
 *   byAnet:  athletic.net id -> athlete_id           (exact identity match)
 *   byName:  lower(full_name)|GENDER -> [athlete_id] (fallback for existing athletes that
 *            don't yet have an athletic_net_url stored — 45% of them don't)
 */
async function loadExisting(anetIds, names, ingestPool = null) {
  const byAnet = new Map();
  const blockedAnet = new Set();
  const byName = new Map();
  const add = (m, k, id) => { if (!m.has(k)) m.set(k, []); m.get(k).push(id); };
  // 1. stable source identity. Reviewed aliases/external IDs take precedence over the legacy
  //    single athletic_net_url column so a secondary profile keeps resolving after consolidation.
  const sourceKeys = [...new Set(anetIds.map(id => String(id || '').trim()).filter(Boolean))];
  for (const c of chunk(sourceKeys, 1000)) {
    const resolver = await loadSourceAthleteIdentityResolver({
      pool: ingestPool,
      source: 'athletic_net',
      sourceKeys: c
    });
    for (const id of c) {
      const resolved = resolver.resolve(id);
      if (resolved) byAnet.set(id, { id: resolved.athlete_id, school_id: resolved.school_id });
      else if (resolver.hasConflict(id)) blockedAnet.add(id);
    }
  }
  // 2. name matches (for the fallback) — carry the school name for team corroboration
  const uniqueNames = [...new Set(names.map(name => String(name || '').trim()).filter(Boolean))];
  const exactNameKeys = new Set();
  // Most source names preserve the database casing. Use the indexed equality lookup first;
  // the old all-ILIKE batches were expensive on large meets and could hit statement_timeout.
  for (const c of chunk(uniqueNames, 200)) {
    const { data, error } = await supabase.from('athletes')
      .select('athlete_id, full_name, gender, school_id, schools(official_name, short_name)')
      .in('full_name', c);
    if (error) throw new Error(`athlete lookup failed: ${error.message}`);
    data?.forEach(a => {
      exactNameKeys.add(String(a.full_name || '').toLowerCase());
      add(byName, `${(a.full_name || '').toLowerCase()}|${a.gender || ''}`, {
        id: a.athlete_id,
        school_id: a.school_id,
        school: a.schools ? `${a.schools.official_name || ''} ${a.schools.short_name || ''}` : '',
      });
    });
  }

  // A small case-insensitive fallback preserves matching for source casing differences without
  // constructing a large OR predicate over hundreds of names.
  const caseInsensitiveNames = uniqueNames.filter(name => !exactNameKeys.has(name.toLowerCase()));
  for (const c of chunk(caseInsensitiveNames, 10)) {
    const filter = athleteNameFilter(c);
    if (!filter) continue;
    const { data, error } = await supabase.from('athletes')
      .select('athlete_id, full_name, gender, school_id, schools(official_name, short_name)')
      .or(filter);
    if (error) throw new Error(`athlete lookup failed: ${error.message}`);
    data?.forEach(a => add(byName, `${(a.full_name || '').toLowerCase()}|${a.gender || ''}`, {
      id: a.athlete_id,
      school_id: a.school_id,
      school: a.schools ? `${a.schools.official_name || ''} ${a.schools.short_name || ''}` : '',
    }));
  }
  return { byAnet, byName, blockedAnet };
}

async function loadTeamLookup() {
  const { data, error } = await supabase
    .from('teams')
    .select('team_id, school_id, gender, schools(official_name, short_name)');
  if (error) throw new Error(`team lookup failed: ${error.message}`);

  const bySchoolGender = new Map();
  for (const row of data || []) {
    const school = row.schools || {};
    bySchoolGender.set(`${row.school_id}|${row.gender}`, {
      teamId: row.team_id,
      schoolName: `${school.official_name || ''} ${school.short_name || ''}`.trim()
    });
  }
  return bySchoolGender;
}

// Does the scraped team ("Bethel (Minn.)") plausibly name the athlete's school
// ("Bethel University")? Corroboration = they share a distinctive token. Generic words don't
// count, so "Saint Mary" can never corroborate "Saint John" on "saint" alone.
const SCHOOL_GENERIC = new Set([
  'university', 'college', 'univ', 'state', 'the', 'of', 'and', 'saint', 'community', 'valley'
]);
function schoolTokens(s) {
  return new Set(String(s || '').toLowerCase().replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, ' ')
    .split(' ').filter(t => t.length >= 4 && !SCHOOL_GENERIC.has(t)));
}
function schoolCorroborates(scrapedTeam, schoolText) {
  const a = schoolTokens(scrapedTeam), b = schoolTokens(schoolText);
  for (const t of a) if (b.has(t)) return true;
  return false;
}

function quotedPostgrestValue(value) {
  return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function athleteNameFilter(names) {
  return [...new Set(names.map(name => String(name || '').trim()).filter(Boolean))]
    .map(name => `full_name.ilike.${quotedPostgrestValue(name)}`)
    .join(',');
}

/**
 * Resolve a duplicate-prone name safely. A same-name row is only claimable when exactly one
 * candidate's recorded school corroborates the source team. Unattached/other-school duplicates
 * do not block the known-school candidate; two candidates at the same school still quarantine.
 */
function resolveExistingAthlete({ name, gender, scrapedTeam }, byName) {
  const nameHits = byName.get(`${String(name || '').toLowerCase()}|${gender || ''}`) || [];
  if (!nameHits.length) return { athleteId: null, schoolId: null, reason: 'no_name_match' };

  const schoolHits = nameHits.filter(hit => schoolCorroborates(scrapedTeam, hit.school));
  if (schoolHits.length === 1) {
    return {
      athleteId: schoolHits[0].id,
      schoolId: schoolHits[0].school_id,
      reason: 'name_school'
    };
  }
  if (schoolHits.length > 1) {
    return { athleteId: null, schoolId: null, reason: 'ambiguous_school' };
  }
  if (nameHits.length === 1) {
    return { athleteId: null, schoolId: null, reason: 'no_school_corroboration' };
  }
  return { athleteId: null, schoolId: null, reason: 'ambiguous_name' };
}

function resolveIndividualTeam({ schoolId, scrapedTeam, gender }, teamBySchoolGender) {
  if (!schoolId || !scrapedTeam || !gender) return null;
  const candidate = teamBySchoolGender?.get(`${schoolId}|${gender}`);
  if (!candidate || !schoolCorroborates(scrapedTeam, candidate.schoolName)) return null;
  return candidate.teamId;
}

const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

// Cross-source mark normalisation now lives in scrapers/shared/result_fingerprint.js. This copy
// was correct; the TFRRS importer's was not (it compared RAW marks, so "45.15a" never matched
// "45.15"), and that disagreement is what duplicated 1,252 rows across 243 meets. One definition.
const { normaliseMarkKey: normMark } = require('../shared/result_fingerprint');

/**
 * Existing-result fingerprints for these athletes around the meet dates — the duplicate-result
 * guard. Some "empty" meets already have their results in the DB as TFRRS athlete-history rows
 * (often with meet_id NULL, which is why the meet looks empty). Key: athlete|event_type|mark.
 */
async function loadFingerprints(athleteIds, from, to) {
  const map = new Map();
  for (const c of chunk([...new Set(athleteIds)], 150)) {
    const { data } = await supabase.from('results')
      .select('result_id, athlete_id, event_type_id, mark_raw, date, meet_id')
      .in('athlete_id', c).gte('date', from).lte('date', to);
    data?.forEach(r => {
      const k = `${r.athlete_id}|${r.event_type_id}|${normMark(r.mark_raw)}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    });
  }
  return map;
}

/**
 * Import relay rows into relay_results + relay_athletes.
 *
 * Relay rows have the TEAM as the competitor (no individual athlete), which is why the original
 * bridge dropped them as "blank" and no relays ever landed. Each row carries the team plus its
 * ordered legs (athlete name + athletic.net id).
 *
 * TEAM RESOLUTION: `teams.athletic_net_url` is empty and school names are inconsistent
 * ("Saint John's (Minn.)" vs "St. John's"), so name matching alone is unreliable. Instead we
 * derive the team from the relay's OWN LEGS — resolve the leg athletes (which we match well by
 * athletic.net id), then take the school they agree on and find that school's team for the
 * event's gender. Falls back to a normalized school-name match.
 */
async function importRelays(meet, relayEvents, events, resolveAthlete, { commit, controlled = false }) {
  if (!relayEvents.length) {
    return { relays: 0, inserted: 0, legs: 0, dupSkipped: 0, noTeam: 0, controlledRows: [] };
  }

  // school lookup for the name fallback
  const { data: schoolRows } = await supabase.from('schools').select('school_id, official_name, short_name');
  const norm = s => String(s || '').toLowerCase().replace(/\s*-\s*[a-d]$/i, '')  // strip relay squad " - A"
    .replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const schoolByName = new Map();
  (schoolRows || []).forEach(s => {
    [s.official_name, s.short_name].filter(Boolean).forEach(n => {
      const k = norm(n); if (k && !schoolByName.has(k)) schoolByName.set(k, s.school_id);
    });
  });

  // team lookup: school + gender -> team_id
  const { data: teamRows } = await supabase.from('teams').select('team_id, school_id, gender');
  const teamBySchoolGender = new Map();
  (teamRows || []).forEach(t => teamBySchoolGender.set(`${t.school_id}|${t.gender}`, t.team_id));

  // existing relays for this meet (dedup + idempotent re-runs)
  const { data: existingRelays } = await supabase.from('relay_results')
    .select('relay_result_id, event_type_id, team_id, mark_raw').eq('meet_id', meet.meet_id);
  // normMark on BOTH sides: TFRRS stores "3:17.58" where athletic.net serves "3:17.58a", so a
  // raw comparison treats the same race as new and duplicates the whole field. Caught 2026-08-14
  // by a dry run that reported only 4 of 87 existing relays as already present.
  const relayIdByKey = new Map((existingRelays || []).map(r => [`${r.event_type_id}|${r.team_id}|${normMark(r.mark_raw)}`, r.relay_result_id]));

  // Existing per-leg rows in `results`. THIS MATTERS: the app builds a meet's event list from
  // `results` (getEventsByMeetWithGender), so a relay only shows up in the app if each leg also
  // has a row there — that's what the TFRRS importer does. Without it the relay exists in
  // relay_results but there is nothing for the user to click.
  const { data: existingLegRows } = await supabase.from('results')
    .select('athlete_id, event_type_id, mark_raw').eq('meet_id', meet.meet_id);
  const seenLegRow = new Set((existingLegRows || []).map(r => `${r.athlete_id}|${r.event_type_id}|${normMark(r.mark_raw)}`));

  const stats = { relays: 0, inserted: 0, legs: 0, dupSkipped: 0, noTeam: 0,
    controlledRows: [] };

  for (const ev of relayEvents) {
    const etid = events.resolve(ev.eventCode);
    const gender = ev.gender === 'f' ? 'F' : 'M';
    for (const r of (ev.results || [])) {
      stats.relays++;
      // resolve legs first — they also tell us the team
      const legs = [];
      const schoolVotes = new Map();
      for (const leg of (r.legs || [])) {
        const a = resolveAthlete({
          anetId: leg.athletic_net_athlete_id,
          name: leg.athlete_name,
          gender,
          scrapedTeam: r.team_name
        });
        legs.push({ ...leg, athlete_id: a.athleteId });
        if (a.schoolId && a.schoolId !== UNATTACHED) schoolVotes.set(a.schoolId, (schoolVotes.get(a.schoolId) || 0) + 1);
      }
      let schoolId = [...schoolVotes.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || null;
      if (!schoolId) schoolId = schoolByName.get(norm(r.team_name)) || null;   // name fallback
      const teamId = schoolId ? (teamBySchoolGender.get(`${schoolId}|${gender}`) || null) : null;
      if (!teamId) stats.noTeam++;

      const key = `${etid}|${teamId}|${normMark(r.mark_raw)}`;
      const alreadyHave = relayIdByKey.has(key);
      if (alreadyHave) stats.dupSkipped++;

      if (controlled) {
        // The control-plane writer owns the transaction and provenance link. Keep this source
        // row intact, including the ordered legs, and let unresolved legs quarantine individually.
        stats.controlledRows.push({
          meet_id: meet.meet_id,
          source_meet_key: String(meet.meet_id),
          event_id: ev.eventCode,
          event_name: ev.eventCode,
          team_id: teamId,
          athletic_net_team_id: r.athletic_net_team_id || null,
          team_name: r.team_name,
          team_gender: gender,
          source_team_key: r.source_team_key || r.athletic_net_team_id || r.team_name || null,
          source_team_name: r.team_name || null,
          mark_raw: r.mark_raw,
          mark_seconds: parseMark(r.mark_raw).mark_seconds,
          place: parseInt(r.place, 10) || null,
          meet_name: meet.name,
          date: meet.date,
          round: r.round || 'Finals',
          is_relay: true,
          environment: environmentFor(meet.season),
          relay_athletes: legs
        });
        continue;
      }

      // per-leg rows for `results` — what makes the relay visible in the app's event list
      const legResultRows = legs
        .filter(l => l.athlete_id && !seenLegRow.has(`${l.athlete_id}|${etid}|${normMark(r.mark_raw)}`))
        .map(l => {
          seenLegRow.add(`${l.athlete_id}|${etid}|${normMark(r.mark_raw)}`);
          return {
            athlete_id: l.athlete_id, team_id: teamId,
            event_name: ev.eventCode, event_type_id: etid,
            mark_raw: r.mark_raw, mark_seconds: parseMark(r.mark_raw).mark_seconds,
            place: parseInt(r.place, 10) || null, round: r.round || null,
            meet_name: meet.name, meet_id: meet.meet_id, date: meet.date,
            environment: environmentFor(meet.season),
          };
        });

      if (!commit) {
        if (!alreadyHave) { stats.inserted++; stats.legs += legs.length; }
        stats.legResultRows = (stats.legResultRows || 0) + legResultRows.length;
        continue;
      }

      let relayResultId = relayIdByKey.get(key) || null;
      if (!alreadyHave) {
        const { data: ins, error } = await supabase.from('relay_results').insert({
          team_id: teamId, event_name: ev.eventCode, event_type_id: etid,
          mark_raw: r.mark_raw, mark_seconds: parseMark(r.mark_raw).mark_seconds,
          place: parseInt(r.place, 10) || null,
          // ROUND: athletic.net publishes NO round information for relays -- verified 2026-08-14
          // against meet 640046 (NCAA DII Outdoor): the payload has no heat/prelim/final/section
          // field anywhere, just one row per team with place, mark, points and legs.
          // Leaving it NULL is worse than wrong: the app GROUPS relays by round, so a round-less
          // row is invisible on screen even though it looks repaired in the database (this cost a
          // rollback of 44 rows on meet 13142). A list of places 1..N with points awarded IS the
          // final standing, so 'Finals' is the honest label. TFRRS, where available, gives real
          // Finals/Preliminaries/Heat N and should be preferred -- see repair-timeless-4x100.js.
          round: r.round || 'Finals',
          meet_name: meet.name, meet_id: meet.meet_id, date: meet.date,
        }).select('relay_result_id').single();
        if (error) { console.log(`    relay insert error: ${error.message}`); continue; }
        relayResultId = ins.relay_result_id;
        relayIdByKey.set(key, relayResultId);
        stats.inserted++;

        const legRows = legs.filter(l => l.athlete_name).map(l => ({
          relay_result_id: relayResultId,
          athlete_id: l.athlete_id || null,
          athlete_name: l.athlete_name,
          leg_order: l.leg_order,
        }));
        if (legRows.length) {
          const { error: le } = await supabase.from('relay_athletes').insert(legRows);
          if (le) console.log(`    relay_athletes error: ${le.message}`);
          else stats.legs += legRows.length;
        }
      }

      if (legResultRows.length) {
        const { error: re } = await supabase.from('results').insert(legResultRows);
        if (re) console.log(`    relay leg results error: ${re.message}`);
        else stats.legResultRows = (stats.legResultRows || 0) + legResultRows.length;
      }
    }
  }
  return stats;
}

async function run(meetDbId, {
  commit = false,
  jsonFile = null,
  limit = 0,
  relaysOnly = false,
  controlPlane = false,
  legacyDirectWrite = false,
  sourceUrl = null,
} = {}) {
  if (controlPlane) ensureIngestDatabaseUrl();
  requireControlledCommit({
    commit,
    controlPlane,
    legacyDirectWrite,
    importer: 'athletic.net importer'
  });

  // 1. the DB meet we're importing into
  const { data: meet, error: me } = await supabase
    .from('meets').select('meet_id, name, date, end_date, season, athletic_net_results_url, meet_url')
    .eq('meet_id', meetDbId).single();
  if (me || !meet) throw new Error(`meet ${meetDbId} not found: ${me?.message}`);
  const target = sourceUrl || meet.athletic_net_results_url || meet.meet_url;
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

  // Relay-only recovery must not preload or resolve the meet's individual athletes. Apart from
  // wasting work, doing so made large relay candidates hit the database statement timeout before
  // the relay rows were even translated.
  const importEvents = eventsForImportMode(scraped.events, relaysOnly);

  // 3. preload translators + athlete lookups scoped to this meet
  const events = new EventResolver(); await events.load(supabase);
  const scrapedIds = [], scrapedNames = [];
  for (const ev of importEvents) for (const r of (ev.results || [])) {
    if (r.athletic_net_athlete_id) scrapedIds.push(r.athletic_net_athlete_id);
    if (r.athlete_name && r.athlete_name.trim()) scrapedNames.push(r.athlete_name);
    for (const leg of (r.legs || [])) {           // relay legs are athletes too
      if (leg.athletic_net_athlete_id) scrapedIds.push(leg.athletic_net_athlete_id);
      if (leg.athlete_name) scrapedNames.push(leg.athlete_name);
    }
  }
  const { byAnet, byName, blockedAnet } = await loadExisting(scrapedIds, scrapedNames);
  const teamBySchoolGender = await loadTeamLookup();
  console.log(`Existing matches available: ${byAnet.size} by athletic.net id, ${byName.size} name/gender keys\n`);

  // 4. translate
  const env = environmentFor(meet.season);
  const rows = [];
  const stats = { events: importEvents.length, results: 0, evResolved: 0, evMissed: {},
    matchAnet: 0, matchName: 0, athNew: 0, teamMatched: 0, teamUnresolved: 0,
    markParsed: 0, skippedBlank: 0 };
  const newAthletes = new Map();  // key -> athlete payload (created on commit)
  const backfillAnet = new Map(); // athlete_id -> athletic_net_url (link existing on name-match)

  for (const ev of importEvents) {
    const etid = events.resolve(ev.eventCode);
    if (etid) stats.evResolved++; else stats.evMissed[ev.eventCode] = (stats.evMissed[ev.eventCode] || 0) + 1;
    const gender = ev.gender === 'f' ? 'F' : ev.gender === 'm' ? 'M' : null;
    for (const r of (ev.results || [])) {
      if (r.is_relay) continue;                    // handled by importRelays() below
      if (!r.athlete_name || !r.athlete_name.trim()) { stats.skippedBlank++; continue; } // empty rows
      stats.results++;
      // AthleticLIVE's competitor key is not an AthleticNET profile ID. Only the
      // HTML parser's profile-link ID is safe to turn into an athletic.net URL.
      const anetId = r.athletic_net_athlete_id;
      const sourceAthleteKey = r.source_athlete_key || anetId || null;
      const anetUrl = anetId ? `https://www.athletic.net/athlete/${anetId}/track-and-field` : null;
      let athleteId = null, newKey = null, athleteSchoolId = null;

      // (a) exact athletic.net-id match
      if (anetId && blockedAnet.has(anetId)) {
        stats.identityConflict = (stats.identityConflict || 0) + 1;
      }
      else if (anetId && byAnet.has(anetId)) {
        const match = byAnet.get(anetId);
        athleteId = match.id;
        athleteSchoolId = match.school_id;
        stats.matchAnet++;
      }
      else {
        // (b) fallback: use the one same-name candidate whose school corroborates the source
        // team. Older unattached duplicates do not block a known-school match, but two candidates
        // at the same school remain ambiguous and are quarantined.
        const resolved = resolveExistingAthlete({
          name: r.athlete_name,
          gender,
          scrapedTeam: r.team_name
        }, byName);
        if (resolved.athleteId) {
          athleteId = resolved.athleteId; stats.matchName++;
          athleteSchoolId = resolved.schoolId;
          if (anetUrl && !backfillAnet.has(athleteId)) backfillAnet.set(athleteId, anetUrl); // link them going forward
        } else {
          if (resolved.reason === 'no_school_corroboration') {
            stats.nameRejectedNoSchool = (stats.nameRejectedNoSchool || 0) + 1;
          }
          if (resolved.reason === 'ambiguous_school' || resolved.reason === 'ambiguous_name') {
            stats.nameRejectedAmbiguous = (stats.nameRejectedAmbiguous || 0) + 1;
          }
          // (c) genuinely new (unmatched) OR ambiguous name -> create keyed by anet id/name
          stats.athNew++;
          newKey = anetId ? 'a:' + anetId : sourceAthleteKey ? 's:' + sourceAthleteKey : 'n:' + r.athlete_name + '|' + (gender || '');
          if (!newAthletes.has(newKey)) newAthletes.set(newKey, {
            full_name: r.athlete_name, ...(parseName(r.athlete_name) || {}),
            gender, school_id: UNATTACHED, is_active: true, athletic_net_url: anetUrl,
          });
        }
      }

      const mk = parseMark(r.mark_raw);
      if (mk.mark_seconds != null || mk.mark_meters != null) stats.markParsed++;
      const teamId = resolveIndividualTeam({
        schoolId: athleteSchoolId,
        scrapedTeam: r.team_name,
        gender
      }, teamBySchoolGender);
      if (teamId) stats.teamMatched++; else stats.teamUnresolved++;
      rows.push({
        _newKey: newKey, athlete_id: athleteId, team_id: teamId, event_type_id: etid, meet_id: meet.meet_id,
        athletic_net_athlete_id: anetId,
        source_athlete_key: sourceAthleteKey,
        athlete_name: r.athlete_name || null,
        // Preserve source team identity for the shared control-plane resolver. The legacy
        // bridge only carried athlete/event fields, which made athletic.net observations lose
        // team context before verified aliases could be applied.
        athletic_net_team_id: r.athletic_net_team_id || null,
        source_team_key: r.source_team_key || r.athletic_net_team_id || null,
        team_name: r.team_name || null,
        team_gender: gender,
        source_meet_key: String(meet.meet_id),
        event_name: ev.eventCode, mark_raw: r.mark_raw, ...mk,
        wind: r.wind, place: parseInt(r.place, 10) || null, round: r.round || null, date: meet.date,
        meet_name: meet.name, is_pr: !!r.is_pr, environment: env,
      });
    }
  }

  // 4b. duplicate-result guard: check matched athletes' existing rows near the meet dates.
  // Existing row with NULL meet_id = the same performance from a TFRRS athlete-history scrape
  // -> CLAIM it (just set meet_id, no new row). Already linked (incl. re-runs) -> SKIP.
  const fpFrom = addDays(meet.date, -7), fpTo = addDays(meet.end_date || meet.date, 7);
  const fp = await loadFingerprints(rows.filter(r => r.athlete_id).map(r => r.athlete_id), fpFrom, fpTo);
  let claims = [], dupSkips = 0;
  for (const r of rows) {
    if (!r.athlete_id) continue; // brand-new athletes can't have pre-existing results
    const hits = fp.get(`${r.athlete_id}|${r.event_type_id}|${normMark(r.mark_raw)}`) || [];
    if (!hits.length) continue;
    const claimable = hits.find(h => h.meet_id == null);
    if (claimable) { r._claim = claimable.result_id; claims.push(claimable.result_id); }
    else { r._skip = true; dupSkips++; }
  }

  // 4c. relays — same athlete-matching cascade, but the competitor is a team with ordered legs
  const resolveAthlete = ({ anetId, name, gender, scrapedTeam }) => {
    if (anetId && blockedAnet.has(anetId)) {
      return { athleteId: null, schoolId: null };
    }
    if (anetId && byAnet.has(anetId)) {
      const hit = byAnet.get(anetId);
      return { athleteId: hit.id, schoolId: hit.school_id };
    }
    const resolved = resolveExistingAthlete({ name, gender, scrapedTeam }, byName);
    if (resolved.athleteId) return { athleteId: resolved.athleteId, schoolId: resolved.schoolId };
    return { athleteId: null, schoolId: null };     // ambiguous/new — leg keeps its name only
  };
  const relayEvents = importEvents.filter(ev => (ev.results || []).some(r => r.is_relay));
  const relayStats = await importRelays(meet, relayEvents, events, resolveAthlete, {
    commit,
    controlled: controlPlane
  });

  // 5. report
  console.log(`=== ${commit ? 'COMMIT' : 'DRY RUN'} — translation report ===`);
  console.log(`  events: ${stats.events} (event_type_id resolved: ${stats.evResolved}${Object.keys(stats.evMissed).length ? ', MISSED: ' + JSON.stringify(stats.evMissed) : ''})`);
  console.log(`  results: ${stats.results} | marks parsed: ${stats.markParsed} | blank rows skipped: ${stats.skippedBlank}`);
  console.log(`  athletes: matched by athletic.net id = ${stats.matchAnet} | matched by name+school = ${stats.matchName} | name-only REJECTED (no school corroboration) = ${stats.nameRejectedNoSchool || 0} | NEW = ${stats.athNew} (${newAthletes.size} distinct)`);
  if (stats.identityConflict) console.log(`  athlete identity conflicts held without creation = ${stats.identityConflict}`);
  console.log(`  teams: matched by athlete school + scraped team corroboration = ${stats.teamMatched} | unresolved = ${stats.teamUnresolved}`);
  console.log(`  duplicate-result guard: ${claims.length} existing history rows will be CLAIMED (meet_id set, no new row) | ${dupSkips} exact dups skipped`);
  console.log(`  (${backfillAnet.size} existing athletes will get their athletic.net url linked)`);
  console.log(`  RELAYS: ${relayStats.relays} rows across ${relayEvents.length} relay events -> ${relayStats.inserted} relay_results, ${relayStats.legs} legs, ${relayStats.legResultRows || 0} leg rows in results (makes relays visible in the app) | ${relayStats.dupSkipped} already present | ${relayStats.noTeam} without a resolved team`);
  console.log('\n  sample rows:');
  rows.slice(0, 4).forEach(r => console.log(`   ${r.place}. et=${r.event_type_id} ath=${r.athlete_id || 'NEW'} ${r.event_name} ${r.mark_raw}->${r.mark_seconds ?? r.mark_meters} wind=${r.wind}`));

  const stageControlPlane = async (commitMode) => {
    const sourceRows = relaysOnly ? relayStats.controlledRows : [...rows, ...relayStats.controlledRows];
    const controlled = new ControlledIngestion();
    let teamAliases;
    let athleteAliases;
    try {
      teamAliases = await TeamAliasResolver.load(controlled.store.pool, 'athletic_net');
      athleteAliases = await AthleteAliasResolver.load(controlled.store.pool, 'athletic_net');
    } catch (error) {
      if (controlled.ownsStore) await controlled.store.close();
      throw error;
    }
    const records = normalizeSourceRows('athletic_net', sourceRows, events, {
      teamResolver: teamAliases,
      athleteResolver: athleteAliases
    });
    const outcome = await controlled.run({
      source: 'athletic_net',
      mode: commitMode ? 'commit' : 'dry_run',
      scope: {
        meet_id: meet.meet_id,
        source_url: target,
        source_status: scraped.source_status || (countScrapedObservations(scraped, relayStats) ? 'results_available' : 'empty'),
        relays_only: relaysOnly,
        source_observation_count: countScrapedObservations(scraped, relayStats),
        source_relay_observation_count: relayStats.relays || 0,
      },
      parserVersion: 'athletic-net-html-v2',
      records,
      commit: commitMode
    });
    console.log(`\nCONTROL PLANE RUN ${outcome.runId}`);
    console.log(`  staged=${outcome.staged_observations} inserted=${outcome.inserted || 0} claimed=${outcome.claimed || 0} skipped=${outcome.skipped || 0} quarantined=${outcome.quarantined || 0}`);
    if (events.unmappedCount > 0 && commitMode) await events.flushUnmapped(supabase);
    return outcome;
  };

  // Control-plane dry runs intentionally persist their observations for audit/review, but they
  // never create athletes or public facts. This branch occurs before the legacy write path.
  if (controlPlane && !commit) {
    const outcome = await stageControlPlane(false);
    return {
      imported: 0,
      errors: outcome.quarantined || 0,
      skipped: outcome.skipped || 0,
      relaysImported: 0,
      relayErrors: 0,
      runId: outcome.runId
    };
  }

  // Controlled commits must go through the canonical writer before any legacy public-athlete
  // creation path. Otherwise an unresolved source identity could create an unattached athlete
  // here and bypass the quarantine boundary this mode is designed to enforce.
  if (controlPlane) {
    const outcome = await stageControlPlane(true);
    if (outcome.quarantined) process.exitCode = 1;
    return {
      imported: outcome.inserted || 0,
      errors: outcome.quarantined || 0,
      skipped: outcome.skipped || 0,
      relaysImported: outcome.relayParents || 0,
      relayErrors: 0,
      runId: outcome.runId
    };
  }

  if (!commit) { console.log('\n(dry run — pass --commit to write)'); return; }

  // 6a. link athletic.net url onto existing athletes matched by name (prevents future dupes)
  if (backfillAnet.size) {
    console.log(`\nLinking athletic.net url to ${backfillAnet.size} existing athletes...`);
    for (const [aid, url] of backfillAnet) {
      await supabase.from('athletes').update({ athletic_net_url: url }).eq('athlete_id', aid).is('athletic_net_url', null);
    }
  }

  // 6b. create genuinely-new athletes, backfill their ids, insert results, mark the meet
  console.log('Creating new athletes...');
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

  // RELAYS-ONLY MODE. Added 2026-08-14 for the timeless-4x100 repair (M1).
  // 463 meets have a 4x100 where every row is a status code, because the old parser required
  // MM:SS and dropped sub-minute times (39.30). 412 of those have a WORKING 4x400 at the same
  // meet, proving the page scraped fine and only the short relay broke. The parser is fixed, but
  // the meets are already populated, so neither importer will revisit them -- both skip non-empty
  // meets by design, which is correct and is what prevents duplicate disasters.
  //
  // This mode adds ONLY missing relay rows. It must never touch individual results here: these
  // meets are usually TFRRS-sourced, and the dedup guard keys on mark_raw, where athletic.net
  // writes "39.30a" against TFRRS's "39.30" -- so a cross-source individual insert would slip
  // straight past it. importRelays() has its own (event_type + team + mark) guard.
  if (relaysOnly) {
    console.log(`RELAYS-ONLY: skipping ${claims.length} claims and ${rows.length} individual results.`);
    console.log(`\nDONE (relays only): ${relayStats && relayStats.inserted != null ? relayStats.inserted : 'see above'} relay rows handled.`);
    return;
  }

  // claim existing athlete-history rows (link, don't duplicate)
  if (claims.length) {
    console.log(`Claiming ${claims.length} existing history rows (setting meet_id)...`);
    for (const c of chunk(claims, 200)) {
      await supabase.from('results').update({ meet_id: meet.meet_id }).in('result_id', c).is('meet_id', null);
    }
  }

  const insertable = rows.filter(r => r.athlete_id && !r._skip && !r._claim)
    .map(({ _newKey, _claim, _skip, ...keep }) => keep);
  console.log(`Inserting ${insertable.length} results...`);
  let imported = 0;
  for (let i = 0; i < insertable.length; i += 500) {
    const { error } = await supabase.from('results').insert(insertable.slice(i, i + 500));
    if (error) console.log(`  results batch error: ${error.message}`); else imported += Math.min(500, insertable.length - i);
  }
  // Do NOT claim 'imported'/'athletic_net' when nothing was actually written.
  // Found 2026-08-12: 31 of 45 meets in a batch scraped cleanly but the athletic.net page had no
  // results posted at all (real case: meet 665605 "TXWES Last Chance" -> 0 event-result links).
  // They were still marked imported with results_source='athletic_net', which (a) lied about
  // provenance -- `results_source` is the provenance record, see CLAUDE.md coexistence rule 2 --
  // and (b) meant they would never be retried if results appeared later.
  const observed = countScrapedObservations(scraped, relayStats);
  if (observed === 0) {
    await supabase.from('meets')
      .update({
        results_status: 'no_results_at_source',
        results_source: null,
        results_imported_at: null,
        results_error: null,
      })
      .eq('meet_id', meet.meet_id);
    console.log(`\nDONE: source page had NO results — meet marked no_results_at_source (not imported).`);
  } else if (imported > 0) {
    await supabase.from('meets').update({ results_status: 'imported', results_source: 'athletic_net', results_imported_at: new Date().toISOString() }).eq('meet_id', meet.meet_id);
    console.log(`\nDONE: imported ${imported} results, created ${created.size} athletes, meet marked imported.`);
  } else {
    console.log(`\nDONE: source returned ${observed} observations already represented in the database; provenance unchanged.`);
  }
}

module.exports = {
  countScrapedObservations,
  eventsForImportMode,
  resolveExistingAthlete,
  run,
  resolveIndividualTeam,
  schoolCorroborates
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const meetDbId = args[0];
  const commit = args.includes('--commit');
  const relaysOnly = args.includes('--relays-only');
  const controlPlane = args.includes('--control-plane');
  const legacyDirectWrite = args.includes('--legacy-direct-write');
  const sIdx = args.indexOf('--source-url'); const sourceUrl = sIdx >= 0 ? args[sIdx + 1] : null;
  const jIdx = args.indexOf('--json'); const jsonFile = jIdx >= 0 ? args[jIdx + 1] : null;
  const lIdx = args.indexOf('--limit'); const limit = lIdx >= 0 ? parseInt(args[lIdx + 1], 10) : 0;
  if (!meetDbId) { console.log('Usage: node import_meet_results.js <db_meet_id> [--commit --control-plane] [--legacy-direct-write] [--source-url URL] [--json f] [--limit N]'); process.exit(1); }
  run(meetDbId, { commit, relaysOnly, controlPlane, legacyDirectWrite, sourceUrl, jsonFile, limit }).catch(e => { console.error('ERROR', e.message); process.exit(1); });
}
